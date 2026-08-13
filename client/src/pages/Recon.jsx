import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';

// S12 - end of day: system expectation vs blind count, per till; variance computed server-side
export default function Recon() {
  const [summary, setSummary] = useState(null);
  const [till, setTill] = useState('restaurant');
  const [counted_cash, setCash] = useState('');
  const [counted_card, setCard] = useState('');
  const [plates_counted, setPlates] = useState('');
  const [shop_items_counted, setShop] = useState('');
  const [guests_counted, setGuests] = useState('');
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const load = () => api('/api/reconciliation/summary').then(setSummary).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const submit = async () => {
    setErr(''); setResult(null);
    try {
      const r = await api('/api/reconciliation', { method: 'POST', body: {
        till, counted_cash: Number(counted_cash), counted_card: Number(counted_card),
        plates_counted: plates_counted === '' ? null : Number(plates_counted),
        shop_items_counted: shop_items_counted === '' ? null : Number(shop_items_counted),
        guests_counted: guests_counted === '' ? null : Number(guests_counted),
        notes,
      }});
      setResult(r); load();
      setCash(''); setCard(''); setPlates(''); setShop(''); setGuests(''); setNotes('');
    } catch (e) { setErr(e.message); }
  };

  if (!summary) return <div className="loading">Loading…</div>;
  const sys = summary[till];
  const done = summary.submitted.find((s) => s.till === till);

  return (
    <>
      <h1>End of Day Reconciliation</h1>
      <div className="sub">Trading day {summary.business_date}. Count the drawer first, then enter - the system shows its expectation alongside.</div>
      {err && <div className="err" onClick={() => setErr('')}>{err}</div>}

      <div className="tabs">
        <button className={till === 'restaurant' ? 'on' : ''} onClick={() => { setTill('restaurant'); setResult(null); }}>Restaurant till</button>
        <button className={till === 'guest_house' ? 'on' : ''} onClick={() => { setTill('guest_house'); setResult(null); }}>Guest house till</button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="panel">
          <h2>System expects ({till.replace('_', ' ')})</h2>
          <table><tbody>
            <tr><td>Cash (incl. confirmed R65 walks)</td><td style={{ textAlign: 'right' }}><b>{R(sys.cash)}</b></td></tr>
            <tr><td>Card</td><td style={{ textAlign: 'right' }}><b>{R(sys.card)}</b></td></tr>
            <tr><td>Plates sold today</td><td style={{ textAlign: 'right' }}>{summary.plates_sold}</td></tr>
            <tr><td>Shop items sold today</td><td style={{ textAlign: 'right' }}>{summary.shop_items_sold}</td></tr>
            <tr><td>Guests checked in</td><td style={{ textAlign: 'right' }}>{summary.guests_checked_in}</td></tr>
          </tbody></table>
          {done && (
            <div className="ok" style={{ marginTop: 10 }}>
              Submitted: cash var {R(done.cash_variance)}, card var {R(done.card_variance)} (re-submit overwrites).
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Counted</h2>
          <div className="formrow">
            <div><label>Cash counted (R) *</label><input type="number" step="0.01" value={counted_cash} onChange={(e) => setCash(e.target.value)} /></div>
            <div><label>Card machine total (R) *</label><input type="number" step="0.01" value={counted_card} onChange={(e) => setCard(e.target.value)} /></div>
          </div>
          <div className="formrow">
            <div><label>Plates counted</label><input type="number" value={plates_counted} onChange={(e) => setPlates(e.target.value)} /></div>
            <div><label>Shop items counted</label><input type="number" value={shop_items_counted} onChange={(e) => setShop(e.target.value)} /></div>
            <div><label>Guests counted</label><input type="number" value={guests_counted} onChange={(e) => setGuests(e.target.value)} /></div>
          </div>
          <label>Notes</label>
          <textarea rows="2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="anything unusual today" />
          <button className="btn green" style={{ marginTop: 12 }} disabled={counted_cash === '' || counted_card === ''} onClick={submit}>
            Submit {till.replace('_', ' ')} count
          </button>
          {result && (
            <div className={Math.abs(result.cash_variance) >= 50 || Math.abs(result.card_variance) >= 50 ? 'err' : 'ok'} style={{ marginTop: 10 }}>
              Cash variance {R(result.cash_variance)} · card variance {R(result.card_variance)}
              {(Math.abs(result.cash_variance) >= 50 || Math.abs(result.card_variance) >= 50) && ' - owner alerted.'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
