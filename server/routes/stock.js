const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireRole, MANAGERS } = require('../middleware/auth');
const { audit, alert, checkLowStock, transferStock, businessDate, tx, httpErr } = require('../lib/helpers');

router.use(requireAuth);

// S09 - register-scoped stock levels (kitchen / shop / guest_house tabs)
router.get('/', requireRole(MANAGERS), async (req, res) => {
  const { register } = req.query;
  const vals = [], cond = register ? (vals.push(register), 'WHERE register=$1') : '';
  const { rows } = await pool.query(
    `SELECT *, (low_stock_threshold IS NOT NULL AND current_quantity <= low_stock_threshold) AS is_low
     FROM stock_items ${cond} ORDER BY register, category, name`, vals);
  res.json(rows);
});

// Managers can add items / set thresholds & units as Open Items get confirmed
router.post('/items', requireRole(MANAGERS), async (req, res) => {
  const { register, name, category, unit, low_stock_threshold, plate_yield } = req.body;
  if (!register || !name) return res.status(400).json({ error: 'register and name required' });
  try {
    const out = await tx(async (c) => {
      const r = (await c.query(
        `INSERT INTO stock_items (register,name,category,unit,low_stock_threshold,plate_yield)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [register, name, category || null, unit || 'unit', low_stock_threshold ?? null, plate_yield ?? null])).rows[0];
      await audit(c, req.user.id, 'stock_item_create', 'stock_items', r.id, { register, name });
      return r;
    });
    res.status(201).json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.patch('/items/:id', requireRole(MANAGERS), async (req, res) => {
  const allowed = ['name', 'category', 'unit', 'low_stock_threshold', 'plate_yield', 'cost_per_unit', 'sell_price'];
  const sets = [], vals = [];
  for (const k of allowed) if (k in req.body) { vals.push(req.body[k]); sets.push(`${k}=$${vals.length}`); }
  if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  await tx(async (c) => {
    await c.query(`UPDATE stock_items SET ${sets.join(',')}, updated_at=now() WHERE id=$${vals.length}`, vals);
    await audit(c, req.user.id, 'stock_item_update', 'stock_items', req.params.id, req.body);
  });
  res.json({ ok: true });
});

// S10 - purchase capture: increments the register, keeps latest cost per unit
router.post('/purchases', requireRole(MANAGERS), async (req, res) => {
  const { stock_item_id, quantity, total_cost, receipt_ref, supplier_note } = req.body;
  if (!stock_item_id || !(quantity > 0) || !(total_cost >= 0))
    return res.status(400).json({ error: 'item, quantity and cost are required' });
  try {
    const out = await tx(async (c) => {
      const p = (await c.query(
        `INSERT INTO stock_purchases (stock_item_id,quantity,total_cost,receipt_ref,supplier_note,purchased_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [stock_item_id, quantity, total_cost, receipt_ref || null, supplier_note || null, req.user.id])).rows[0];
      await c.query(
        `UPDATE stock_items SET current_quantity = current_quantity + $1,
                cost_per_unit = CASE WHEN $1 > 0 THEN ROUND($2::numeric / $1, 2) ELSE cost_per_unit END,
                updated_at = now()
         WHERE id=$3`, [quantity, total_cost, stock_item_id]);
      await audit(c, req.user.id, 'stock_purchase', 'stock_purchases', p.id, { stock_item_id, quantity, total_cost });
      return p;
    });
    res.status(201).json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/purchases', requireRole(MANAGERS), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT p.*, si.name AS item_name, si.register, u.name AS purchased_by_name
    FROM stock_purchases p JOIN stock_items si ON si.id=p.stock_item_id JOIN users u ON u.id=p.purchased_by
    ORDER BY p.created_at DESC LIMIT 100`);
  res.json(rows);
});

// Internal transfer between registers (e.g. kitchen runs out of rice, takes from the tuck shop).
// Managers record it; applies immediately, no approval needed.
router.post('/transfers', requireRole(MANAGERS), async (req, res) => {
  const { from_stock_item_id, to_stock_item_id, quantity, note } = req.body;
  if (!from_stock_item_id || !to_stock_item_id || !(quantity > 0))
    return res.status(400).json({ error: 'source item, destination item and a positive quantity are required' });
  try {
    const out = await tx(async (c) => {
      const { from, to } = await transferStock(c, from_stock_item_id, to_stock_item_id, quantity);
      const t = (await c.query(
        `INSERT INTO stock_transfers (from_stock_item_id,to_stock_item_id,quantity,note,transferred_by,business_date)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [from_stock_item_id, to_stock_item_id, quantity, note || null, req.user.id, businessDate()])).rows[0];
      await audit(c, req.user.id, 'stock_transfer', 'stock_transfers', t.id,
        { from: `${from.name} (${from.register})`, to: `${to.name} (${to.register})`, quantity });
      return t;
    });
    res.status(201).json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

