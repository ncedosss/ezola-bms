import React, { useEffect, useState } from 'react';
import { api, R } from '../api.js';
import { useAuth } from '../App.jsx';

// S09 register tabs + S10 purchase capture + S11 adjustments + owner approval queue
export default function Stock() {
  const { user } = useAuth();
  const [register, setRegister] = useState('kitchen');
  const [items, setItems] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [modal, setModal] = useState(null); // {type:'purchase'|'adjust', item}
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');      
  const [cat, setCat] = useState('');   

  const load = () => {
    api(`/api/stock?register=${register}`).then(setItems).catch((e) => setErr(e.message));
    api('/api/stock/adjustments?status=pending').then(setAdjustments).catch(() => {});
  };
  useEffect(load, [register]);
  useEffect(() => { setQ(''); setCat(''); }, [register]); 

  const decide = async (a, decision) => {
    setErr('');
    try { await api(`/api/stock/adjustments/${a.id}`, { method: 'PATCH', body: { decision } }); setMsg(`Adjustment ${decision}.`); load(); }
    catch (e) { setErr(e.message); }
  };

  const categories = [...new Set(items.map((s) => s.category).filter(Boolean))].sort();
  const needle = q.trim().toLowerCase();
  const filtered = items.filter((s) =>
    (!cat || s.category === cat) &&
    (!needle || s.name.toLowerCase().includes(needle) || (s.category || '').toLowerCase().includes(needle)));

  return (
    <>
      <div className="btnrow" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Stock Control</h1>
          <div className="sub">Purchases add stock instantly. Adjustments need a reason and the owner's approval before they touch the numbers.</div>
        </div>
        <button className="btn green" onClick={() => setModal({ type: 'new' })}>+ New stock item</button>
      </div>
      {err && <div className="err" onClick={() => setErr('')}>{err}</div>}
      {msg && <div className="ok" onClick={() => setMsg('')}>{msg}</div>}

      {adjustments.length > 0 && (
        <div className="panel" style={{ marginBottom: 14, borderLeft: '4px solid #EFB44C' }}>
          <h2>Pending adjustments {user.role === 'owner' ? '- your approval needed' : '(awaiting owner)'}</h2>
          <table><tbody>
            {adjustments.map((a) => (
              <tr key={a.id}>
                <td>{a.item_name} <span className="badge grey">{a.register}</span></td>
                <td style={{ color: Number(a.quantity_change) < 0 ? '#E0685E' : '#2e7d46', fontWeight: 700 }}>
                  {Number(a.quantity_change) > 0 ? '+' : ''}{Number(a.quantity_change)} {a.unit}</td>
                <td className="sub">{a.reason} — {a.submitted_by_name}</td>
                {user.role === 'owner' && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn green sm" onClick={() => decide(a, 'approved')}>Approve</button>{' '}
                    <button className="btn red sm" onClick={() => decide(a, 'rejected')}>Reject</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      <div className="tabs">
        {['kitchen', 'shop', 'guest_house'].map((r) => (
          <button key={r} className={register === r ? 'on' : ''} onClick={() => setRegister(r)}>{r.replace('_', ' ')}</button>
        ))}
      </div>
      <div className="btnrow" style={{ gap: 8, margin: '10px 0', alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this register by name…"
          style={{ flex: '1 1 240px', minWidth: 0 }} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(q || cat) && <button className="btn ghost sm" onClick={() => { setQ(''); setCat(''); }}>Clear</button>}
        <span className="sub" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}>{filtered.length} of {items.length}</span>
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>Item</th><th>Category</th><th>On hand</th><th>Threshold</th><th>Cost/unit</th><th></th></tr></thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className={s.is_low ? 'lowrow' : ''} style={Number(s.current_quantity) <= 0 ? { opacity: 0.55 } : undefined}>
                <td>{s.name}
                  {Number(s.current_quantity) <= 0 && <span className="badge red">SOLD OUT</span>}
                  {s.is_low && Number(s.current_quantity) > 0 && <span className="badge red">LOW</span>}
                  {s.plate_yield && <span className="badge grey">{Number(s.plate_yield)} plates/unit</span>}</td>
                <td className="sub">{s.category || '—'}</td>
                <td><b>{Number(s.current_quantity)}</b> {s.unit}</td>
                <td className="sub">{s.low_stock_threshold == null ? 'not set' : Number(s.low_stock_threshold)}</td>
                <td className="sub">{s.cost_per_unit ? R(s.cost_per_unit) : '—'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn sm green" onClick={() => setModal({ type: 'purchase', item: s })}>+ Purchase</button>{' '}
                  <button className="btn sm ghost" onClick={() => setModal({ type: 'transfer', item: s })}>Transfer out</button>{' '}
                  <button className="btn sm ghost" onClick={() => setModal({ type: 'adjust', item: s })}>Adjust</button>
                  {' '}<button className="btn sm ghost" onClick={() => setModal({ type: 'edit', item: s })}>Edit</button>
                </td>
              </tr>
          ))}
            {filtered.length === 0 && (
              <tr><td colSpan="6" className="sub" style={{ textAlign: 'center', padding: '18px' }}>
                No items match{q ? ` “${q}”` : ''}{cat ? ` in ${cat}` : ''}.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal?.type === 'purchase' && <PurchaseModal item={modal.item} onClose={() => { setModal(null); load(); }} />}
      {modal?.type === 'transfer' && <TransferModal item={modal.item} onClose={() => { setModal(null); load(); }} />}
      {modal?.type === 'adjust' && <AdjustModal item={modal.item} onClose={() => { setModal(null); load(); }} />}
      {modal?.type === 'edit' && <EditItemModal item={modal.item} onClose={() => { setModal(null); load(); }} />}
      {modal?.type === 'new' && <NewItemModal register={register} categories={categories} onClose={() => { setModal(null); load(); }} />}
    </>
  );
}

function PurchaseModal({ item, onClose }) {
  const [quantity, setQ] = useState('');
  const [total_cost, setC] = useState('');
  const [receipt_ref, setRef] = useState('');
  const [supplier_note, setNote] = useState('');
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    try {
      await api('/api/stock/purchases', { method: 'POST',
        body: { stock_item_id: item.id, quantity: Number(quantity), total_cost: Number(total_cost), receipt_ref, supplier_note } });
      onClose();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Record purchase - {item.name}</h2>
        <div className="sub">Stock in {item.unit}; captured against the {item.register.replace('_', ' ')} register.</div>
        {err && <div className="err">{err}</div>}
        <div className="formrow">
          <div><label>Quantity ({item.unit}) *</label><input type="number" step="0.01" value={quantity} onChange={(e) => setQ(e.target.value)} autoFocus /></div>
          <div><label>Total cost (R) *</label><input type="number" step="0.01" value={total_cost} onChange={(e) => setC(e.target.value)} /></div>
        </div>
        <label>Receipt reference</label>
        <input value={receipt_ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. slip no. / photo filename" />
        <label>Supplier / note</label>
        <input value={supplier_note} onChange={(e) => setNote(e.target.value)} />
        <div className="btnrow" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={!(quantity > 0) || total_cost === ''} onClick={submit}>Add to stock</button>
        </div>
      </div>
    </div>
  );
}

function TransferModal({ item, onClose }) {
  // item is the SOURCE (giving stock away). Destination must be an item in a different register.
  const [dests, setDests] = useState([]);
  const [toId, setToId] = useState('');
  const [quantity, setQ] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  // Pull items from the other two registers to choose a destination
  useEffect(() => {
    const others = ['kitchen', 'shop', 'guest_house'].filter((r) => r !== item.register);
    Promise.all(others.map((r) => api(`/api/stock?register=${r}`)))
      .then((lists) => setDests(lists.flat()))
      .catch((e) => setErr(e.message));
  }, [item.register]);

  const submit = async () => {
    setErr('');
    try {
      await api('/api/stock/transfers', { method: 'POST',
        body: { from_stock_item_id: item.id, to_stock_item_id: toId, quantity: Number(quantity), note } });
      onClose();
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Transfer out - {item.name}</h2>
        <div className="sub">
          Moving {item.unit} from the {item.register.replace('_', ' ')} register into another register
          (e.g. kitchen ran out and took from the shop). Applies immediately - no approval needed.
        </div>
        {err && <div className="err">{err}</div>}
        <label>Send to (destination item, different register) *</label>
        <select value={toId} onChange={(e) => setToId(e.target.value)} autoFocus>
          <option value="">Select destination item…</option>
          {dests.map((d) => (
            <option key={d.id} value={d.id}>{d.register.replace('_', ' ')} - {d.name} ({Number(d.current_quantity)} {d.unit})</option>
          ))}
        </select>
        <label>Quantity ({item.unit}) *</label>
        <input type="number" step="0.01" value={quantity} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 5" />
        <label>Note</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. kitchen ran out mid-service" />
        <div className="btnrow" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={!toId || !(quantity > 0)} onClick={submit}>Record transfer</button>
        </div>
      </div>
    </div>
  );
}

function AdjustModal({ item, onClose }) {
  const [quantity_change, setQ] = useState('');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    try {
      await api('/api/stock/adjustments', { method: 'POST',
        body: { stock_item_id: item.id, quantity_change: Number(quantity_change), reason } });
      onClose();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Adjustment - {item.name}</h2>
        <div className="sub">Use a negative number for spoilage/breakage write-offs. Applies only after the owner approves.</div>
        {err && <div className="err">{err}</div>}
        <label>Quantity change ({item.unit}) *</label>
        <input type="number" step="0.01" value={quantity_change} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="-2" />
        <label>Reason * (mandatory)</label>
        <textarea rows="2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. 2kg vegetables spoiled - fridge failure" />
        <div className="btnrow" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn amber" disabled={!quantity_change || !reason.trim()} onClick={submit}>Submit for approval</button>
        </div>
      </div>
    </div>
  );
}

function EditItemModal({ item, onClose }) {
  const [f, setF] = useState({
    name: item.name, category: item.category || '', unit: item.unit,
    low_stock_threshold: item.low_stock_threshold ?? '', plate_yield: item.plate_yield ?? '',
    sell_price: item.sell_price ?? '',
  });
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    try {
      await api(`/api/stock/items/${item.id}`, { method: 'PATCH', body: {
        name: f.name, category: f.category || null, unit: f.unit,
        low_stock_threshold: f.low_stock_threshold === '' ? null : Number(f.low_stock_threshold),
        plate_yield: f.plate_yield === '' ? null : Number(f.plate_yield),
        sell_price: f.sell_price === '' ? null : Number(f.sell_price),
      }});
      onClose();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit - {item.name}</h2>
        <div className="sub">Leave threshold blank for no low-stock alerts on this item.</div>
        {err && <div className="err">{err}</div>}
        <label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <div className="formrow">
          <div><label>Category</label><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
          <div><label>Unit</label>
            <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
              {['kg','litre','unit','whole_animal','cylinder'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select></div>
        </div>
        <div className="formrow">
          <div><label>Low-stock threshold</label><input type="number" step="0.01" value={f.low_stock_threshold} onChange={(e) => setF({ ...f, low_stock_threshold: e.target.value })} /></div>
          <div><label>Plate yield (per unit)</label><input type="number" step="0.1" value={f.plate_yield} onChange={(e) => setF({ ...f, plate_yield: e.target.value })} /></div>
        </div>
        <div className="formrow">
          <div><label>Sell price (R) - for directly-sold items e.g. condoms</label><input type="number" step="0.01" value={f.sell_price} onChange={(e) => setF({ ...f, sell_price: e.target.value })} /></div>
          <div></div>
        </div>
        <div className="btnrow" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={!f.name.trim()} onClick={submit}>Save</button>
        </div>
      </div>
    </div>
  );
}
function NewItemModal({ register, categories = [], onClose }) {
  const [f, setF] = useState({
    register, name: '', category: '', unit: 'unit', low_stock_threshold: '', plate_yield: '',
  });
  const [err, setErr] = useState('');
  const submit = async () => {
    setErr('');
    try {
      await api('/api/stock/items', { method: 'POST', body: {
        register: f.register,
        name: f.name.trim(),
        category: f.category.trim() || null,
        unit: f.unit,
        low_stock_threshold: f.low_stock_threshold === '' ? null : Number(f.low_stock_threshold),
        plate_yield: f.plate_yield === '' ? null : Number(f.plate_yield),
      }});
      onClose();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New stock item</h2>
        <div className="sub">Creates the item at 0 on hand - use "+ Purchase" afterwards to add stock. Set a sell price later via Edit if it's sold directly.</div>
        {err && <div className="err">{err}</div>}
        <datalist id="stock-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <label>Name *</label>
        <input value={f.name} autoFocus onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Toilet paper" />
        <div className="formrow">
          <div><label>Register *</label>
            <select value={f.register} onChange={(e) => setF({ ...f, register: e.target.value })}>
              {['kitchen', 'shop', 'guest_house'].map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
            </select></div>
          <div><label>Unit *</label>
            <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}>
              {['kg', 'litre', 'unit', 'whole_animal', 'cylinder'].map((u) => <option key={u} value={u}>{u}</option>)}
            </select></div>
        </div>
        <div className="formrow">
          <div><label>Category</label>
            <input list="stock-cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="e.g. household" /></div>
          <div><label>Low-stock threshold</label>
            <input type="number" step="0.01" value={f.low_stock_threshold} onChange={(e) => setF({ ...f, low_stock_threshold: e.target.value })} placeholder="blank = no alert" /></div>
        </div>
        <div className="formrow">
          <div><label>Plate yield (per unit)</label>
            <input type="number" step="0.1" value={f.plate_yield} onChange={(e) => setF({ ...f, plate_yield: e.target.value })} placeholder="e.g. 10 (a sheep)" /></div>
          <div></div>
        </div>
        <div className="btnrow" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn green" disabled={!f.name.trim()} onClick={submit}>Create item</button>
        </div>
      </div>
    </div>
  );
}