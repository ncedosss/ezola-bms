const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireRole, ORDER_TAKERS, PAYMENT_TAKERS, KITCHEN_PLUS, MANAGERS } = require('../middleware/auth');
const { businessDate, audit, alert, nextOrderNumber, deductStockForOrder, tx, httpErr } = require('../lib/helpers');

router.use(requireAuth);

// Menu with option groups (S07 plate builder needs this shape)
router.get('/menu', async (req, res) => {
  const items = (await pool.query(`SELECT * FROM menu_items ORDER BY category, name`)).rows;
  const groups = (await pool.query(`
    SELECT g.*, COALESCE(json_agg(json_build_object('id',o.id,'name',o.name) ORDER BY o.name) FILTER (WHERE o.id IS NOT NULL),'[]') AS options
    FROM menu_option_groups g LEFT JOIN menu_options o ON o.group_id=g.id
    GROUP BY g.id`)).rows;
  // Sold out = an always-required (non-option) ingredient has run to zero (or below).
  const soldOut = new Set((await pool.query(
    `SELECT DISTINCT rc.menu_item_id
     FROM recipe_consumption rc JOIN stock_items si ON si.id = rc.stock_item_id
     WHERE rc.menu_option_id IS NULL AND si.current_quantity <= 0`)).rows.map((r) => r.menu_item_id));
  res.json(items.map((i) => ({ ...i, sold_out: soldOut.has(i.id), option_groups: groups.filter((g) => g.menu_item_id === i.id) })));
});

