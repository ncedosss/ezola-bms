import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import AsyncButton from '../components/AsyncButton.jsx';

// S08 - quick unit sales, pay instantly at the shop counter (restaurant till), no kitchen
export default function TuckShop() {
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState({}); // menu_item_id -> {item, qty}
  const [cat, setCat] = useState('drink');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { api('/api/menu').then(setMenu).catch((e) => setErr(e.message)); }, []);

  const shopItems = menu.filter((m) => m.stock_register === 'shop');
  const cats = [...new Set(shopItems.map((m) => m.category))];
  const items = shopItems.filter((m) => m.category === cat);
  const lines = Object.values(cart);
  const total = lines.reduce((t, l) => t + Number(l.item.price_unit) * l.qty, 0);

  const add = (item) => setCart({ ...cart, [item.id]: { item, qty: (cart[item.id]?.qty || 0) + 1 } });
  const sub = (item) => {
    const q = (cart[item.id]?.qty || 0) - 1;
    const next = { ...cart };
    if (q <= 0) delete next[item.id]; else next[item.id] = { item, qty: q };
    setCart(next);
  };

  const sell = async (method) => {
    setErr(''); setMsg('');
    try {
      const order = await api('/api/orders', {
        method: 'POST',
        body: { channel: 'tuck_shop', service_type: 'takeaway',
          lines: lines.map((l) => ({ menu_item_id: l.item.id, quantity: l.qty })) },
      });
      await api(`/api/orders/${order.id}/pay`, { method: 'POST', body: { method, till: 'restaurant' } });
      setMsg(`${order.order_number} sold - ${R(order.total_amount)} ${method}. Stock deducted.`);
      setCart({});
    } catch (e) { setErr(e.message); }
  };

  return (
    <>
      <h1>Tuck Shop</h1>
      <div className="sub">Tap items, then take cash or card. Every sale deducts the shop register.</div>
      {err && <div className="err" onClick={() => setErr('')}>{err}</div>}
      {msg && <div className="ok" onClick={() => setMsg('')}>{msg}</div>}
      <div className="tabs">
        {cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c.replace('_', ' ')}</button>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
      <div className="quickgrid">
          {items.map((m) => (
            <button key={m.id} disabled={!m.is_available || m.sold_out}
              onClick={() => (m.is_available && !m.sold_out) && add(m)}
              title={!m.is_available ? 'Unavailable (e.g. alcohol pending licence)' : (m.sold_out ? 'Sold out - stock at zero' : '')}>
              {m.name}<br /><small>{R(m.price_unit)}{!m.is_available ? ' · off' : (m.sold_out ? ' · sold out' : '')}</small>
            </button>
          ))}
        </div>
        <div className="panel">
          <h2>Basket</h2>
          {lines.length === 0 && <div className="sub">Empty.</div>}
          <table><tbody>
            {lines.map((l) => (
              <tr key={l.item.id}>
                <td>{l.item.name}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" onClick={() => sub(l.item)}>-</button>
                  <b style={{ padding: '0 8px' }}>{l.qty}</b>
                  <button className="btn ghost sm" onClick={() => add(l.item)}>+</button>
                </td>
                <td style={{ textAlign: 'right' }}>{R(l.item.price_unit * l.qty)}</td>
              </tr>
            ))}
          </tbody></table>
          <div style={{ margin: '12px 0', fontSize: 18 }}><b>Total {R(total)}</b></div>
          <div className="btnrow">
            <AsyncButton className="btn green" disabled={!lines.length} onClick={() => sell('cash')}>Cash</AsyncButton>
            <AsyncButton className="btn green" disabled={!lines.length} onClick={() => sell('card')}>Card</AsyncButton>
            <button className="btn ghost" disabled={!lines.length} onClick={() => setCart({})}>Clear</button>
          </div>
        </div>
      </div>
    </>
  );
}
