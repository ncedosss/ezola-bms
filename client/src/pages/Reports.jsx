import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

const C = { green: '#63BE7A', sage: '#8FB7A7', ink: '#20261F', line: '#EAEEEA' };

// S13 - revenue by day/till, variance history, purchase spend, top items
export default function Reports() {
  const [data, setData] = useState(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [err, setErr] = useState('');

  const load = (f, t) => {
    const q = new URLSearchParams(); if (f) q.set('from', f); if (t) q.set('to', t);
    api(`/api/reports?${q}`).then((d) => { setData(d); setFrom(d.from); setTo(d.to); }).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []);
  if (err) return <div className="err">{err}</div>;
  if (!data) return <div className="loading">Loading…</div>;

  const days = [...new Set(data.revenue.map((r) => r.business_date))];
  const cell = (d, till, method) => Number(data.revenue.find((r) => r.business_date === d && r.till === till && r.method === method)?.total || 0);

  const revByDay = days.map((d0) => ({
    day: new Date(d0).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }),
    Restaurant: cell(d0, 'restaurant', 'cash') + cell(d0, 'restaurant', 'card'),
    'Guest house': cell(d0, 'guest_house', 'cash') + cell(d0, 'guest_house', 'card'),
  }));
  const topData = data.topItems.map((t) => ({ name: t.name, revenue: Number(t.revenue) }));
  
  return (
    <>
      <h1>Reports</h1>
      <div className="btnrow" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
        <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <button className="btn" onClick={() => load(from, to)}>Run</button>
      </div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <h2>Revenue trend</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={revByDay} margin={{ left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.line} />
            <XAxis dataKey="day" fontSize={11} tickLine={false} />
            <YAxis fontSize={11} width={52} tickFormatter={(v) => 'R' + v} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v) => R(v)} />
            <Legend />
            <Bar dataKey="Restaurant" stackId="a" fill={C.green} />
            <Bar dataKey="Guest house" stackId="a" fill={C.sage} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {revByDay.length === 0 && <div className="sub">No payments in this range.</div>}
      </div>
      <div className="panel" style={{ marginBottom: 14 }}>
        <h2>Daily revenue by till</h2>
        <table>
          <thead><tr><th>Day</th><th>Rest. cash</th><th>Rest. card</th><th>GH cash</th><th>GH card</th><th>Total</th></tr></thead>
          <tbody>
            {days.map((d) => {
              const t = cell(d,'restaurant','cash') + cell(d,'restaurant','card') + cell(d,'guest_house','cash') + cell(d,'guest_house','card');
              return (
                <tr key={d}>
                  <td>{new Date(d).toLocaleDateString('en-ZA')}</td>
                  <td>{R(cell(d,'restaurant','cash'))}</td><td>{R(cell(d,'restaurant','card'))}</td>
                  <td>{R(cell(d,'guest_house','cash'))}</td><td>{R(cell(d,'guest_house','card'))}</td>
                  <td><b>{R(t)}</b></td>
                </tr>
              );
            })}
            {days.length === 0 && <tr><td className="sub" colSpan="6">No payments in this range.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="panel">
          <h2>Top items</h2>
          {topData.length > 0 && (
            <ResponsiveContainer width="100%" height={Math.max(140, topData.length * 34)}>
              <BarChart data={topData} layout="vertical" margin={{ left: 10, right: 16 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={110} fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip formatter={(v) => R(v)} />
                <Bar dataKey="revenue" fill={C.green} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="panel">
          <h2>Variance history</h2>
          <table><tbody>
            {data.variance.map((v, i) => (
              <tr key={i}><td>{new Date(v.business_date).toLocaleDateString('en-ZA')}</td><td>{v.till.replace('_',' ')}</td>
                <td style={{ color: Number(v.cash_variance) < 0 ? '#E0685E' : '#2e7d46' }}>{R(v.cash_variance)} cash</td>
                <td style={{ color: Number(v.card_variance) < 0 ? '#E0685E' : '#2e7d46' }}>{R(v.card_variance)} card</td></tr>
            ))}
            {data.variance.length === 0 && <tr><td className="sub">No reconciliations in range.</td></tr>}
          </tbody></table>
          <h2 style={{ marginTop: 14 }}>Purchase spend by register</h2>
          <table><tbody>
            {data.purchases.map((p, i) => (
              <tr key={i}><td>{p.register.replace('_',' ')}</td><td style={{ textAlign: 'right' }}>{R(p.spend)}</td></tr>
            ))}
            {data.purchases.length === 0 && <tr><td className="sub">No purchases in range.</td></tr>}
          </tbody></table>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 14 }}>
        <h2>Stock taken between registers</h2>
        <div className="sub">Internal transfers - e.g. the kitchen taking shop stock when it ran out. Watch this against plates/items produced.</div>
        <table>
          <thead><tr><th>Item</th><th>From</th><th>To</th><th style={{ textAlign: 'right' }}>Qty</th></tr></thead>
          <tbody>
            {(data.transfers || []).map((t, i) => (
              <tr key={i}>
                <td>{t.item}</td>
                <td className="sub">{t.from_register.replace('_',' ')}</td>
                <td className="sub">{t.to_register.replace('_',' ')}</td>
                <td style={{ textAlign: 'right' }}><b>{Number(t.qty)}</b></td>
              </tr>
            ))}
            {(!data.transfers || data.transfers.length === 0) && <tr><td className="sub" colSpan="4">No transfers in range.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