// Owner-only price/availability edits ('no on-the-spot negotiation' rule)
router.patch('/menu/:id', requireRole('owner'), async (req, res) => {
  const allowed = ['price_sit_down', 'price_takeaway', 'price_per_kg', 'price_unit', 'is_available', 'name'];
  const sets = [], vals = [];
  for (const k of allowed) if (k in req.body) { vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  await tx(async (c) => {
    await c.query(`UPDATE menu_items SET ${sets.join(',')} WHERE id=$${vals.length}`, vals);
    await audit(c, req.user.id, 'menu_update', 'menu_items', req.params.id, req.body);
  });
  res.json({ ok: true });
});

// Orders board (S06/S15). Kitchen sees paid+ only - the no-invoice-no-meal rule.
router.get('/orders', async (req, res) => {
  const { status, channel, kitchen } = req.query;
  const conds = [`o.business_date = $1`], vals = [businessDate()];
  if (status) { vals.push(status); conds.push(`o.status = $${vals.length}`); }
  if (channel) { vals.push(channel); conds.push(`o.channel = $${vals.length}`); }
  if (kitchen === 'true') conds.push(`o.status IN ('paid','in_kitchen')`);
  const { rows } = await pool.query(`
    SELECT o.*, u.name AS created_by_name, s.guest_name, r.room_number,
      (SELECT json_agg(json_build_object('id',oi.id,'name',mi.name,'quantity',oi.quantity,'unit_price',oi.unit_price,
        'weight_kg',oi.weight_kg,'selected_options',oi.selected_options,'line_total',oi.line_total,
        'meal_credit_id',oi.meal_credit_id) ORDER BY oi.created_at)
       FROM order_items oi JOIN menu_items mi ON mi.id=oi.menu_item_id WHERE oi.order_id=o.id) AS items,
      EXISTS (SELECT 1 FROM order_items oi2 JOIN meal_credits mc ON mc.id=oi2.meal_credit_id
              WHERE oi2.order_id=o.id AND mc.funding_method='card_noted') AS card_paid_credit_flag
    FROM orders o
    JOIN users u ON u.id=o.created_by
    LEFT JOIN stays s ON s.id=o.stay_id
    LEFT JOIN rooms r ON r.id=s.room_id
    WHERE ${conds.join(' AND ')}
    ORDER BY o.created_at DESC`, vals);
  res.json(rows);
});

// Create draft order. lines: [{menu_item_id, quantity, weight_kg, selected_options, use_meal_credit}]
router.post('/orders', requireRole(ORDER_TAKERS), async (req, res) => {
  const { channel, stay_id, service_type, table_number, lines } = req.body;
  if (!['restaurant', 'tuck_shop', 'room', 'uber'].includes(channel)) return res.status(400).json({ error: 'Invalid channel' });
  if (req.user.role === 'waiter' && channel !== 'restaurant') return res.status(403).json({ error: 'Waiters can only take restaurant orders' });
  if (channel === 'room' && !stay_id) return res.status(400).json({ error: 'Room orders need the stay' });
  if (channel === 'restaurant' && !(table_number >= 1 && table_number <= 9))
    return res.status(400).json({ error: 'Restaurant orders need a table number (1-9)' });
  if (!Array.isArray(lines) || !lines.length) return res.status(400).json({ error: 'Order has no lines' });
  const svc = service_type === 'takeaway' ? 'takeaway' : 'sit_down'; // room-eaten = sit_down R65; taken after stay = takeaway R70

  try {
    const out = await tx(async (c) => {
      const bdate = businessDate();
      const number = await nextOrderNumber(c, channel, bdate);
      const order = (await c.query(
        `INSERT INTO orders (order_number,channel,stay_id,service_type,table_number,business_date,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [number, channel, stay_id || null, svc, channel === 'restaurant' ? table_number : null, bdate, req.user.id])).rows[0];

      let total = 0;
      for (const line of lines) {
        const mi = (await c.query(`SELECT * FROM menu_items WHERE id=$1`, [line.menu_item_id])).rows[0];
        if (!mi) throw Object.assign(new Error('Menu item not found'), { code: 400 });
        if (!mi.is_available) throw Object.assign(new Error(`${mi.name} is currently unavailable`), { code: 400 });

        let unitPrice, lineTotal;
        const qty = Math.max(1, parseInt(line.quantity || 1, 10));
        if (mi.pricing_type === 'dual_fixed') {
          unitPrice = Number(svc === 'takeaway' ? mi.price_takeaway : mi.price_sit_down);
          lineTotal = unitPrice * qty;
        } else if (mi.pricing_type === 'per_kg') {
          const w = Number(line.weight_kg);
          if (!(w > 0)) throw Object.assign(new Error(`${mi.name}: enter the weighed kg`), { code: 400 });
          unitPrice = Number(mi.price_per_kg);
          lineTotal = Math.round(unitPrice * w * 100) / 100;
        } else {
          unitPrice = Number(mi.price_unit);
          lineTotal = unitPrice * qty;
        }

        // Meal credit redemption: only one credit can be used for one plate.
        let mealCreditId = null;

        if (line.use_meal_credit && stay_id && mi.pricing_type === 'dual_fixed') {
          const mc = (await c.query(
            `SELECT *
              FROM meal_credits
              WHERE stay_id=$1
                AND status='issued'
              ORDER BY created_at
              LIMIT 1
              FOR UPDATE`,
            [stay_id]
          )).rows[0];

          if (!mc) {
            throw Object.assign(
              new Error('No meal credit is available for this plate'),
              { code: 400 }
            );
          }

          mealCreditId = mc.id;

          lineTotal = Math.max(
            0,
            lineTotal - Number(mc.value)
          );

          await c.query(
            `UPDATE meal_credits
                SET status='redeemed',
                    redeemed_order_id=$1
              WHERE id=$2`,
            [order.id, mc.id]
          );
        }

        await c.query(
          `INSERT INTO order_items (order_id,menu_item_id,quantity,unit_price,weight_kg,selected_options,meal_credit_id,line_total)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [order.id, mi.id, qty, unitPrice, line.weight_kg || null,
           line.selected_options ? JSON.stringify(line.selected_options) : null, mealCreditId, lineTotal]);
        total += lineTotal;
      }
      const upd = (await c.query(`UPDATE orders SET total_amount=$1 WHERE id=$2 RETURNING *`, [total, order.id])).rows[0];
      await audit(c, req.user.id, 'order_create', 'orders', order.id, { number, channel, total });
      return upd;
    });
    res.status(201).json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

// Till-first: recording payment issues the numbered kitchen slip and deducts estimated stock.
router.post('/orders/:id/pay', requireRole(PAYMENT_TAKERS), async (req, res) => {
  let { method, till } = req.body;
  if (!['cash', 'card', 'uber_eats'].includes(method)) return res.status(400).json({ error: 'method must be cash, card or uber_eats' });
  if (method === 'uber_eats') till = 'restaurant'; // paid online via Uber; no cash drawer, always restaurant
  if (!['restaurant', 'guest_house'].includes(till)) return res.status(400).json({ error: 'till required' });
  try {
    const out = await tx(async (c) => {
      const o = (await c.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!o) throw Object.assign(new Error('Order not found'), { code: 404 });
      if (o.status !== 'draft') throw Object.assign(new Error(`Order is already ${o.status}`), { code: 400 });

      const bdate = businessDate();
      if (Number(o.total_amount) > 0)
        await c.query(
          `INSERT INTO payments (payable_type,payable_id,method,till,amount,received_by,business_date)
           VALUES ('order',$1,$2,$3,$4,$5,$6)`,
          [o.id, method, till, o.total_amount, req.user.id, bdate]);

      // Kitchen queue is driven purely by paid slips; tuck shop items skip the kitchen entirely
      const nextStatus = o.channel === 'tuck_shop' ? 'served' : 'paid';
      const upd = (await c.query(
        `UPDATE orders SET status=$1, amount_paid=total_amount, paid_at=now() WHERE id=$2 RETURNING *`,
        [nextStatus, o.id])).rows[0];
      await deductStockForOrder(c, o.id);
      await audit(c, req.user.id, 'order_pay', 'orders', o.id, { method, till, amount: o.total_amount });
      return upd;
    });
    res.json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

// Manager void of a paid order: reverses the payment (negative row on the same till/method),
// restores estimated stock, reissues any redeemed meal credit. Owner is alerted.
router.post('/orders/:id/void', requireRole(MANAGERS), async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'A reason is required to void an order' });
  try {
    const out = await tx(async (c) => {
      const o = (await c.query(`SELECT * FROM orders WHERE id=$1 FOR UPDATE`, [req.params.id])).rows[0];
      if (!o) throw Object.assign(new Error('Order not found'), { code: 404 });
      if (!['paid', 'in_kitchen', 'served'].includes(o.status))
        throw Object.assign(new Error(`Only paid orders can be voided (this one is ${o.status})`), { code: 400 });

      const pay = (await c.query(
        `SELECT method, till FROM payments WHERE payable_type='order' AND payable_id=$1 ORDER BY created_at LIMIT 1`,
        [o.id])).rows[0];
      if (pay && Number(o.amount_paid) > 0)
        await c.query(
          `INSERT INTO payments (payable_type,payable_id,method,till,amount,received_by,business_date)
           VALUES ('order',$1,$2,$3,$4,$5,$6)`,
          [o.id, pay.method, pay.till, -Number(o.amount_paid), req.user.id, businessDate()]);

      await deductStockForOrder(c, o.id, -1);           // put the stock back
      await c.query(
        `UPDATE meal_credits SET status='issued', redeemed_order_id=NULL
         WHERE redeemed_order_id=$1 AND status='redeemed'`, [o.id]);

      const upd = (await c.query(`UPDATE orders SET status='voided' WHERE id=$1 RETURNING *`, [o.id])).rows[0];
      await alert(c, 'order_voided',
        `${o.order_number} voided by ${req.user.name}: ${reason.trim()} (R${o.amount_paid} reversed)`, { order_id: o.id });
      await audit(c, req.user.id, 'order_void', 'orders', o.id, { reason: reason.trim(), amount: o.amount_paid });
      return upd;
    });
    res.json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

// Kitchen actions (S15)
router.patch('/orders/:id/start', requireRole(KITCHEN_PLUS), async (req, res) => {
  const r = await pool.query(`UPDATE orders SET status='in_kitchen' WHERE id=$1 AND status='paid' RETURNING id`, [req.params.id]);
  if (!r.rowCount) return res.status(400).json({ error: 'Order is not in the paid queue' });
  res.json({ ok: true });
});
router.patch('/orders/:id/serve', requireRole(KITCHEN_PLUS), async (req, res) => {
  const r = await pool.query(`UPDATE orders SET status='served' WHERE id=$1 AND status IN ('paid','in_kitchen') RETURNING id`, [req.params.id]);
  if (!r.rowCount) return res.status(400).json({ error: 'Order cannot be served from its current state' });
  res.json({ ok: true });
});

// Cancel a draft (never a paid order - managers reverse via adjustment/audit trail instead)
router.patch('/orders/:id/cancel', requireRole(ORDER_TAKERS), async (req, res) => {
  const r = await pool.query(`UPDATE orders SET status='cancelled' WHERE id=$1 AND status='draft' RETURNING id`, [req.params.id]);
  if (!r.rowCount) return res.status(400).json({ error: 'Only unpaid drafts can be cancelled' });
  res.json({ ok: true });
});

// Meal credits for a stay (room-order screen shows redeemable credit)
router.get('/meal-credits', async (req, res) => {
  const { stay_id } = req.query;
  const { rows } = await pool.query(`SELECT * FROM meal_credits WHERE stay_id=$1`, [stay_id]);
  res.json(rows);
});

// Owner-only: create a menu item. For a shop (Tuck Shop) item, also wire up its
// stock — create/reuse a shop stock_items row and link it 1:1 via recipe_consumption —
// so sales deduct, sold-out shows, and low-stock alerts fire.
router.post('/menu', requireRole('owner'), async (req, res) => {
  const { name, category, pricing_type,
          price_sit_down, price_takeaway, price_per_kg, price_unit,
          is_available, stock_register, low_stock_threshold } = req.body;

  const CATEGORIES = ['plate','protein_standalone','braai_per_kg','drink','alcohol','snack','household','addon'];
  const PRICING    = ['dual_fixed','per_kg','unit'];
  const REGISTERS  = ['kitchen','shop','guest_house'];

  if (!name || !name.trim())           return res.status(400).json({ error: 'Name is required' });
  if (!CATEGORIES.includes(category))  return res.status(400).json({ error: 'Invalid category' });
  if (!PRICING.includes(pricing_type)) return res.status(400).json({ error: 'Invalid pricing type' });
  if (stock_register && !REGISTERS.includes(stock_register))
                                       return res.status(400).json({ error: 'Invalid register' });
  if (stock_register === 'shop')
    return res.status(400).json({ error: 'Add shop items from stock: create the item on the Stock page, then price it here via “Price shop item”.' });

  const num = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  const psd = pricing_type === 'dual_fixed' ? num(price_sit_down) : null;
  const pta = pricing_type === 'dual_fixed' ? num(price_takeaway) : null;
  const pkg = pricing_type === 'per_kg'     ? num(price_per_kg)   : null;
  const pun = pricing_type === 'unit'       ? num(price_unit)     : null;
  const thr = num(low_stock_threshold);

  try {
    const out = await tx(async (c) => {
      const item = (await c.query(
        `INSERT INTO menu_items
           (name, category, pricing_type, price_sit_down, price_takeaway, price_per_kg, price_unit, is_available, stock_register)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [name.trim(), category, pricing_type, psd, pta, pkg, pun,
         is_available === undefined ? true : !!is_available,
         stock_register || null])).rows[0];
      await audit(c, req.user.id, 'menu_item_create', 'menu_items', item.id, { name: item.name, category, pricing_type });

      // Shop items get a tracked stock row + 1:1 link so the Tuck Shop can deduct & alert.
      if (stock_register === 'shop') {
        const stockRow = (await c.query(
          `INSERT INTO stock_items (register, name, category, unit, current_quantity, low_stock_threshold)
           VALUES ('shop', $1, $2, 'unit', 0, $3)
           ON CONFLICT (register, name)
           DO UPDATE SET low_stock_threshold = COALESCE(EXCLUDED.low_stock_threshold, stock_items.low_stock_threshold),
                         updated_at = now()
           RETURNING id`,
          [item.name, category, thr])).rows[0];

        await c.query(
          `INSERT INTO recipe_consumption (menu_item_id, menu_option_id, stock_item_id, quantity_per_unit)
           SELECT $1, NULL, $2, 1
           WHERE NOT EXISTS (
             SELECT 1 FROM recipe_consumption WHERE menu_item_id = $1 AND stock_item_id = $2
           )`,
          [item.id, stockRow.id]);

        await audit(c, req.user.id, 'menu_stock_link', 'stock_items', stockRow.id, { menu_item_id: item.id, name: item.name });
      }
      return item;
    });
    res.status(201).json(out);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A menu item with that name already exists.' });
    res.status(400).json({ error: e.message });
  }
});

// Owner-only: shop stock items that don't yet have a menu price (the pricing picker source).
router.get('/menu/shop-stock', requireRole('owner'), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT si.id, si.name, si.category, si.current_quantity, si.low_stock_threshold
     FROM stock_items si
     WHERE si.register = 'shop'
       AND NOT EXISTS (SELECT 1 FROM recipe_consumption rc WHERE rc.stock_item_id = si.id)
     ORDER BY si.category NULLS LAST, si.name`);
  res.json(rows);
});

// Owner-only: give an existing shop stock item a menu price. Creates the menu item + 1:1 link.
const STOCK_TO_MENU_CAT = {
  alcohol: 'alcohol', household: 'household', snacks: 'snack',
  soft_drinks: 'drink', energy_drinks: 'drink', groceries: 'snack',
};
router.post('/menu/from-stock', requireRole('owner'), async (req, res) => {
  const { stock_item_id, price_unit } = req.body;
  const price = (price_unit === '' || price_unit == null) ? null : Number(price_unit);
  if (!stock_item_id) return res.status(400).json({ error: 'Pick a stock item' });
  if (!(price > 0))    return res.status(400).json({ error: 'Enter a price greater than 0' });
  try {
    const out = await tx(async (c) => {
      const si = (await c.query(`SELECT * FROM stock_items WHERE id=$1`, [stock_item_id])).rows[0];
      if (!si) { const e = new Error('Stock item not found'); e.status = 404; throw e; }
      if (si.register !== 'shop') { const e = new Error('Only shop items can be priced this way'); e.status = 400; throw e; }
      const linked = (await c.query(`SELECT 1 FROM recipe_consumption WHERE stock_item_id=$1 LIMIT 1`, [stock_item_id])).rows[0];
      if (linked) { const e = new Error('That stock item is already on the menu'); e.status = 409; throw e; }

      const menuCat = STOCK_TO_MENU_CAT[si.category] || 'snack';
      const item = (await c.query(
        `INSERT INTO menu_items (name, category, pricing_type, price_unit, is_available, stock_register)
         VALUES ($1,$2,'unit',$3,TRUE,'shop') RETURNING *`,
        [si.name, menuCat, price])).rows[0];
      await c.query(
        `INSERT INTO recipe_consumption (menu_item_id, menu_option_id, stock_item_id, quantity_per_unit)
         VALUES ($1, NULL, $2, 1)`, [item.id, si.id]);
      await audit(c, req.user.id, 'menu_item_price_from_stock', 'menu_items', item.id, { name: si.name, stock_item_id: si.id, price });
      return item;
    });
    res.status(201).json(out);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A menu item with that name already exists.' });
    res.status(e.status || 400).json({ error: e.message });
  }
});

// Owner-only: delete a menu item. Option groups + recipes cascade away.
// Blocked by FK if the item appears in past orders — set it "off" instead.
router.delete('/menu/:id', requireRole('owner'), async (req, res) => {
  try {
    const out = await tx(async (c) => {
      const found = (await c.query(`SELECT name FROM menu_items WHERE id=$1`, [req.params.id])).rows[0];
      if (!found) { const e = new Error('Menu item not found'); e.status = 404; throw e; }
      await c.query(`DELETE FROM menu_items WHERE id=$1`, [req.params.id]);
      await audit(c, req.user.id, 'menu_item_delete', 'menu_items', req.params.id, { name: found.name });
      return found;
    });
    res.json({ ok: true, name: out.name });
  } catch (e) {
    if (e.code === '23503')
      return res.status(409).json({ error: 'This item is used in past orders and can\'t be deleted. Set it to "off" instead.' });
    res.status(e.status || 400).json({ error: e.message });
  }
});

module.exports = router;
