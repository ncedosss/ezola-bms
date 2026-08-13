const pool = require('../db');

// Trading date: a payment at 00:30 belongs to the prior day (close 22:00, 00:00 Fri/Sat). Cutoff 04:00 SAST.
function businessDate(d = new Date()) {
  const shifted = new Date(d.getTime() - 4 * 3600 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(shifted); // YYYY-MM-DD
}

async function audit(client, userId, action, entity, entityId, detail = null) {
  await client.query(
    'INSERT INTO audit_log (user_id,action,entity,entity_id,detail) VALUES ($1,$2,$3,$4,$5)',
    [userId, action, entity, entityId, detail ? JSON.stringify(detail) : null]
  );
}

async function alert(client, type, message, payload = null) {
  await client.query('INSERT INTO alerts (type,message,payload) VALUES ($1,$2,$3)',
    [type, message, payload ? JSON.stringify(payload) : null]);
}

// Raise low_stock alert when threshold crossed (skipped while threshold NULL - Open Item)
async function checkLowStock(client, stockItemId) {
  const { rows } = await client.query(
    `SELECT name, register, current_quantity, low_stock_threshold FROM stock_items WHERE id=$1`, [stockItemId]);
  const s = rows[0];
  if (s && s.low_stock_threshold !== null && Number(s.current_quantity) <= Number(s.low_stock_threshold)) {
    const dup = await client.query(
      `SELECT 1 FROM alerts WHERE type='low_stock' AND acknowledged=FALSE AND payload->>'stock_item_id'=$1`, [stockItemId]);
    if (dup.rowCount === 0)
      await alert(client, 'low_stock',
        `${s.name} (${s.register}) is low: ${s.current_quantity} left (threshold ${s.low_stock_threshold})`,
        { stock_item_id: stockItemId });
  }
}

// Daily human-readable order numbers: R-014 restaurant, S-031 shop, RM-002 room
async function nextOrderNumber(client, channel, bdate) {
  const prefix = channel === 'restaurant' ? 'R' : channel === 'tuck_shop' ? 'S' : 'RM';
  const { rows } = await client.query(
    'SELECT COUNT(*)::int AS n FROM orders WHERE channel=$1 AND business_date=$2', [channel, bdate]);
  return `${prefix}-${String(rows[0].n + 1).padStart(3, '0')}`;
}

// Deduct estimated stock for a paid order (recipe_consumption; per-kg lines scale by weight)
async function deductStockForOrder(client, orderId, direction = 1) {
  const { rows: items } = await client.query(
    `SELECT oi.*, mi.pricing_type FROM order_items oi JOIN menu_items mi ON mi.id=oi.menu_item_id WHERE oi.order_id=$1`, [orderId]);
  for (const it of items) {
    const { rows: recipes } = await client.query(
      `SELECT rc.*, mo.name AS option_name, mog.name AS group_name
       FROM recipe_consumption rc
       LEFT JOIN menu_options mo ON mo.id = rc.menu_option_id
       LEFT JOIN menu_option_groups mog ON mog.id = mo.group_id
       WHERE rc.menu_item_id=$1`, [it.menu_item_id]);
    const sel = it.selected_options || {};
    for (const r of recipes) {
      if (r.menu_option_id && sel[r.group_name] !== r.option_name) continue; // option not chosen
      const factor = it.pricing_type === 'per_kg' ? Number(it.weight_kg || 0) : it.quantity;
      const qty = Number(r.quantity_per_unit) * factor * direction;
      if (qty === 0) continue;
      await client.query(
        `UPDATE stock_items SET current_quantity = current_quantity - $1, updated_at=now() WHERE id=$2`,
        [qty, r.stock_item_id]);
      await checkLowStock(client, r.stock_item_id);
    }
  }
}

// Internal transfer: move quantity from one register's item to another's, atomically.
// Not a loss - total stock is unchanged - so no approval gate (design decision B).
async function transferStock(client, fromItemId, toItemId, quantity) {
  const qty = Number(quantity);
  if (!(qty > 0)) throw Object.assign(new Error('Transfer quantity must be greater than zero'), { code: 400 });
  if (fromItemId === toItemId) throw Object.assign(new Error('Source and destination must be different items'), { code: 400 });

  const from = (await client.query(`SELECT id, name, register, current_quantity FROM stock_items WHERE id=$1 FOR UPDATE`, [fromItemId])).rows[0];
  const to = (await client.query(`SELECT id, name, register FROM stock_items WHERE id=$1 FOR UPDATE`, [toItemId])).rows[0];
  if (!from) throw Object.assign(new Error('Source stock item not found'), { code: 404 });
  if (!to) throw Object.assign(new Error('Destination stock item not found'), { code: 404 });
  if (from.register === to.register) throw Object.assign(new Error('Transfer must be between different registers'), { code: 400 });

  await client.query(`UPDATE stock_items SET current_quantity = current_quantity - $1, updated_at=now() WHERE id=$2`, [qty, fromItemId]);
  await client.query(`UPDATE stock_items SET current_quantity = current_quantity + $1, updated_at=now() WHERE id=$2`, [qty, toItemId]);
  await checkLowStock(client, fromItemId);   // the source may now be low
  return { from, to };
}

// Postgres errors carry string codes like '42P08' - never feed those to res.status()
function httpErr(e) {
  return Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : 500;
}

async function tx(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const out = await fn(client); await client.query('COMMIT'); return out; }
  catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

module.exports = { businessDate, audit, alert, checkLowStock, nextOrderNumber, deductStockForOrder, transferStock, tx, httpErr };
