const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireRole, RECEPTION_PLUS, R65_CONFIRM_USERS } = require('../middleware/auth');
const { businessDate, audit, alert, nextOrderNumber, tx, httpErr } = require('../lib/helpers');

router.use(requireAuth);

// Overnight checkout deadline: next day 10:00 SAST (UTC+2, no DST) = 08:00 UTC
function overnightDeadline() {
  const sastNow = new Date(Date.now() + 2 * 3600e3);
  return new Date(Date.UTC(sastNow.getUTCFullYear(), sastNow.getUTCMonth(), sastNow.getUTCDate() + 1, 8, 0, 0));
}

// S03 - room grid with live stay info
router.get('/rooms', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT r.*, s.id AS stay_id, s.guest_name, s.stay_type, s.hours_purchased,
           s.check_in_at, s.expires_at, s.amount_due, s.amount_paid
    FROM rooms r
    LEFT JOIN stays s ON s.room_id = r.id AND s.status = 'active'
    ORDER BY r.floor, r.room_number`);
  res.json(rows);
});

// cleaning -> vacant after housekeeping check (also maintenance toggles)
router.patch('/rooms/:id/status', requireRole(RECEPTION_PLUS), async (req, res) => {
  const { status } = req.body;
  if (!['vacant', 'cleaning', 'maintenance'].includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  await tx(async (c) => {
    const cur = await c.query('SELECT status FROM rooms WHERE id=$1 FOR UPDATE', [req.params.id]);
    if (!cur.rowCount) throw Object.assign(new Error('Room not found'), { code: 404 });
    if (cur.rows[0].status === 'occupied') throw Object.assign(new Error('Room is occupied - check the guest out first'), { code: 400 });
    await c.query('UPDATE rooms SET status=$1 WHERE id=$2', [status, req.params.id]);
    await audit(c, req.user.id, 'room_status', 'rooms', req.params.id, { from: cur.rows[0].status, to: status });
  });
  res.json({ ok: true });
});

// S04 - check-in. Hourly (1-5 hrs, paid upfront in full) or overnight (R550, issues R65 meal credit).
// Keys only after payment -> payment is recorded here atomically with the stay.
router.post('/stays', requireRole(RECEPTION_PLUS), async (req, res) => {
  const { room_id, guest_name, signature_ref, stay_type, hours, payment_method, condoms } = req.body;
  const condomQty = Math.max(0, parseInt(condoms || 0, 10));
  if (!room_id || !guest_name || !stay_type) return res.status(400).json({ error: 'room, guest name and stay type are required' });
  if (!['cash', 'card'].includes(payment_method)) return res.status(400).json({ error: 'payment method (cash/card) required - keys only after payment' });
  if (stay_type === 'hourly' && !(hours >= 1 && hours <= 5)) return res.status(400).json({ error: 'Hourly stays are 1-5 hours' });

  try {
    const out = await tx(async (c) => {
      const r = await c.query('SELECT * FROM rooms WHERE id=$1 FOR UPDATE', [room_id]);
      const room = r.rows[0];
      if (!room) throw Object.assign(new Error('Room not found'), { code: 404 });
      if (room.status !== 'vacant') throw Object.assign(new Error(`Room ${room.room_number} is ${room.status}`), { code: 400 });

      const amount = stay_type === 'hourly' ? Number(room.hourly_rate) * hours : Number(room.overnight_rate);
      const bdate = businessDate();
      const stay = (await c.query(
        `INSERT INTO stays (room_id, captured_by, guest_name, signature_ref, stay_type, hours_purchased,
                            expires_at, amount_due, amount_paid)
      VALUES ($1,$2,$3,$4,$5,$6::int, CASE WHEN $5::text='hourly' THEN now() + make_interval(hours => $6::int) ELSE $8::timestamptz END, $7, $7)
         RETURNING *`,
        [room_id, req.user.id, guest_name || null, signature_ref || null, stay_type,
         stay_type === 'hourly' ? hours : null, amount, overnightDeadline()]
      )).rows[0];

      await c.query(`UPDATE rooms SET status='occupied' WHERE id=$1`, [room_id]);
      await c.query(
        `INSERT INTO payments (payable_type,payable_id,method,till,amount,received_by,business_date)
         VALUES ('stay',$1,$2,'guest_house',$3,$4,$5)`,
        [stay.id, payment_method, amount, req.user.id, bdate]);
      // Sundry: condoms bought at check-in - own payment row (keeps room revenue clean), deducts guest-house stock
      if (condomQty > 0) {
        const cond = (await c.query(
          `SELECT id, sell_price FROM stock_items WHERE register='guest_house' AND name='Condom' FOR UPDATE`)).rows[0];
        if (!cond) throw Object.assign(new Error('Condom stock item not set up'), { code: 400 });
        const unit = Number(cond.sell_price);
        if (!(unit > 0)) throw Object.assign(new Error('Condom price not set - set it on the Stock screen'), { code: 400 });
        const sundryAmount = unit * condomQty;
        await c.query(
          `INSERT INTO payments (payable_type,payable_id,method,till,amount,received_by,business_date)
           VALUES ('sundry',$1,$2,'guest_house',$3,$4,$5)`,
          [stay.id, payment_method, sundryAmount, req.user.id, bdate]);
        await c.query(
          `UPDATE stock_items SET current_quantity = current_quantity - $1, updated_at=now() WHERE id=$2`,
          [condomQty, cond.id]);
        await audit(c, req.user.id, 'sundry_sale', 'stays', stay.id, { item: 'Condom', qty: condomQty, unit, amount: sundryAmount });
      }

      let meal_credit = null;
      if (stay_type === 'overnight') {
        // R550 includes TWO R65 plates (R130 total). Cash -> R130 physically walked to the
        // restaurant till (one transfer). Card -> flagged on the kitchen slip, no cash moves.
        const funding = payment_method === 'cash' ? 'cash_walked' : 'card_noted';
        const credits = [];
        for (let i = 0; i < 2; i++) {
          credits.push((await c.query(
            `INSERT INTO meal_credits (stay_id, value, funding_method) VALUES ($1, 65, $2) RETURNING *`,
            [stay.id, funding])).rows[0]);
        }
        meal_credit = credits[0];
        if (funding === 'cash_walked') {
          await c.query(
            `INSERT INTO cash_transfers (from_till,to_till,amount,meal_credit_id,carried_by,business_date)
             VALUES ('guest_house','restaurant',130,$1,$2,$3)`,
            [credits[0].id, req.user.id, bdate]);
        }
      }
      await audit(c, req.user.id, 'check_in', 'stays', stay.id, { room: room.room_number, stay_type, amount });
      return { stay, meal_credit };
    });
    res.status(201).json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

// Active stays for S05
router.get('/stays/active', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*, r.room_number, r.hourly_rate,
      (SELECT COALESCE(json_agg(json_build_object('id',mc.id,'value',mc.value,'funding_method',mc.funding_method,'status',mc.status)),'[]')
       FROM meal_credits mc WHERE mc.stay_id=s.id) AS meal_credits
    FROM stays s JOIN rooms r ON r.id=s.room_id
    WHERE s.status='active' ORDER BY s.check_in_at`);
  res.json(rows);
});

