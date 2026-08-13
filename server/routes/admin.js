const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth, requireRole, MANAGERS, RECON_USERS } = require('../middleware/auth');
const { businessDate, audit, alert, tx } = require('../lib/helpers');

router.use(requireAuth);

// Expected cash per till = cash payments +/- CONFIRMED cash transfers (the R65 walk)
async function systemTotals(client, bdate, till) {
  const pay = (await client.query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE method='cash'),0) AS cash,
            COALESCE(SUM(amount) FILTER (WHERE method='card'),0) AS card
     FROM payments WHERE business_date=$1 AND till=$2`, [bdate, till])).rows[0];
  const xfer = (await client.query(
    `SELECT COALESCE(SUM(amount) FILTER (WHERE to_till=$2),0) - COALESCE(SUM(amount) FILTER (WHERE from_till=$2),0) AS net
     FROM cash_transfers WHERE business_date=$1 AND confirmed_at IS NOT NULL`, [bdate, till])).rows[0];
  return { cash: Number(pay.cash) + Number(xfer.net), card: Number(pay.card) };
}

// S12 - what the system expects before the count is entered
router.get('/reconciliation/summary', requireRole(RECON_USERS), async (req, res) => {
  const bdate = req.query.date || businessDate();
  const restaurant = await systemTotals(pool, bdate, 'restaurant');
  const guest_house = await systemTotals(pool, bdate, 'guest_house');
  const counts = (await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(oi.quantity),0)::int FROM order_items oi
         JOIN orders o ON o.id=oi.order_id
         JOIN menu_items mi ON mi.id=oi.menu_item_id
       WHERE o.business_date=$1 AND o.status IN ('paid','in_kitchen','served') AND mi.category='plate') AS plates_sold,
      (SELECT COALESCE(SUM(oi.quantity),0)::int FROM order_items oi
         JOIN orders o ON o.id=oi.order_id
       WHERE o.business_date=$1 AND o.channel='tuck_shop' AND o.status='served') AS shop_items_sold,
      (SELECT COUNT(*)::int FROM stays s JOIN payments p
         ON p.payable_type='stay' AND p.payable_id=s.id
       WHERE p.business_date=$1) AS guests_checked_in`,
    [bdate])).rows[0];
  const submitted = (await pool.query(`SELECT * FROM reconciliations WHERE business_date=$1`, [bdate])).rows;
  res.json({
    business_date: bdate, restaurant, guest_house,
    plates_sold: counts.plates_sold,
    shop_items_sold: counts.shop_items_sold,
    guests_checked_in: counts.guests_checked_in,
    submitted,
  });
});

