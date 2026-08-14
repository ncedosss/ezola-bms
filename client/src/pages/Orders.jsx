import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../App.jsx';

// 5× 4-seater (1-5), 3× 8-seater (6-8), 1× 3-couch (9)
const TABLES = [
  ...[1, 2, 3, 4, 5].map((n) => ({ n, label: `Table ${n} · 4-seater` })),
  ...[6, 7, 8].map((n) => ({ n, label: `Table ${n} · 8-seater` })),
  { n: 9, label: 'Table 9 · 3-couch' },
];
const tableLabel = (n) => TABLES.find((t) => t.n === n)?.label || (n ? `Table ${n}` : '');

// S06 orders board + S07 new order / plate builder (till-first: pay to send to kitchen)
export default function Orders() {
  const toast = useToast();
  const { user } = useAuth();
  const isManager = ['owner', 'office_manager', 'facility_manager'].includes(user.role);
  const canTakePayment = ['owner', 'office_manager', 'facility_manager', 'shop_attendant'].includes(user.role);
   const isWaiter = user.role === 'waiter';
  const [till, setTill] = useState('restaurant');
  const [voidTarget, setVoidTarget] = useState(null);
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [stays, setStays] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState('');

  const load = () => {
    api('/api/orders').then(setOrders).catch((e) => setErr(e.message));
    api('/api/menu').then(setMenu).catch(() => {});
    api('/api/guesthouse/stays/active').then(setStays).catch(() => setStays([]));
    api('/api/guesthouse/cash-transfers').then(setTransfers).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const cols = [
    ['draft', 'Draft (unpaid)'],
    ['paid', 'Paid - kitchen queue'],
    ['in_kitchen', 'In kitchen'],
    ['served', 'Served'],
  ];

  const confirmWalk = async (t) => {
    try {
      await api(`/api/guesthouse/cash-transfers/${t.id}/confirm`, { method: 'PATCH' });
      toast(`${R(t.amount)} walk from ${t.room_number ? 'room ' + t.room_number : 'guest house'} confirmed - counted into this till's cash.`, 'success');
      load();
    } catch (e) { toast(e.message, 'error', 7000); }
  };
  const unconfirmed = transfers.filter((t) => !t.confirmed_at);

  const pay = async (o, method) => {
    try { await api(`/api/orders/${o.id}/pay`, { method: 'POST', body: { method, till } }); load(); }
    catch (e) { setErr(e.message); }
  };
  const cancel = async (o) => {
    try { await api(`/api/orders/${o.id}/cancel`, { method: 'PATCH' }); load(); } catch (e) { setErr(e.message); }
  };

  return (
    <>
      <div className="btnrow" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1>Restaurant Orders</h1><div className="sub">Kitchen prepares nothing without a paid slip.</div></div>
        <button className="btn green" onClick={() => setShowNew(true)}>+ New order</button>
      </div>
      {err && <div className="err" onClick={() => setErr('')}>{err}</div>}
      <div className="tabs">
        <span className="sub" style={{ alignSelf: 'center', marginRight: 6 }}>Taking payment at:</span>
        <button className={till === 'restaurant' ? 'on' : ''} onClick={() => setTill('restaurant')}>Restaurant till</button>
        {!isWaiter && (
          <button className={till === 'guest_house' ? 'on' : ''} onClick={() => setTill('guest_house')}>Guest house till</button>
        )}
      </div>
      {unconfirmed.length > 0 && (
        <div className="panel" style={{ marginBottom: 14, borderLeft: '4px solid #EFB44C' }}>
          <h2>Cash arriving from guest house - confirm when it's in the drawer</h2>
          {unconfirmed.map((t) => (
            <div key={t.id} className="btnrow" style={{ alignItems: 'center', marginBottom: 6 }}>
              <span>{R(t.amount)} - room {t.room_number || '?'} ({t.guest_name || 'guest'}), carried by {t.carried_by_name}</span>
              <button className="btn green sm" onClick={() => confirmWalk(t)}>Confirm received</button>
            </div>
          ))}
        </div>
      )}
      <div className="board">
        {cols.map(([st, title]) => (
          <div className="col" key={st}>
            <h3>{title}</h3>
            {orders.filter((o) => o.status === st && o.channel !== 'tuck_shop').map((o) => (
              <div className="ordercard" key={o.id}>
                <div className="num">{o.order_number} 
                  {o.channel === 'restaurant' && o.table_number && <span className="badge amber">Table {o.table_number}</span>}
                  {o.channel === 'room' && <span className="badge amber">room {o.room_number}</span>}
                  {o.card_paid_credit_flag && <span className="badge green">credit: card-paid</span>}</div>
                <ul>
                  {(o.items || []).map((it) => (
                    <li key={it.id}>
                      {it.quantity > 1 ? `${it.quantity}× ` : ''}{it.name}
                      {it.weight_kg && ` (${Number(it.weight_kg)}kg)`}
                      {it.selected_options && ` - ${Object.values(it.selected_options).join(', ')}`}
                      {it.meal_credit_id && ' [meal credit]'}
                    </li>
                  ))}
                </ul>
                <div><b>{R(o.total_amount)}</b> · {o.service_type.replace('_', '-')}</div>
                {st === 'draft' && (
                  <div className="btnrow" style={{ marginTop: 8 }}>
                    {canTakePayment && <button className="btn green sm" onClick={() => pay(o, 'cash')}>Paid cash</button>}
                    {canTakePayment && <button className="btn green sm" onClick={() => pay(o, 'card')}>Paid card</button>}
                    <button className="btn ghost sm" onClick={() => cancel(o)}>Cancel</button>
                  </div>
                )}
                {st !== 'draft' && isManager && (
                  <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setVoidTarget(o)}>Void</button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      {showNew && <NewOrder menu={menu} stays={stays} onClose={() => { setShowNew(false); load(); }} />}
      {voidTarget && <VoidModal order={voidTarget} onDone={() => { setVoidTarget(null); load(); }} toast={toast} />}
    </>
  );
}

function NewOrder({ menu, stays, onClose }) {
  const { user } = useAuth();
  const isWaiter = user.role === 'waiter';
  const [channel, setChannel] = useState('restaurant');
  const [stayId, setStayId] = useState('');
  const [service, setService] = useState('sit_down');
  const [tableNumber, setTableNumber] = useState('');
  const [lines, setLines] = useState([]);
  const [err, setErr] = useState('');

  const plates = menu.filter((m) => m.category === 'plate' && m.is_available);
  const braai = menu.filter((m) => m.category === 'braai_per_kg');
  const addons = menu.filter((m) => ['addon', 'protein_standalone'].includes(m.category) && m.is_available);
  const stay = stays.find((s) => s.id === stayId);
  const hasCredit = stay && (stay.meal_credits || []).some((m) => m.status === 'issued');

  const addPlate = (item) => {
    const sel = {};
    for (const g of item.option_groups || []) sel[g.name] = g.options[0]?.name;
    setLines([...lines, { menu_item_id: item.id, name: item.name, quantity: 1, selected_options: sel,
      option_groups: item.option_groups, price: service === 'takeaway' ? item.price_takeaway : item.price_sit_down, type: 'dual_fixed' }]);
  };
  const addUnit = (item) => setLines([...lines, { menu_item_id: item.id, name: item.name, quantity: 1, price: item.price_unit, type: 'unit' }]);
  const addKg = (item) => setLines([...lines, { menu_item_id: item.id, name: item.name, weight_kg: '', price: item.price_per_kg, type: 'per_kg' }]);

  const total = lines.reduce((t, l) => {
    let lt = l.type === 'per_kg' ? Number(l.weight_kg || 0) * Number(l.price) : Number(l.price) * (l.quantity || 1);
    if (l.use_meal_credit) lt = Math.max(0, lt - 65);
    return t + lt;
  }, 0);

  const submit = async () => {
    setErr('');
    try {
      await api('/api/orders', {
        method: 'POST',
        body: {
          channel, stay_id: channel === 'room' ? stayId : null, service_type: service,
          table_number: channel === 'restaurant' ? Number(tableNumber) : null,
          lines: lines.map((l) => ({
            menu_item_id: l.menu_item_id, quantity: l.quantity || 1,
            weight_kg: l.weight_kg ? Number(l.weight_kg) : null,
            selected_options: l.selected_options || null,
            use_meal_credit: !!l.use_meal_credit,
          })),
        },
      });
      onClose();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h2>New order</h2>
        {err && <div className="err">{err}</div>}
        <div className="tabs">
          <button className={channel === 'restaurant' ? 'on' : ''} onClick={() => setChannel('restaurant')}>Restaurant</button>
          <button className={channel === 'room' ? 'on' : ''} onClick={() => setChannel('room')}>Room guest</button>
        </div>
        {channel === 'room' && (
          <>
            <label>Guest / room</label>
            <select value={stayId} onChange={(e) => setStayId(e.target.value)}>
              <option value="">Select active stay…</option>
              {stays.map((s) => <option key={s.id} value={s.id}>{s.room_number} - {s.guest_name} ({s.stay_type})</option>)}
            </select>
            {hasCredit && <div className="ok">This stay has overnight meal credit for 2 plates (R65 each) - tick "use credit" on up to two plate lines.</div>}
          </>
        )}
        {channel === 'restaurant' && (
          <>
            <label>Table *</label>
            <select value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}>
              <option value="">Select table…</option>
              {TABLES.map((t) => <option key={t.n} value={t.n}>{t.label}</option>)}
            </select>
          </>
        )}
        <label>Service (picks R65 sit-down / R70 takeaway on plates; eaten in room = sit-down)</label>
        <div className="tabs">
          <button className={service === 'sit_down' ? 'on' : ''} onClick={() => setService('sit_down')}>Sit-down / in-room</button>
          <button className={service === 'takeaway' ? 'on' : ''} onClick={() => setService('takeaway')}>Takeaway</button>
        </div>

        <label>Add items</label>
        <div className="quickgrid">
          {plates.map((m) => (
            <button key={m.id} disabled={m.sold_out} title={m.sold_out ? 'Sold out - an ingredient is at zero' : ''}
              onClick={() => !m.sold_out && addPlate(m)}>
              {m.name}<br /><small>{R(service === 'takeaway' ? m.price_takeaway : m.price_sit_down)}{m.sold_out && ' · sold out'}</small>
            </button>
          ))}
          {addons.map((m) => (
            <button key={m.id} disabled={m.sold_out} title={m.sold_out ? 'Sold out' : ''}
              onClick={() => !m.sold_out && addUnit(m)}>
              {m.name}<br /><small>{R(m.price_unit)}{m.sold_out && ' · sold out'}</small>
            </button>
          ))}
          {braai.map((m) => (
            <button key={m.id} disabled={!m.is_available || m.sold_out}
              title={!m.is_available ? 'Unavailable - Tshisa Nyama under renovation' : (m.sold_out ? 'Sold out' : '')}
              onClick={() => (m.is_available && !m.sold_out) && addKg(m)}>
              {m.name}<br /><small>{R(m.price_per_kg)}/kg{!m.is_available ? ' · closed' : (m.sold_out ? ' · sold out' : '')}</small>
            </button>
          ))}
        </div>

        {lines.length > 0 && (
          <table style={{ marginTop: 12 }}>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td style={{ verticalAlign: 'middle' }}>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      {l.name}
                      {l.option_groups?.map((g) => (
                        <select key={g.id} style={{ width: 'auto', padding: '3px 6px', minHeight: 'auto' }}
                          value={l.selected_options[g.name]}
                          onChange={(e) => {
                            const next = [...lines];
                            next[i] = { ...l, selected_options: { ...l.selected_options, [g.name]: e.target.value } };
                            setLines(next);
                          }}>
                          {g.options.map((o) => <option key={o.id}>{o.name}</option>)}
                        </select>
                      ))}
                      {l.type === 'per_kg' && (
                        <input type="number" step="0.01" placeholder="kg" style={{ width: 90, padding: '3px 6px', minHeight: 'auto' }}
                          value={l.weight_kg}
                          onChange={(e) => { const next = [...lines]; next[i] = { ...l, weight_kg: e.target.value }; setLines(next); }} />
                      )}
                      {l.type === 'dual_fixed' && channel === 'room' && hasCredit && (
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 400, whiteSpace: 'nowrap' }}>
                          <input type="checkbox" style={{ width: 'auto', minHeight: 'auto', margin: 0 }} checked={!!l.use_meal_credit}
                            onChange={(e) => { const next = [...lines]; next[i] = { ...l, use_meal_credit: e.target.checked }; setLines(next); }} /> use R65 credit
                        </label>
                      )}
                    </div>
                  </td>
                  <td style={{ width: 70, verticalAlign: 'middle' }}>
                    {l.type !== 'per_kg' && (
                      <input type="number" min="1" value={l.quantity} style={{ padding: '3px 6px', minHeight: 'auto', textAlign: 'center' }}
                        onChange={(e) => { const next = [...lines]; next[i] = { ...l, quantity: Math.max(1, +e.target.value) }; setLines(next); }} />
                    )}
                  </td>
                  <td style={{ textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                    {R((l.type === 'per_kg' ? Number(l.weight_kg || 0) * l.price : l.price * (l.quantity || 1)) - (l.use_meal_credit ? 65 : 0))}
                  </td>
                  <td style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                    <button className="btn ghost sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="btnrow" style={{ marginTop: 16, justifyContent: 'space-between', alignItems: 'center' }}>
          <b>Total {R(total)}</b>
          <div className="btnrow">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn green" disabled={!lines.length || (channel === 'room' && !stayId) || (channel === 'restaurant' && !tableNumber)} onClick={submit}>
              Take an order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VoidModal({ order, onDone, toast }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const submit = async () => {
    try {
      await api(`/api/orders/${order.id}/void`, { method: 'POST', body: { reason } });
      toast(`${order.order_number} voided - ${R(order.amount_paid)} reversed, stock restored.`, 'warn', 8000);
      onDone();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="modal-back" onClick={onDone}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Void {order.order_number}</h2>
        <div className="sub">Reverses {R(order.amount_paid)} on the original till, restores stock, reissues any meal credit. The owner is alerted.</div>
        {err && <div className="err">{err}</div>}
        <label>Reason * (mandatory, goes to the audit log)</label>
        <textarea rows="2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. keyed wrong item, customer cancelled before cooking" />
        <div className="btnrow" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onDone}>Cancel</button>
          <button className="btn red" disabled={!reason.trim()} onClick={submit}>Void order</button>
        </div>
      </div>
    </div>
  );
}
