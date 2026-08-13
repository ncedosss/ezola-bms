const router = require('express').Router();
const pool = require('../db');
const { requireAuth, requireRole, MANAGERS, RECON_USERS } = require('../middleware/auth');
const { businessDate, audit, alert, tx, httpErr } = require('../lib/helpers');

router.use(requireAuth);

// Who can spend the tin: managers + the shop attendant (they physically spend it)
const PETTY_SPENDERS = ['owner', 'office_manager', 'facility_manager', 'shop_attendant'];

// Low-balance threshold (Rands). Alerts owner/office when the float drops to/under this.
const PETTY_LOW_THRESHOLD = 200;

// Single source of truth for the balance: topups in, expenses out (counts don't move it)
async function pettyBalance(client) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN type='topup' THEN amount
                              WHEN type='expense' THEN -amount ELSE 0 END),0) AS balance
     FROM petty_cash_entries`);
  return Number(rows[0].balance);
}

// Fire a low-balance alert when a movement leaves the float at/under threshold (deduped like low_stock)
async function checkPettyLow(client, balance) {
  if (balance <= PETTY_LOW_THRESHOLD) {
    const dup = await client.query(
      `SELECT 1 FROM alerts WHERE type='petty_cash_low' AND acknowledged=FALSE`);
    if (dup.rowCount === 0)
      await alert(client, 'petty_cash_low',
        `Petty cash is low: R${balance.toFixed(2)} left (threshold R${PETTY_LOW_THRESHOLD}). Top up the tin.`,
        { balance });
  }
}

// Ledger + current balance (managers)
router.get('/', requireRole(MANAGERS), async (req, res) => {
  const balance = await pettyBalance(pool);
  const { rows } = await pool.query(
    `SELECT p.*, u.name AS created_by_name
     FROM petty_cash_entries p JOIN users u ON u.id=p.created_by
     ORDER BY p.created_at DESC LIMIT 200`);
  res.json({ balance, entries: rows, low_threshold: PETTY_LOW_THRESHOLD });
});

// Top up the float - owner loads the tin (managers only)
router.post('/topup', requireRole(MANAGERS), async (req, res) => {
  const { amount, description } = req.body;
  if (!(Number(amount) > 0)) return res.status(400).json({ error: 'Top-up amount must be greater than zero' });
  try {
    const out = await tx(async (c) => {
      const e = (await c.query(
        `INSERT INTO petty_cash_entries (type,amount,description,created_by,business_date)
         VALUES ('topup',$1,$2,$3,$4) RETURNING *`,
        [amount, description || null, req.user.id, businessDate()])).rows[0];
      await audit(c, req.user.id, 'petty_topup', 'petty_cash_entries', e.id, { amount });
      return e;
    });
    res.status(201).json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

// Record an expense - money out, reason mandatory, receipt ref optional (spenders)
router.post('/expense', requireRole(PETTY_SPENDERS), async (req, res) => {
  const { amount, description, receipt_ref } = req.body;
  if (!(Number(amount) > 0)) return res.status(400).json({ error: 'Expense amount must be greater than zero' });
  if (!description || !description.trim()) return res.status(400).json({ error: 'A reason is required for a petty cash expense' });
  try {
    const out = await tx(async (c) => {
      const e = (await c.query(
        `INSERT INTO petty_cash_entries (type,amount,description,receipt_ref,created_by,business_date)
         VALUES ('expense',$1,$2,$3,$4,$5) RETURNING *`,
        [amount, description.trim(), receipt_ref || null, req.user.id, businessDate()])).rows[0];
      await audit(c, req.user.id, 'petty_expense', 'petty_cash_entries', e.id,
        { amount, reason: description.trim() });
      const bal = await pettyBalance(c);
      await checkPettyLow(c, bal);
      return { entry: e, balance: bal };
    });
    res.status(201).json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

// Count the tin - records what was physically there vs expected (owner + office manager)
router.post('/count', requireRole(RECON_USERS), async (req, res) => {
  const { counted_amount, description } = req.body;
  if (counted_amount == null || !(Number(counted_amount) >= 0))
    return res.status(400).json({ error: 'Counted amount required' });
  try {
    const out = await tx(async (c) => {
      const expected = await pettyBalance(c);
      const variance = Math.round((Number(counted_amount) - expected) * 100) / 100;
      const e = (await c.query(
        `INSERT INTO petty_cash_entries (type,amount,counted_amount,variance,description,created_by,business_date)
         VALUES ('count',0,$1,$2,$3,$4,$5) RETURNING *`,
        [counted_amount, variance, description || null, req.user.id, businessDate()])).rows[0];
      if (Math.abs(variance) >= 50)
        await alert(c, 'petty_cash_variance',
          `Petty cash count off by R${variance}: counted R${Number(counted_amount).toFixed(2)} vs expected R${expected.toFixed(2)}`,
          { variance, expected, counted: Number(counted_amount) });
      await audit(c, req.user.id, 'petty_count', 'petty_cash_entries', e.id, { expected, counted: counted_amount, variance });
      return { entry: e, expected, variance };
    });
    res.status(201).json(out);
  } catch (e) { res.status(httpErr(e)).json({ error: e.message }); }
});

module.exports = router;