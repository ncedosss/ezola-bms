import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import { useToast } from '../components/Toast.jsx';  

// S03 room grid + S04 check-in + S05 stays & checkout + R65 cash-transfer confirms
export default function Rooms() {
  const [rooms, setRooms] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [checkin, setCheckin] = useState(null);   // room being checked in
  const [checkout, setCheckout] = useState(null); // stay row for checkout/topup modal
  const [err, setErr] = useState('');
  const [, tick] = useState(0);

  const load = () => {
    api('/api/guesthouse/rooms').then(setRooms).catch((e) => setErr(e.message));
    api('/api/guesthouse/cash-transfers').then(setTransfers).catch(() => {});
  };
  useEffect(() => { load(); const t = setInterval(() => { tick((x) => x + 1); }, 30000); return () => clearInterval(t); }, []);

  const remaining = (r) => {
    if (!r.expires_at) return null;
    const ms = new Date(r.expires_at) - Date.now();
    const h = Math.floor(Math.abs(ms) / 3600000), m = Math.floor((Math.abs(ms) % 3600000) / 60000);
    return { over: ms < 0, text: `${ms < 0 ? '-' : ''}${h}h ${String(m).padStart(2, '0')}m` };
  };
  const setStatus = async (room, status) => {
    try { await api(`/api/guesthouse/rooms/${room.id}/status`, { method: 'PATCH', body: { status } }); load(); }
    catch (e) { setErr(e.message); }
  };
  const unconfirmed = transfers.filter((t) => !t.confirmed_at);

  return (
    <>
      <h1>Guest House</h1>
      <div className="sub">Tap a vacant room to check a guest in; tap an occupied room to top up or check out.</div>
      {err && <div className="err" onClick={() => setErr('')}>{err}</div>}

      {unconfirmed.length > 0 && (
        <div className="panel" style={{ marginBottom: 14, borderLeft: '4px solid #EFB44C' }}>
          <h2>R65 walks awaiting restaurant confirmation</h2>
          {unconfirmed.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span>{R(t.amount)} - room {t.room_number || '?'} ({t.guest_name || 'guest'})</span>
              <span className="badge amber">waiting for restaurant till</span>
            </div>
          ))}
        </div>
      )}

      <div className="roomgrid">
        {rooms.map((r) => {
          const t = remaining(r);
          return (
            <div key={r.id} className={`room ${r.status}`} onClick={() => {
              if (r.status === 'vacant') setCheckin(r);
              else if (r.status === 'occupied') setCheckout(r);
            }}>
              <div className="rn">{r.room_number}</div>
              <div className="meta">{r.floor} · {R(r.hourly_rate)}/hr {r.has_tv ? '· TV' : ''}{r.has_fridge ? ' · Fridge' : ''}</div>
              {r.status === 'occupied' && (
                <>
                  <div className="meta">{r.guest_name} · {r.stay_type}</div>
                  {t && <div className={`timer ${t.over ? 'over' : ''}`}>{t.over ? 'OVERDUE ' : ''}{t.text}</div>}
                </>
              )}
              {r.status === 'cleaning' && (
                <button className="btn sm green" style={{ marginTop: 8 }}
                  onClick={(e) => { e.stopPropagation(); setStatus(r, 'vacant'); }}>Cleaned - mark vacant</button>
              )}
              <div style={{ marginTop: 6 }}>
                <span className={`badge ${r.status === 'vacant' ? 'green' : r.status === 'occupied' ? 'red' : 'amber'}`}>{r.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {checkin && <CheckInModal room={checkin} onClose={() => { setCheckin(null); load(); }} />}
      {checkout && <StayModal room={checkout} onClose={() => { setCheckout(null); load(); }} />}
    </>
  );
}

function CheckInModal({ room, onClose }) {
  const toast = useToast();
  const [guest_name, setName] = useState('');
  const [stay_type, setType] = useState('hourly');
  const [hours, setHours] = useState(1);
  const [payment_method, setMethod] = useState('cash');
  const [condoms, setCondoms] = useState(0);
  const [err, setErr] = useState('');
  const CONDOM_PRICE = 10;
  const roomAmount = stay_type === 'hourly' ? Number(room.hourly_rate) * hours : Number(room.overnight_rate);
  const amount = roomAmount + condoms * CONDOM_PRICE;

  const submit = async () => {
    setErr('');
    try {
      const out = await api('/api/guesthouse/stays', {
        method: 'POST',
        body: { room_id: room.id, guest_name, stay_type, hours: Number(hours), payment_method, condoms: Number(condoms) },
      });
    if (out.meal_credit) {
        if (out.meal_credit.funding_method === 'cash_walked')
          toast('Walk R65 CASH to the restaurant till now - transfer logged, restaurant must confirm.', 'warn', 10000);
        else
          toast('Overnight paid by CARD: kitchen slip will show a card-paid meal credit. No cash moves.', 'info', 8000);
      }
      toast(`Room ${room.room_number} checked in - ${guest_name.trim()}`, 'success');
      onClose();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Check in - Room {room.room_number}</h2>
        <div className="sub">{room.floor} · {R(room.hourly_rate)}/hour · overnight {R(room.overnight_rate)} (includes R65 plate)</div>
        {err && <div className="err">{err}</div>}
        <label>Guest name *</label>
        <input value={guest_name} onChange={(e) => setName(e.target.value)} autoFocus />
        <label>Stay type</label>
        <div className="tabs">
          <button className={stay_type === 'hourly' ? 'on' : ''} onClick={() => setType('hourly')}>Hourly (1-5)</button>
          <button className={stay_type === 'overnight' ? 'on' : ''} onClick={() => setType('overnight')}>Overnight R550</button>
        </div>
        {stay_type === 'hourly' && (
          <>
            <label>Hours</label>
            <div className="tabs">
              {[1,2,3,4,5].map((h) => (
                <button key={h} className={hours === h ? 'on' : ''} onClick={() => setHours(h)}>{h}h</button>
              ))}
            </div>
          </>
        )}
        <label>Payment (upfront - keys only after payment)</label>
        <div className="tabs">
          <button className={payment_method === 'cash' ? 'on' : ''} onClick={() => setMethod('cash')}>Cash</button>
          <button className={payment_method === 'card' ? 'on' : ''} onClick={() => setMethod('card')}>Card</button>
        </div>
        <label>Protection (condoms) - {R(CONDOM_PRICE)} each</label>
        <div className="tabs">
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <button key={n} className={condoms === n ? 'on' : ''} onClick={() => setCondoms(n)}>{n}</button>
          ))}
        </div>
        <div className="btnrow" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={!guest_name.trim()} onClick={submit}>
            Take {R(amount)}{condoms > 0 ? ` (room ${R(roomAmount)} + ${condoms}× condom)` : ''} & check in
          </button>
        </div>
      </div>
    </div>
  );
}

function StayModal({ room, onClose }) {
  const toast = useToast();
  const [stay, setStay] = useState(null);
  const [extra, setExtra] = useState(1);
  const [method, setMethod] = useState('cash');
  const [err, setErr] = useState('');
  const [overdueInfo, setOverdueInfo] = useState(null);

  useEffect(() => {
    api('/api/guesthouse/stays/active').then((rows) => setStay(rows.find((s) => s.id === room.stay_id))).catch((e) => setErr(e.message));
  }, [room]);

  if (!stay) return null;
  const topup = async () => {
    setErr('');
    try {
      await api(`/api/guesthouse/stays/${stay.id}/topup`, { method: 'POST', body: { extra_hours: Number(extra), payment_method: method } });
      onClose();
    } catch (e) { setErr(e.message); }
  };
  const doCheckout = async (payMethod) => {
    setErr('');
    try {
      const out = await api(`/api/guesthouse/stays/${stay.id}/checkout`, {
        method: 'POST', body: payMethod ? { overstay_payment_method: payMethod } : {},
      });
    if (out.overstay_charge > 0) toast(`Overstay collected: ${R(out.overstay_charge)} (${out.extra_hours}h). Room moved to cleaning.`, 'warn', 8000);
      else toast('Checked out - room moved to cleaning.', 'success');
      onClose();
    } catch (e) {
      if (e.message.includes('overstayed')) setOverdueInfo(e.message);
      else setErr(e.message);
    }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Room {room.room_number} - {stay.guest_name}</h2>
        <div className="sub">
          {stay.stay_type} · paid {R(stay.amount_paid)}
          {stay.expires_at && <> · expires {new Date(stay.expires_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</>}
        </div>
        {err && <div className="err">{err}</div>}
        {Array.isArray(stay.meal_credits) && stay.meal_credits.some((m) => m.status === 'issued') && (
          <div className="ok">Unredeemed R65 meal credit on this stay ({stay.meal_credits.find(m=>m.status==='issued').funding_method === 'cash_walked' ? 'cash walked' : 'card noted'}).</div>
        )}

        {stay.stay_type === 'hourly' && (
          <div className="panel" style={{ margin: '10px 0' }}>
            <h2>Top up (pay-as-you-go)</h2>
            <div className="formrow">
              <div><label>Extra hours</label>
                <select value={extra} onChange={(e) => setExtra(e.target.value)}>{[1,2,3,4,5].map((h) => <option key={h} value={h}>{h}</option>)}</select></div>
              <div><label>Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="cash">Cash</option><option value="card">Card</option></select></div>
            </div>
            <button className="btn amber" style={{ marginTop: 10 }} onClick={topup}>
              Take {R(Number(room.hourly_rate) * extra)} & extend
            </button>
          </div>
        )}

        <div className="panel" style={{ margin: '10px 0' }}>
          <h2>Check out (key returned)</h2>
          <div className="sub">Early departure: no refunds. Overstay: system charges the extra hours automatically.</div>
          {overdueInfo ? (
            <>
              <div className="err">{overdueInfo}</div>
              <div className="btnrow">
                <button className="btn green" onClick={() => doCheckout('cash')}>Collected cash</button>
                <button className="btn green" onClick={() => doCheckout('card')}>Collected card</button>
              </div>
            </>
          ) : (
            <button className="btn red" onClick={() => doCheckout(null)}>Check out - room to cleaning</button>
          )}
        </div>

        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
