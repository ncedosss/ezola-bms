import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import AsyncButton from '../components/AsyncButton.jsx';

// S14 - open alerts feed (low stock, variance breaches, pending adjustments, unconfirmed R65 walks)
export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [err, setErr] = useState('');
  const load = () => api('/api/alerts').then(setAlerts).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const badge = (t) => t === 'low_stock' ? 'amber' : t === 'variance_breach' ? 'red' : 'grey';
  const ack = async (a) => { try { await api(`/api/alerts/${a.id}/ack`, { method: 'PATCH' }); load(); } catch (e) { setErr(e.message); } };

  return (
    <>
      <h1>Alerts</h1>
      <div className="sub">Everything that needs a manager's eye. Acknowledge once handled.</div>
      {err && <div className="err">{err}</div>}
      <div className="panel">
        {alerts.length === 0 && <div className="sub">Nothing open. All clear.</div>}
        <table><tbody>
          {alerts.map((a) => (
            <tr key={a.id}>
              <td style={{ width: 130 }}><span className={`badge ${badge(a.type)}`}>{a.type.replace(/_/g, ' ')}</span></td>
              <td>{a.message}<div className="sub">{new Date(a.created_at).toLocaleString('en-ZA')}</div></td>
              <td style={{ width: 90 }}><AsyncButton className="btn ghost sm" onClick={() => ack(a)}>Acknowledge</AsyncButton></td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </>
  );
}
