import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';

// Lodge palette (mirrors styles.css) so charts match the rest of the app
const C = { green: '#63BE7A', amber: '#EFB44C', red: '#E0685E', ink: '#20261F', sage: '#8FB7A7', line: '#EAEEEA' };

// S02 - today's revenue by till, occupancy, variance, low stock, pending approvals
export default function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api('/api/dashboard').then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <div className="err">{err}</div>;
  if (!d) return <div className="loading">Loading…</div>;

  const till = (t, m) => Number(d.revenue.find((r) => r.till === t && r.method === m)?.total || 0);
  const restTotal = till('restaurant', 'cash') + till('restaurant', 'card');
  const ghTotal = till('guest_house', 'cash') + till('guest_house', 'card');

  const occAvailable = Math.max(0, d.occupancy.total - d.occupancy.occupied - d.occupancy.cleaning);
  const occData = [
    { name: 'Occupied', value: d.occupancy.occupied, fill: C.red },
    { name: 'Cleaning', value: d.occupancy.cleaning, fill: C.amber },
    { name: 'Available', value: occAvailable, fill: C.green },
  ].filter((s) => s.value > 0);

  const revData = [
    { till: 'Restaurant', Cash: till('restaurant', 'cash'), Card: till('restaurant', 'card') },
    { till: 'Guest house', Cash: till('guest_house', 'cash'), Card: till('guest_house', 'card') },
  ];

  return (
    <>
      <h1>Owner Dashboard</h1>
      <div className="sub">Trading day {d.business_date}</div>

      <div className="grid cards">
        <div className="card"><div className="k">Restaurant till</div><div className="v">{R(restTotal)}</div>
          <div className="sub">cash {R(till('restaurant', 'cash'))} · card {R(till('restaurant', 'card'))}</div></div>
        <div className="card"><div className="k">Guest house till</div><div className="v">{R(ghTotal)}</div>
          <div className="sub">cash {R(till('guest_house', 'cash'))} · card {R(till('guest_house', 'card'))}</div></div>
        <div className="card"><div className="k">Occupancy</div><div className="v">{d.occupancy.occupied}/{d.occupancy.total}</div>
          <div className="sub">{d.occupancy.cleaning} cleaning</div></div>
        <div className="card"><div className="k">Petty cash</div><div className="v">{R(d.petty_cash_balance || 0)}</div></div>
        <div className="card"><div className="k">Pending approvals</div><div className="v">{d.pending_adjustments}</div></div>
        <div className="card"><div className="k">Unconfirmed R65 walks</div><div className="v">{d.unconfirmed_transfers}</div></div>
        <div className="card"><div className="k">Open alerts</div><div className="v">{d.open_alerts}</div></div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16 }}>
        <div className="panel">
          <h2>Room occupancy</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={occData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                {occData.map((s, i) => <Cell key={i} fill={s.fill} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <div className="sub" style={{ textAlign: 'center' }}>{d.occupancy.occupied} of {d.occupancy.total} rooms occupied</div>
        </div>
        <div className="panel">
          <h2>Revenue by till (today)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revData} margin={{ left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={C.line} />
              <XAxis dataKey="till" fontSize={12} tickLine={false} />
              <YAxis fontSize={11} width={52} tickFormatter={(v) => 'R' + v} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v) => R(v)} />
              <Legend />
              <Bar dataKey="Cash" stackId="a" fill={C.green} />
              <Bar dataKey="Card" stackId="a" fill={C.sage} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 16 }}>
        <div className="panel">
          <h2>Low stock</h2>
          {d.lowStock.length === 0 ? <div className="sub">Nothing below threshold.</div> : (
            <table><tbody>
              {d.lowStock.map((s, i) => (
                <tr key={i} className="lowrow"><td>{s.name}</td><td><span className="badge grey">{s.register}</span></td>
                  <td style={{ textAlign: 'right' }}>{Number(s.current_quantity)} {s.unit} (min {Number(s.low_stock_threshold)})</td></tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="panel">
          <h2>Today's reconciliation</h2>
          {d.reconciliations.length === 0 ? <div className="sub">Not submitted yet.</div> : (
            <table><tbody>
              {d.reconciliations.map((r, i) => (
                <tr key={i}><td>{r.till.replace('_', ' ')}</td>
                  <td>cash var <b style={{ color: Number(r.cash_variance) < 0 ? C.red : '#2e7d46' }}>{R(r.cash_variance)}</b></td>
                  <td>card var <b style={{ color: Number(r.card_variance) < 0 ? C.red : '#2e7d46' }}>{R(r.card_variance)}</b></td></tr>
              ))}
            </tbody></table>
          )}
          <h2 style={{ marginTop: 14 }}>Orders today</h2>
          <table><tbody>
            {d.ordersToday.map((o, i) => (
              <tr key={i}><td>{o.channel.replace('_', ' ')}</td><td>{o.n} orders</td><td style={{ textAlign: 'right' }}>{R(o.value)}</td></tr>
            ))}
            {d.ordersToday.length === 0 && <tr><td className="sub">No paid orders yet.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}