// S05 - top-up: add hours, computed server-side, paid immediately (pay-as-you-go)
router.post('/stays/:id/topup', requireRole(RECEPTION_PLUS), async (req, res) => {
  const { extra_hours, payment_method } = req.body;
  if (!(extra_hours >= 1)) return res.status(400).json({ error: 'extra_hours must be at least 1' });
  if (!['cash', 'card'].includes(payment_method)) return res.status(400).json({ error: 'payment method required' });
  try {
    const out = await tx(async (c) => {
      const s = (await c.query(
        `SELECT s.*, r.hourly_rate FROM stays s JOIN rooms r ON r.id=s.room_id WHERE s.id=$1 FOR UPDATE OF s`,
        [req.params.id])).rows[0];
      if (!s || s.status !== 'active') throw Object.assign(new Error('Active stay not found'), { code: 404 });
      if (s.stay_type !== 'hourly') throw Object.assign(new Error('Top-ups apply to hourly stays'), { code: 400 });

      // If the guest is already overdue, the system determines the
      // overdue hours automatically. The user cannot choose the amount.
      let actualExtraHours = extra_hours;

      if (s.expires_at && new Date() > new Date(s.expires_at)) {
        actualExtraHours = Math.ceil(
          (Date.now() - new Date(s.expires_at).getTime()) / 3600000
        );
      }

      const amount = Number(s.hourly_rate) * actualExtraHours;
      const bdate = businessDate();
      const pay = (await c.query(
        `INSERT INTO payments (payable_type,payable_id,method,till,amount,received_by,business_date)
         VALUES ('stay_topup',$1,$2,'guest_house',$3,$4,$5) RETURNING id`,
        [s.id, payment_method, amount, req.user.id, bdate])).rows[0];
      await c.query(
        `INSERT INTO stay_topups (stay_id,extra_hours,amount,payment_id,created_by) VALUES ($1,$2,$3,$4,$5)`,
        [s.id, actualExtraHours, amount, pay.id, req.user.id]);
      const upd = (await c.query(
        `UPDATE stays SET hours_purchased = hours_purchased + $1,
                expires_at = GREATEST(expires_at, now()) + make_interval(hours => $1::int),
                amount_due = amount_due + $2, amount_paid = amount_paid + $2
         WHERE id=$3 RETURNING *`, [actualExtraHours, amount, s.id])).rows[0];
      await audit(c, req.user.id, 'stay_topup', 'stays', s.id, { extra_hours, amount });
      return upd;
    });
    res.json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

// S05 - checkout on key return. Overstay -> automatic top-up charge; early departure -> no refund.
// Room passes through 'cleaning' before returning to the vacant grid.
router.post('/stays/:id/checkout', requireRole(RECEPTION_PLUS), async (req, res) => {
  const { overstay_payment_method } = req.body; // required only if an overstay charge arises
  try {
    const out = await tx(async (c) => {
      const s = (await c.query(
        `SELECT s.*, r.hourly_rate, r.room_number FROM stays s JOIN rooms r ON r.id=s.room_id WHERE s.id=$1 FOR UPDATE OF s`,
        [req.params.id])).rows[0];
      if (!s || s.status !== 'active') throw Object.assign(new Error('Active stay not found'), { code: 404 });

      let overstayCharge = 0;
      let extraHours = 0;

      if (s.expires_at && new Date() > new Date(s.expires_at)) {
        extraHours = Math.ceil(
          (Date.now() - new Date(s.expires_at).getTime()) / 3600000
        );

        overstayCharge = extraHours * Number(s.hourly_rate);

        throw Object.assign(
          new Error(
            `Guest is overdue by ${extraHours}h. Collect R${overstayCharge} before checkout.`
          ),
          { code: 402 }
        );
      }
        const bdate = businessDate();
        const pay = (await c.query(
          `INSERT INTO payments (payable_type,payable_id,method,till,amount,received_by,business_date)
           VALUES ('stay_topup',$1,$2,'guest_house',$3,$4,$5) RETURNING id`,
          [s.id, overstay_payment_method, overstayCharge, req.user.id, bdate])).rows[0];
        await c.query(
          `INSERT INTO stay_topups (stay_id,extra_hours,amount,payment_id,created_by) VALUES ($1,$2,$3,$4,$5)`,
          [s.id, extraHours, overstayCharge, pay.id, req.user.id]);
      }
      
      await c.query(`UPDATE meal_credits SET status='expired' WHERE stay_id=$1 AND status='issued'`, [s.id]);
      const upd = (
        await c.query(
        `UPDATE stays SET status='completed', check_out_at=now(),
                amount_due = amount_due + $1, amount_paid = amount_paid + $1
         WHERE id=$2 RETURNING *`, [overstayCharge, s.id])).rows[0];
      await c.query(`UPDATE rooms SET status='cleaning' WHERE id=$1`, [s.room_id]);
      await audit(c, req.user.id, 'check_out', 'stays', s.id, { room: s.room_number, overstayCharge, extraHours });
      return { stay: upd, overstay_charge: overstayCharge, extra_hours: extraHours };
    });
    res.json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

// Cash transfers - the R65 walk from guest house till to restaurant till
router.patch // (leave the confirm one as above)
router.get('/cash-transfers', requireRole(R65_CONFIRM_USERS.concat('reception')), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ct.*, u1.name AS carried_by_name, u2.name AS confirmed_by_name, s.guest_name, r.room_number
    FROM cash_transfers ct
    LEFT JOIN users u1 ON u1.id=ct.carried_by
    LEFT JOIN users u2 ON u2.id=ct.confirmed_by
    LEFT JOIN meal_credits mc ON mc.id=ct.meal_credit_id
    LEFT JOIN stays s ON s.id=mc.stay_id
    LEFT JOIN rooms r ON r.id=s.room_id
    ORDER BY ct.created_at DESC LIMIT 50`);
  res.json(rows);
});

// Restaurant side confirms the R65 arrived - the carrier can never confirm their own walk
router.patch('/cash-transfers/:id/confirm', requireRole(R65_CONFIRM_USERS), async (req, res) => {
  try {
    await tx(async (c) => {
      const t = (await c.query(
        `SELECT * FROM cash_transfers WHERE id=$1 AND confirmed_at IS NULL FOR UPDATE`, [req.params.id])).rows[0];
      if (!t) throw Object.assign(new Error('Transfer not found or already confirmed'), { code: 404 });
      if (t.carried_by === req.user.id)
        throw Object.assign(new Error('You logged this walk - someone at the restaurant till must confirm it'), { code: 403 });
      await c.query(`UPDATE cash_transfers SET confirmed_by=$1, confirmed_at=now() WHERE id=$2`, [req.user.id, req.params.id]);
      await audit(c, req.user.id, 'cash_transfer_confirm', 'cash_transfers', req.params.id);
    });
    res.json({ ok: true });
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

module.exports = router;
