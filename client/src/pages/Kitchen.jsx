import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import AsyncButton from '../components/AsyncButton.jsx';

// S15 - kitchen queue: only PAID slips appear (the no-invoice-no-meal rule). Card-paid meal credits flagged.
export default function Kitchen() {
  const [orders, setOrders] = useState([]);
  const [err, setErr] = useState('');
  const load = () => api('/api/orders?kitchen=true').then(setOrders).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const act = async (o, action) => {
    try { await api(`/api/orders/${o.id}/${action}`, { method: 'PATCH' }); load(); } catch (e) { setErr(e.message); }
  };
  const queue = orders.filter((o) => o.status === 'paid');
  const cooking = orders.filter((o) => o.status === 'in_kitchen');

  const Card = ({ o, children }) => (
    <div className="ordercard">
      <div className="num">{o.order_number}
        {o.room_number && <span className="badge amber"> room {o.room_number}</span>}
        {o.card_paid_credit_flag && <span className="badge green"> meal credit: CARD-PAID (no cash walked)</span>}
      </div>
      <ul>
        {(o.items || []).map((it) => (
          <li key={it.id}>
            {it.quantity > 1 ? `${it.quantity}× ` : ''}{it.name}
            {it.weight_kg && ` (${Number(it.weight_kg)}kg)`}
            {it.selected_options && ` - ${Object.values(it.selected_options).join(', ')}`}
          </li>
        ))}
      </ul>
      <div className="sub">{o.service_type.replace('_', '-')} · paid {new Date(o.paid_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</div>
      {children}
    </div>
  );

  return (
    <>
      <h1>Kitchen</h1>
      <div className="sub">Cook only what appears here - every card is a paid slip.</div>
      {err && <div className="err" onClick={() => setErr('')}>{err}</div>}
      <div className="board" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="col">
          <h3>Paid - waiting ({queue.length})</h3>
          {queue.map((o) => <Card key={o.id} o={o}><AsyncButton className="btn amber sm" onClick={() => act(o, 'start')}>Start preparing</AsyncButton></Card>)}
        </div>
        <div className="col">
          <h3>Preparing ({cooking.length})</h3>
          {cooking.map((o) => <Card key={o.id} o={o}><AsyncButton className="btn green sm" onClick={() => act(o, 'serve')}>Served</AsyncButton></Card>)}
        </div>
      </div>
    </>
  );
}
