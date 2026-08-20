import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import { useAuth } from '../App.jsx';
import AsyncButton from '../components/AsyncButton.jsx';

// Petty cash: standalone tuck-shop float. Top-ups in, expenses out, counts for control.
export default function Petty() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [modal, setModal] = useState(null); // 'expense' | 'topup' | 'count'
  const [err, setErr] = useState('');

  const canTopup = ['owner', 'office_manager', 'facility_manager'].includes(user.role);
  const canSpend = ['owner', 'office_manager', 'facility_manager', 'shop_attendant'].includes(user.role);
  const canCount = ['owner', 'office_manager'].includes(user.role);

  const load = () => api('/api/petty').then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  if (err) return <div className="err" onClick={() => setErr('')}>{err}</div>;
  if (!data) return <div className="loading">Loading…</div>;

  const low = data.balance <= data.low_threshold;
  const typeLabel = { topup: 'Top-up', expense: 'Expense', count: 'Count' };

  return (
    <>
      <h1>Petty Cash</h1>
      <div className="sub">The tuck-shop float for small out-of-pocket buys (transport, sundries not in stock). Every movement is traced.</div>

      <div className="panel" style={{ marginBottom: 14, borderLeft: `4px solid ${low ? '#E0685E' : '#2e7d46'}` }}>
        <div style={{ fontSize: 26 }}><b>Balance: {R(data.balance)}</b>
          {low && <span className="badge red" style={{ marginLeft: 10 }}>LOW - top up</span>}</div>
        <div className="btnrow" style={{ marginTop: 12 }}>
          {canSpend && <button className="btn green" onClick={() => setModal('expense')}>Record expense</button>}
          {canTopup && <button className="btn" onClick={() => setModal('topup')}>Top up float</button>}
          {canCount && <button className="btn ghost" onClick={() => setModal('count')}>Count tin</button>}
        </div>
      </div>

      <div className="panel">
        <h2>Ledger</h2>
        <table>
          <thead><tr><th>When</th><th>Type</th><th style={{ textAlign: 'right' }}>Amount</th><th>Reason / note</th><th>By</th></tr></thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id}>
                <td className="sub" style={{ whiteSpace: 'nowrap' }}>{new Date(e.created_at).toLocaleString('en-ZA')}</td>
                <td>{typeLabel[e.type] || e.type}</td>
                <td style={{ textAlign: 'right', color: e.type === 'expense' ? '#E0685E' : e.type === 'topup' ? '#2e7d46' : 'inherit' }}>
                  {e.type === 'expense' ? `- ${R(e.amount)}` : e.type === 'topup' ? `+ ${R(e.amount)}` : ''}
                  {e.type === 'count' && <span className="sub">counted {R(e.counted_amount)} · var {R(e.variance)}</span>}
                </td>
                <td className="sub">{e.description || (e.receipt_ref ? `receipt ${e.receipt_ref}` : '—')}
                  {e.receipt_ref && e.description ? ` · receipt ${e.receipt_ref}` : ''}</td>
                <td className="sub">{e.created_by_name}</td>
              </tr>
            ))}
            {data.entries.length === 0 && <tr><td className="sub" colSpan="5">No petty cash movements yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {modal === 'expense' && <PettyModal kind="expense" onClose={() => { setModal(null); load(); }} />}
      {modal === 'topup' && <PettyModal kind="topup" onClose={() => { setModal(null); load(); }} />}
      {modal === 'count' && <PettyModal kind="count" onClose={() => { setModal(null); load(); }} />}
    </>
  );
}

function PettyModal({ kind, onClose }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [receipt_ref, setReceipt] = useState('');
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    try {
      if (kind === 'expense')
        await api('/api/petty/expense', { method: 'POST', body: { amount: Number(amount), description, receipt_ref } });
      else if (kind === 'topup')
        await api('/api/petty/topup', { method: 'POST', body: { amount: Number(amount), description } });
      else
        await api('/api/petty/count', { method: 'POST', body: { counted_amount: Number(amount), description } });
      onClose();
    } catch (e) { setErr(e.message); }
  };

  const titles = { expense: 'Record expense', topup: 'Top up float', count: 'Count the tin' };
  const amountLabel = kind === 'count' ? 'Counted amount (R) *' : 'Amount (R) *';

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{titles[kind]}</h2>
        {kind === 'expense' && <div className="sub">Money out for something not in stock (e.g. transport). Reason is required.</div>}
        {kind === 'count' && <div className="sub">Enter what's physically in the tin - the system records the variance vs expected.</div>}
        {err && <div className="err">{err}</div>}
        <label>{amountLabel}</label>
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        {kind === 'expense' && (
          <>
            <label>Reason * (goes to the audit log)</label>
            <textarea rows="2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. taxi fare for staff to supplier meeting" />
            <label>Receipt reference</label>
            <input value={receipt_ref} onChange={(e) => setReceipt(e.target.value)} placeholder="slip no. if any" />
          </>
        )}
        {kind === 'topup' && (
          <><label>Note</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. owner float top-up" /></>
        )}
        {kind === 'count' && (
          <><label>Note</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="optional" /></>
        )}
        <div className="btnrow" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <AsyncButton className="btn green"
            disabled={!(Number(amount) > 0) && !(kind === 'count' && amount !== '') || (kind === 'expense' && !description.trim())}
            onClick={submit}>Save</AsyncButton>
        </div>
      </div>
    </div>
  );
}