router.get('/transfers', requireRole(MANAGERS), async (req, res) => {
  const { rows } = await pool.query(`
    SELECT t.*, fi.name AS from_name, fi.register AS from_register, fi.unit AS from_unit,
           ti.name AS to_name, ti.register AS to_register, u.name AS transferred_by_name
    FROM stock_transfers t
    JOIN stock_items fi ON fi.id=t.from_stock_item_id
    JOIN stock_items ti ON ti.id=t.to_stock_item_id
    JOIN users u ON u.id=t.transferred_by
    ORDER BY t.created_at DESC LIMIT 100`);
  res.json(rows);
});

// S11 - adjustments: mandatory reason, pending until the OWNER approves (manager can never self-approve)
router.post('/adjustments', requireRole(MANAGERS), async (req, res) => {
  const { stock_item_id, quantity_change, reason } = req.body;
  if (!stock_item_id || !quantity_change || !reason || !reason.trim())
    return res.status(400).json({ error: 'item, quantity change and a reason are required' });
  try {
    const out = await tx(async (c) => {
      const a = (await c.query(
        `INSERT INTO stock_adjustments (stock_item_id,quantity_change,reason,submitted_by)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [stock_item_id, quantity_change, reason.trim(), req.user.id])).rows[0];
      const item = (await c.query(`SELECT name, register FROM stock_items WHERE id=$1`, [stock_item_id])).rows[0];
      await alert(c, 'adjustment_pending',
        `Adjustment awaiting approval: ${item.name} (${item.register}) ${quantity_change > 0 ? '+' : ''}${quantity_change} - ${reason.trim()}`,
        { adjustment_id: a.id });
      await audit(c, req.user.id, 'adjustment_submit', 'stock_adjustments', a.id, { stock_item_id, quantity_change, reason });
      return a;
    });
    res.status(201).json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/adjustments', requireRole(MANAGERS), async (req, res) => {
  const { status } = req.query;
  const vals = [], cond = status ? (vals.push(status), 'WHERE a.status=$1') : '';
  const { rows } = await pool.query(`
    SELECT a.*, si.name AS item_name, si.register, si.unit, u1.name AS submitted_by_name, u2.name AS reviewed_by_name
    FROM stock_adjustments a
    JOIN stock_items si ON si.id=a.stock_item_id
    JOIN users u1 ON u1.id=a.submitted_by
    LEFT JOIN users u2 ON u2.id=a.reviewed_by
    ${cond} ORDER BY a.created_at DESC LIMIT 100`, vals);
  res.json(rows);
});

// S14 - owner-only approve/reject; approval applies the quantity change
router.patch('/adjustments/:id', requireRole('owner'), async (req, res) => {
  const { decision } = req.body; // 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision approved/rejected required' });
  try {
    await tx(async (c) => {
      const a = (await c.query(`SELECT * FROM stock_adjustments WHERE id=$1 AND status='pending' FOR UPDATE`, [req.params.id])).rows[0];
      if (!a) throw Object.assign(new Error('Pending adjustment not found'), { code: 404 });
      await c.query(`UPDATE stock_adjustments SET status=$1, reviewed_by=$2, reviewed_at=now() WHERE id=$3`,
        [decision, req.user.id, a.id]);
      if (decision === 'approved') {
        await c.query(`UPDATE stock_items SET current_quantity = current_quantity + $1, updated_at=now() WHERE id=$2`,
          [a.quantity_change, a.stock_item_id]);
        await checkLowStock(c, a.stock_item_id);
      }
      await c.query(`UPDATE alerts SET acknowledged=TRUE WHERE type='adjustment_pending' AND payload->>'adjustment_id'=$1`, [a.id]);
      await audit(c, req.user.id, `adjustment_${decision}`, 'stock_adjustments', a.id);
    });
    res.json({ ok: true });
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

module.exports = router;
