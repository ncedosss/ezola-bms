import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import { useToast } from '../components/Toast.jsx';

// Owner-only: set prices, flip availability, add kitchen/add-on items, and price shop stock.
export default function Menu() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const load = () => api('/api/menu').then(setItems).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const setField = (id, field, value) =>
    setItems(items.map((m) => (m.id === id ? { ...m, [field]: value, _dirty: true } : m)));

  const save = async (m) => {
    try {
      const num = (v) => (v === '' || v === null ? null : Number(v));
      await api(`/api/menu/${m.id}`, { method: 'PATCH', body: {
        price_sit_down: num(m.price_sit_down), price_takeaway: num(m.price_takeaway),
        price_per_kg: num(m.price_per_kg), price_unit: num(m.price_unit),
        is_available: m.is_available,
      }});
      toast(`${m.name} saved.`, 'success'); load();
    } catch (e) { toast(e.message, 'error', 7000); }
  };

  const del = async (m) => {
    try {
      await api(`/api/menu/${m.id}`, { method: 'DELETE' });
      toast(`${m.name} deleted.`, 'success');
    } catch (e) { toast(e.message, 'error', 7000); }
    finally { setConfirmDel(null); load(); }
  };

  const cats = [...new Set(items.map((m) => m.category))];
  const P = ({ m, field }) => (
    <input type="number" step="0.01" style={{ width: 90 }} value={m[field] ?? ''}
      onChange={(e) => setField(m.id, field, e.target.value)} />
  );

  return (
    <>
      <div className="btnrow" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Menu &amp; Prices</h1>
          <div className="sub">Owner only. Changes apply to new orders immediately and are audit-logged.</div>
        </div>
        <div className="btnrow" style={{ gap: 8 }}>
          <button className="btn green" onClick={() => setShowShop(true)}>+ Price shop item</button>
          <button className="btn ghost" onClick={() => setShowNew(true)}>+ New menu item</button>
        </div>
      </div>
      {err && <div className="err" onClick={() => setErr('')}>{err}</div>}
      {cats.map((cat) => (
        <div className="panel" style={{ marginBottom: 14 }} key={cat}>
          <h2>{cat.replace(/_/g, ' ')}</h2>
          <table>
            <thead><tr><th>Item</th><th>Pricing</th><th>Available</th><th></th></tr></thead>
            <tbody>
              {items.filter((m) => m.category === cat).map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>
                    {m.pricing_type === 'dual_fixed' && <>sit-down <P m={m} field="price_sit_down" /> takeaway <P m={m} field="price_takeaway" /></>}
                    {m.pricing_type === 'per_kg' && <>per kg <P m={m} field="price_per_kg" /></>}
                    {m.pricing_type === 'unit' && <>each <P m={m} field="price_unit" /></>}
                  </td>
                  <td>
                    <button className={`btn sm ${m.is_available ? 'green' : 'red'}`}
                      onClick={() => setField(m.id, 'is_available', !m.is_available)}>
                      {m.is_available ? 'on sale' : 'off'}
                    </button>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn sm" disabled={!m._dirty} onClick={() => save(m)}>Save</button>{' '}
                    {confirmDel === m.id ? (
                      <>
                        <button className="btn sm red" onClick={() => del(m)}>Confirm</button>{' '}
                        <button className="btn sm ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn sm ghost" onClick={() => setConfirmDel(m.id)}>Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {showShop && (
        <ShopStockPricingModal
          onClose={() => setShowShop(false)}
          onSaved={(created) => { setShowShop(false); toast(`${created.name} priced and added to the Tuck Shop.`, 'success'); load(); }}
        />
      )}
      {showNew && (
        <NewMenuItemModal
          onClose={() => setShowNew(false)}
          onSaved={(created) => { setShowNew(false); toast(`${created.name} added.`, 'success'); load(); }}
        />
      )}
    </>
  );
}

/* ---------------- Shop pricing: stock-first, priced-only ---------------- */
function ShopStockPricingModal({ onClose, onSaved }) {
  const [stock, setStock] = useState(null);          // null = loading
  const [category, setCategory] = useState('');
  const [stockItemId, setStockItemId] = useState('');
  const [price_unit, setPrice] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('/api/menu/shop-stock')
      .then((rows) => {
        setStock(rows);
        const first = [...new Set(rows.map((r) => r.category || 'uncategorised'))][0];
        if (first) setCategory(first);
      })
      .catch((e) => { setErr(e.message); setStock([]); });
  }, []);

  const cats = stock ? [...new Set(stock.map((r) => r.category || 'uncategorised'))].sort() : [];
  const inCat = stock ? stock.filter((r) => (r.category || 'uncategorised') === category) : [];
  const chosen = stock ? stock.find((r) => r.id === stockItemId) : null;
  const canSave = stockItemId && Number(price_unit) > 0 && !saving;

  const submit = async () => {
    setErr(''); setSaving(true);
    try {
      const created = await api('/api/menu/from-stock', { method: 'POST',
        body: { stock_item_id: stockItemId, price_unit } });
      onSaved(created);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Price a shop item</h2>
        <div className="sub">Pick a shop stock item and give it a selling price. It appears in the Tuck Shop only once priced.</div>
        {err && <div className="err">{err}</div>}

        {stock === null && <div className="sub">Loading shop stock…</div>}

        {stock && stock.length === 0 && (
          <div className="ok">Every shop stock item already has a price, or none exist yet. Add the item on the Stock page (shop register) first, then price it here.</div>
        )}

        {stock && stock.length > 0 && (
          <>
            <label>Category</label>
            <select value={category} onChange={(e) => { setCategory(e.target.value); setStockItemId(''); }}>
              {cats.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>

            <label>Stock item *</label>
            <select value={stockItemId} onChange={(e) => setStockItemId(e.target.value)}>
              <option value="">Choose…</option>
              {inCat.map((r) => <option key={r.id} value={r.id}>{r.name} (on hand: {Number(r.current_quantity)})</option>)}
            </select>

            <label>Selling price each (R) *</label>
            <input type="number" step="0.01" min="0" value={price_unit} onChange={(e) => setPrice(e.target.value)} />

            {chosen && (
              <div className="sub" style={{ marginTop: 4 }}>
                Pricing “{chosen.name}”. Each sale deducts one from its shop stock, and it shows sold-out at zero.
              </div>
            )}
          </>
        )}

        <div className="btnrow" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={!canSave} onClick={submit}>{saving ? 'Saving…' : 'Add to menu'}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Kitchen / add-on items (menu-first, no shop) ---------------- */
const MENU_CATEGORIES = [
  ['plate', 'Plate (meal)'],
  ['protein_standalone', 'Protein (standalone)'],
  ['braai_per_kg', 'Braai (per kg)'],
  ['addon', 'Add-on'],
];

const PRICING = [
  ['dual_fixed', 'Sit-down & takeaway (fixed)'],
  ['per_kg', 'Per kilogram'],
  ['unit', 'Per unit / each'],
];

const REGISTERS = [
  ['', 'Not linked'],
  ['kitchen', 'Kitchen'],
  ['guest_house', 'Guest house'],
];

function NewMenuItemModal({ onClose, onSaved }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('plate');
  const [pricing_type, setPricing] = useState('dual_fixed');
  const [price_sit_down, setSit] = useState('');
  const [price_takeaway, setTake] = useState('');
  const [price_per_kg, setKg] = useState('');
  const [price_unit, setUnit] = useState('');
  const [stock_register, setRegister] = useState('');
  const [is_available, setAvailable] = useState(true);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const priceReady =
    pricing_type === 'dual_fixed' ? (price_sit_down !== '' && price_takeaway !== '') :
    pricing_type === 'per_kg'     ? (price_per_kg !== '') :
                                    (price_unit !== '');
  const canSave = name.trim() !== '' && priceReady && !saving;

  const submit = async () => {
    setErr(''); setSaving(true);
    try {
      const created = await api('/api/menu', { method: 'POST', body: {
        name: name.trim(), category, pricing_type,
        price_sit_down, price_takeaway, price_per_kg, price_unit,
        stock_register: stock_register || null, is_available,
      }});
      onSaved(created);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New menu item</h2>
        <div className="sub">For kitchen &amp; add-on items. Shop drinks/snacks are added via “Price shop item”.</div>
        {err && <div className="err">{err}</div>}

        <label>Name *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken &amp; chips" autoFocus />

        <div className="formrow">
          <div>
            <label>Category *</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {MENU_CATEGORIES.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
            </select>
          </div>
          <div>
            <label>Pricing *</label>
            <select value={pricing_type} onChange={(e) => setPricing(e.target.value)}>
              {PRICING.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
            </select>
          </div>
        </div>

        {pricing_type === 'dual_fixed' && (
          <div className="formrow">
            <div><label>Sit-down price (R) *</label><input type="number" step="0.01" value={price_sit_down} onChange={(e) => setSit(e.target.value)} /></div>
            <div><label>Takeaway price (R) *</label><input type="number" step="0.01" value={price_takeaway} onChange={(e) => setTake(e.target.value)} /></div>
          </div>
        )}
        {pricing_type === 'per_kg' && (
          <>
            <label>Price per kg (R) *</label>
            <input type="number" step="0.01" value={price_per_kg} onChange={(e) => setKg(e.target.value)} />
          </>
        )}
        {pricing_type === 'unit' && (
          <>
            <label>Price each (R) *</label>
            <input type="number" step="0.01" value={price_unit} onChange={(e) => setUnit(e.target.value)} />
          </>
        )}

        <label>Stock register (optional)</label>
        <select value={stock_register} onChange={(e) => setRegister(e.target.value)}>
          {REGISTERS.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <input type="checkbox" checked={is_available} onChange={(e) => setAvailable(e.target.checked)} style={{ width: 'auto' }} />
          On sale straight away
        </label>

        <div className="btnrow" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={!canSave} onClick={submit}>{saving ? 'Saving…' : 'Add menu item'}</button>
        </div>
      </div>
    </div>
  );
}