// S12 - per-till submission; variance breach alerts the owner immediately
const VARIANCE_ALERT_THRESHOLD = 50; // Rands - make configurable later
router.post('/reconciliation', requireRole(RECON_USERS), async (req, res) => {
  const { till, counted_cash, counted_card, plates_counted, shop_items_counted, guests_counted, notes, date } = req.body;
  if (!['restaurant', 'guest_house'].includes(till)) return res.status(400).json({ error: 'till required' });
  if (counted_cash == null || counted_card == null) return res.status(400).json({ error: 'counted cash and card totals required' });
  const bdate = date || businessDate();
  try {
    const out = await tx(async (c) => {
      const sys = await systemTotals(c, bdate, till);
      const cashVar = Math.round((Number(counted_cash) - sys.cash) * 100) / 100;
      const cardVar = Math.round((Number(counted_card) - sys.card) * 100) / 100;
      const r = (await c.query(
        `INSERT INTO reconciliations (business_date,till,system_cash_total,system_card_total,counted_cash,counted_card,
            cash_variance,card_variance,plates_counted,shop_items_counted,guests_counted,notes,submitted_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (business_date,till) DO UPDATE SET
            system_cash_total=EXCLUDED.system_cash_total, system_card_total=EXCLUDED.system_card_total,
            counted_cash=EXCLUDED.counted_cash, counted_card=EXCLUDED.counted_card,
            cash_variance=EXCLUDED.cash_variance, card_variance=EXCLUDED.card_variance,
            plates_counted=EXCLUDED.plates_counted, shop_items_counted=EXCLUDED.shop_items_counted,
            guests_counted=EXCLUDED.guests_counted, notes=EXCLUDED.notes,
            submitted_by=EXCLUDED.submitted_by, submitted_at=now()
         RETURNING *`,
        [bdate, till, sys.cash, sys.card, counted_cash, counted_card, cashVar, cardVar,
         plates_counted ?? null, shop_items_counted ?? null, guests_counted ?? null, notes || null, req.user.id])).rows[0];

      if (Math.abs(cashVar) >= VARIANCE_ALERT_THRESHOLD || Math.abs(cardVar) >= VARIANCE_ALERT_THRESHOLD)
        await alert(c, 'variance_breach',
          `EOD variance on ${till} till (${bdate}): cash ${cashVar >= 0 ? '+' : ''}R${cashVar}, card ${cardVar >= 0 ? '+' : ''}R${cardVar}`,
          { reconciliation_id: r.id, till, bdate });
      await audit(c, req.user.id, 'reconciliation_submit', 'reconciliations', r.id, { till, bdate, cashVar, cardVar });
      return r;
    });
    res.status(201).json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// S02 - owner dashboard
router.get('/dashboard', requireRole(MANAGERS), async (req, res) => {
  const bdate = businessDate();
  const revenue = (await pool.query(
    `SELECT till, method, COALESCE(SUM(amount),0) AS total
     FROM payments WHERE business_date=$1 GROUP BY till, method`, [bdate])).rows;
  const occupancy = (await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status='occupied')::int AS occupied,
            COUNT(*) FILTER (WHERE status='cleaning')::int AS cleaning,
            COUNT(*)::int AS total FROM rooms`)).rows[0];
  const lowStock = (await pool.query(
    `SELECT register, name, current_quantity, low_stock_threshold, unit FROM stock_items
     WHERE low_stock_threshold IS NOT NULL AND current_quantity <= low_stock_threshold
     ORDER BY register, name`)).rows;
  const pendingAdj = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM stock_adjustments WHERE status='pending'`)).rows[0];
  const unconfirmedTransfers = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM cash_transfers WHERE confirmed_at IS NULL`)).rows[0];
  const openAlerts = (await pool.query(
    `SELECT COUNT(*)::int AS n FROM alerts WHERE acknowledged=FALSE`)).rows[0];
  const pettyCash = (await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN type='topup' THEN amount
                              WHEN type='expense' THEN -amount ELSE 0 END),0) AS balance
     FROM petty_cash_entries`)).rows[0];
  const recon = (await pool.query(`SELECT till, cash_variance, card_variance FROM reconciliations WHERE business_date=$1`, [bdate])).rows;
  const ordersToday = (await pool.query(
    `SELECT channel, COUNT(*)::int AS n, COALESCE(SUM(total_amount),0) AS value
     FROM orders WHERE business_date=$1 AND status IN ('paid','in_kitchen','served') GROUP BY channel`, [bdate])).rows;
  res.json({ business_date: bdate, revenue, occupancy, lowStock, ordersToday,
    pending_adjustments: pendingAdj.n, unconfirmed_transfers: unconfirmedTransfers.n,
    open_alerts: openAlerts.n, reconciliations: recon, petty_cash_balance: Number(pettyCash.balance) });
});

