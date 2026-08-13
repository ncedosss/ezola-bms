import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

// Audit trail viewer (owner + office manager) - who did what, when, with filters
export default function Audit() {
  const [data, setData] = useState(null);
  const [f, setF] = useState({ user_id: '', action: '', entity: '', from: '', to: '' });
  const [err, setErr] = useState('');

  const load = () => {
    const q = new URLSearchParams();
    Object.entries(f).forEach(([k, v]) => { if (v) q.set(k, v); });
    api(`/api/audit?${q}`).then(setData).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, []); // initial load; Apply re-runs with filters

  if (err) return <div className="err" onClick={() => setErr('')}>{err}</div>;
  if (!data) return <div className="loading">Loading…</div>;

  const upd = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const reset = () => { setF({ user_id: '', action: '', entity: '', from: '', to: '' }); setTimeout(load, 0); };

  return (
    <>
      <h1>Audit Log</h1>
      <div className="sub">Every action that moved money, stock or a guest. Read-only - the log cannot be edited.</div>

      <div className="btnrow" style={{ alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div><label>User</label>
          <select value={f.user_id} onChange={upd('user_id')}>
            <option value="">Everyone</option>
            {data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div><label>Action</label>
          <select value={f.action} onChange={upd('action')}>
            <option value="">All actions</option>
            {data.actions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div><label>Area</label>
          <select value={f.entity} onChange={upd('entity')}>
            <option value="">All areas</option>
            {data.entities.map((en) => <option key={en} value={en}>{en}</option>)}
          </select>
        </div>
        <div><label>From</label><input type="date" value={f.from} onChange={upd('from')} /></div>
        <div><label>To</label><input type="date" value={f.to} onChange={upd('to')} /></div>
        <button className="btn" onClick={load}>Apply</button>
        <button className="btn ghost" onClick={reset}>Reset</button>
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Area</th><th>Details</th></tr></thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <td className="sub" style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('en-ZA')}</td>
                <td>{r.user_name || '—'}{r.user_role && <span className="badge grey">{r.user_role.replace('_', ' ')}</span>}</td>
                <td>{r.action}</td>
                <td className="sub">{r.entity}</td>
                <td className="sub" style={{ maxWidth: 360, wordBreak: 'break-word' }}>
                  {r.detail ? Object.entries(r.detail).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : '—'}
                </td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td className="sub" colSpan="5">No matching audit entries.</td></tr>}
          </tbody>
        </table>
        {data.rows.length >= 200 && <div className="sub" style={{ marginTop: 8 }}>Showing the most recent 200 - narrow the date range to see more.</div>}
      </div>
    </>
  );
}