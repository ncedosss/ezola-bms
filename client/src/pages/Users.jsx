import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

const ROLES = ['owner','office_manager','facility_manager','reception','waiter','shop_attendant','kitchen'];

// Owner-only user management: add staff, reset passwords/PINs, deactivate
export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'waiter', password: '', pin: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api('/api/users').then(setUsers).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr(''); setMsg('');
    try { await api('/api/users', { method: 'POST', body: form }); setMsg('User created.'); setForm({ name: '', email: '', role: 'waiter', password: '', pin: '' }); load(); }
    catch (e) { setErr(e.message); }
  };
  const toggle = async (u) => { try { await api(`/api/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); load(); } catch (e) { setErr(e.message); } };
  const resetPin = async (u) => {
    const pin = window.prompt(`New 4-digit PIN for ${u.name}:`);
    if (!pin) return;
    try { await api(`/api/users/${u.id}`, { method: 'PATCH', body: { pin } }); setMsg('PIN updated.'); } catch (e) { setErr(e.message); }
  };
  const resetPw = async (u) => {
    const password = window.prompt(`New password for ${u.name}:`);
    if (!password) return;
    try { await api(`/api/users/${u.id}`, { method: 'PATCH', body: { password } }); setMsg('Password updated.'); } catch (e) { setErr(e.message); }
  };

  return (
    <>
      <h1>Users</h1>
      <div className="sub">Every till action is tied to whoever is signed in - keep PINs personal.</div>
      {err && <div className="err" onClick={() => setErr('')}>{err}</div>}
      {msg && <div className="ok" onClick={() => setMsg('')}>{msg}</div>}

      <div className="panel" style={{ marginBottom: 14 }}>
        <h2>Add staff member</h2>
        <div className="formrow">
          <div><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label>Email *</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label>Role *</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select></div>
        </div>
        <div className="formrow">
          <div><label>Password *</label><input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div><label>Till PIN (4 digits, optional)</label><input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></div>
          <div style={{ alignSelf: 'flex-end' }}><button className="btn green" disabled={!form.name || !form.email || !form.password} onClick={create}>Create</button></div>
        </div>
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td className="sub">{u.email}</td>
                <td><span className="badge grey">{u.role.replace('_', ' ')}</span></td>
                <td><span className={`badge ${u.active ? 'green' : 'red'}`}>{u.active ? 'active' : 'disabled'}</span></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn ghost sm" onClick={() => resetPin(u)}>PIN</button>{' '}
                  <button className="btn ghost sm" onClick={() => resetPw(u)}>Password</button>{' '}
                  <button className={`btn sm ${u.active ? 'red' : 'green'}`} onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