// S13 - reports: daily revenue by till/method over a range + stock movement snapshot
router.get('/reports', requireRole(['owner', 'office_manager']), async (req, res) => {
  const to = req.query.to || businessDate();
  const from = req.query.from || new Date(new Date(to).getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const revenue = (await pool.query(
    `SELECT business_date, till, method, SUM(amount) AS total
     FROM payments WHERE business_date BETWEEN $1 AND $2
     GROUP BY business_date, till, method ORDER BY business_date`, [from, to])).rows;
  const variance = (await pool.query(
    `SELECT business_date, till, cash_variance, card_variance FROM reconciliations
     WHERE business_date BETWEEN $1 AND $2 ORDER BY business_date`, [from, to])).rows;
  const purchases = (await pool.query(
    `SELECT si.register, SUM(p.total_cost) AS spend
     FROM stock_purchases p JOIN stock_items si ON si.id=p.stock_item_id
     WHERE p.created_at::date BETWEEN $1 AND $2 GROUP BY si.register`, [from, to])).rows;
  const topItems = (await pool.query(
    `SELECT mi.name, SUM(oi.quantity)::int AS qty, SUM(oi.line_total) AS revenue
     FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN menu_items mi ON mi.id=oi.menu_item_id
     WHERE o.business_date BETWEEN $1 AND $2 AND o.status IN ('paid','in_kitchen','served')
     GROUP BY mi.name ORDER BY revenue DESC LIMIT 10`, [from, to])).rows;
  const transfers = (await pool.query(
    `SELECT ti.name AS item, fi.register AS from_register, ti.register AS to_register,
            SUM(t.quantity) AS qty
     FROM stock_transfers t
     JOIN stock_items fi ON fi.id=t.from_stock_item_id
     JOIN stock_items ti ON ti.id=t.to_stock_item_id
     WHERE t.business_date BETWEEN $1 AND $2
     GROUP BY ti.name, fi.register, ti.register ORDER BY qty DESC`, [from, to])).rows;
  res.json({ from, to, revenue, variance, purchases, topItems, transfers });
});

// Audit trail viewer - owner + office manager. Read-only; the log itself is append-only.
router.get('/audit', requireRole(['owner', 'office_manager']), async (req, res) => {
  const { user_id, action, entity, from, to, limit } = req.query;
  const conds = [], vals = [];
  if (user_id) { vals.push(user_id); conds.push(`a.user_id = $${vals.length}`); }
  if (action)  { vals.push(action);  conds.push(`a.action = $${vals.length}`); }
  if (entity)  { vals.push(entity);   conds.push(`a.entity = $${vals.length}`); }
  if (from)    { vals.push(from);     conds.push(`a.created_at >= $${vals.length}`); }
  if (to)      { vals.push(to);       conds.push(`a.created_at < ($${vals.length}::date + 1)`); } // inclusive of the "to" day
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const lim = Math.min(Number(limit) || 200, 500);

  const rows = (await pool.query(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at,
            u.name AS user_name, u.role AS user_role
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     ${where} ORDER BY a.created_at DESC LIMIT ${lim}`, vals)).rows;

  // Distinct values to populate the filter dropdowns
  const actions = (await pool.query(`SELECT DISTINCT action FROM audit_log ORDER BY action`)).rows.map((r) => r.action);
  const entities = (await pool.query(`SELECT DISTINCT entity FROM audit_log ORDER BY entity`)).rows.map((r) => r.entity);
  const users = (await pool.query(
    `SELECT DISTINCT u.id, u.name FROM audit_log a JOIN users u ON u.id=a.user_id ORDER BY u.name`)).rows;

  res.json({ rows, actions, entities, users });
});

// S14 - alerts feed
router.get('/alerts', requireRole(MANAGERS), async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM alerts WHERE acknowledged=FALSE ORDER BY created_at DESC LIMIT 100`);
  res.json(rows);
});
router.patch('/alerts/:id/ack', requireRole(MANAGERS), async (req, res) => {
  await pool.query(`UPDATE alerts SET acknowledged=TRUE WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

// User management (owner only)
router.get('/users', requireRole('owner'), async (req, res) => {
  const { rows } = await pool.query(`SELECT id, name, email, role, active, created_at FROM users ORDER BY role, name`);
  res.json(rows);
});
router.post('/users', requireRole('owner'), async (req, res) => {
  const { name, email, role, password, pin } = req.body;
  if (!name || !email || !role || !password) return res.status(400).json({ error: 'name, email, role, password required' });
  try {
    const out = await tx(async (c) => {
      const r = (await c.query(
        `INSERT INTO users (name,email,role,password_hash,pin_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role`,
        [name, email, role, bcrypt.hashSync(password, 12), pin ? bcrypt.hashSync(pin, 12) : null])).rows[0];
      await audit(c, req.user.id, 'user_create', 'users', r.id, { email, role });
      return r;
    });
    res.status(201).json(out);
  } catch (e) { res.status(400).json({ error: e.message.includes('unique') ? 'Email already exists' : e.message }); }
});
router.patch('/users/:id', requireRole('owner'), async (req, res) => {
  const { active, password, pin, role } = req.body;
  await tx(async (c) => {
    if (active != null) await c.query(`UPDATE users SET active=$1 WHERE id=$2`, [active, req.params.id]);
    if (role) await c.query(`UPDATE users SET role=$1 WHERE id=$2`, [role, req.params.id]);
    if (password) await c.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [bcrypt.hashSync(password, 12), req.params.id]);
    if (pin) await c.query(`UPDATE users SET pin_hash=$1 WHERE id=$2`, [bcrypt.hashSync(pin, 12), req.params.id]);
    await audit(c, req.user.id, 'user_update', 'users', req.params.id, { active, role, password: !!password, pin: !!pin });
  });
  res.json({ ok: true });
});

module.exports = router;
