import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import { useToast } from '../components/Toast.jsx';

// Owner-only: set the real prices and flip availability (braai after renovation, alcohol after licence)
export default function Menu() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [err, setErr] = useState('');
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

  const cats = [...new Set(items.map((m) => m.category))];
  const P = ({ m, field }) => (
    <input type="number" step="0.01" style={{ width: 90 }} value={m[field] ?? ''}
      onChange={(e) => setField(m.id, field, e.target.value)} />
  );

  return (
    <>
      <h1>Menu & Prices</h1>
      <div className="sub">Owner only. Changes apply to new orders immediately and are audit-logged.</div>
      {err && <div className="err">{err}</div>}
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
                  <td><button className="btn sm" disabled={!m._dirty} onClick={() => save(m)}>Save</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}