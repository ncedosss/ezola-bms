import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import AsyncButton from '../components/AsyncButton.jsx';

const ROLES = ['owner','office_manager','facility_manager','reception','waiter','shop_attendant','kitchen'];

// Owner-only user management: add staff, reset passwords/PINs, deactivate
export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', role: 'waiter', password: '', pin: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [cred, setCred] = useState(null);
  const load = () => api('/api/users').then(setUsers).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setErr(''); setMsg('');
    try { await api('/api/users', { method: 'POST', body: form }); setMsg('User created.'); setForm({ name: '', email: '', role: 'waiter', password: '', pin: '' }); load(); }
    catch (e) { setErr(e.message); }
  };
  const toggle = async (u) => { try { await api(`/api/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } }); load(); } catch (e) { setErr(e.message); } };
  const resetPin = (u) => { setErr(''); setMsg(''); setCred({ user: u, kind: 'pin' }); };
  const resetPw  = (u) => { setErr(''); setMsg(''); setCred({ user: u, kind: 'password' }); };

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
      {cred && (
        <CredentialModal
          cred={cred}
          onClose={() => setCred(null)}
          onSaved={(m) => { setCred(null); setMsg(m); }}
        />
      )}
    </>
  );
}
function CredentialModal({ cred, onClose, onSaved }) {
  const { user, kind } = cred;
  const isPin = kind === 'pin';
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const valid = isPin ? /^\d{4}$/.test(value) : value.trim().length > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true); setErr('');
    try {
      const body = isPin ? { pin: value } : { password: value };
      await api(`/api/users/${user.id}`, { method: 'PATCH', body });
      onSaved(isPin ? `PIN updated for ${user.name}.` : `Password updated for ${user.name}.`);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2>{isPin ? 'Set till PIN' : 'Reset password'}</h2>
        <div className="sub">{user.name} · {user.email}</div>
        {err && <div className="err">{err}</div>}
        <label>{isPin ? 'New 4-digit PIN' : 'New password'}</label>
        <input
          autoFocus
          type={isPin ? 'text' : 'password'}
          inputMode={isPin ? 'numeric' : undefined}
          maxLength={isPin ? 4 : undefined}
          value={value}
          onChange={(e) => setValue(isPin ? e.target.value.replace(/\D/g, '') : e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
          placeholder={isPin ? '4 digits' : 'Enter a new password'}
        />
        {isPin && <div className="sub" style={{ margin: '6px 0 0' }}>Numbers only, exactly 4 digits.</div>}
        <div className="btnrow" style={{ marginTop: 16, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={!valid || saving} onClick={save}>
            {saving ? 'Saving…' : (isPin ? 'Save PIN' : 'Save password')}
          </button>
        </div>
      </div>
    </div>
  );
}