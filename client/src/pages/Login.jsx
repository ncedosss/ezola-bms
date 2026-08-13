import React, { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';

// S01 - email+password (web) plus fast PIN switch for the shared till tablet
export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState('pin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  const submitEmail = async (e) => {
    e.preventDefault(); setErr('');
    try { login(await api('/api/auth/login', { method: 'POST', body: { email, password } })); }
    catch (ex) { setErr(ex.message); }
  };
  const pushPin = async (d) => {
    setErr('');
    const next = pin + d;
    setPin(next);
    if (next.length === 4) {
      try { login(await api('/api/auth/pin', { method: 'POST', body: { pin: next } })); }
      catch (ex) { setErr(ex.message); setPin(''); }
    }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand">EZOLA<span style={{ color: '#63BE7A' }}>BMS</span></div>
        <div className="tabs">
          <button className={mode === 'pin' ? 'on' : ''} onClick={() => setMode('pin')}>Till PIN</button>
          <button className={mode === 'email' ? 'on' : ''} onClick={() => setMode('email')}>Email login</button>
        </div>
        {err && <div className="err">{err}</div>}
        {mode === 'email' ? (
          <form onSubmit={submitEmail}>
            <label>Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <div style={{ marginTop: 16 }}><button className="btn green" style={{ width: '100%' }}>Sign in</button></div>
          </form>
        ) : (
          <>
            <div className="pindots">{'●'.repeat(pin.length)}</div>
            <div className="pinpad">
              {[1,2,3,4,5,6,7,8,9].map((n) => <button key={n} onClick={() => pushPin(String(n))}>{n}</button>)}
              <button onClick={() => setPin('')}>C</button>
              <button onClick={() => pushPin('0')}>0</button>
              <button onClick={() => setPin(pin.slice(0, -1))}>←</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
