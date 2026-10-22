import React, { useEffect, useMemo, useState } from 'react';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const FALLBACK_STAGES = [
  {number:1,name:'Opening',goal:'Get permission to continue and establish a professional tone.'},
  {number:2,name:'Reason for Calling',goal:'Explain briefly why the call may be relevant to the prospect.'},
  {number:3,name:'Discovery',goal:"Understand the prospect's current situation and needs."},
  {number:4,name:'Problem Awareness',goal:'Explore challenges, friction, or missed opportunities.'},
  {number:5,name:'Impact',goal:'Understand why the challenge matters and what it affects.'},
  {number:6,name:'Value Proposition',goal:'Connect a relevant benefit to what the prospect shared.'},
  {number:7,name:'Handle Concerns',goal:'Acknowledge questions or objections and respond honestly.'},
  {number:8,name:'Next Steps / Close',goal:'Agree on a clear next step or record the call outcome.'}
];

export default function App() {
  const [stages, setStages] = useState(FALLBACK_STAGES);
  const [stage, setStage] = useState(1);
  const [tab, setTab] = useState('guide');
  const [prospectWords, setProspectWords] = useState('');
  const [notes, setNotes] = useState('');
  const [companyContext, setCompanyContext] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [calls, setCalls] = useState([]);
  const [prospectName, setProspectName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [outcome, setOutcome] = useState('Other');
  const [notice, setNotice] = useState('');

  const current = stages.find(s => s.number === stage) || FALLBACK_STAGES[stage - 1];

  useEffect(() => {
    fetch(`${API}/stages`).then(r => r.ok ? r.json() : Promise.reject()).then(setStages).catch(() => {});
    loadCalls();
  }, []);

  async function loadCalls() {
    try {
      const r = await fetch(`${API}/calls`);
      const data = await r.json();
      setCalls(data.calls || []);
    } catch { setCalls([]); }
  }

  async function getSuggestion() {
    if (!prospectWords.trim()) {
      setError("Enter the prospect's words first.");
      return;
    }
    setBusy(true); setError(''); setSuggestion(null);
    try {
      const r = await fetch(`${API}/suggest`, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({stage_number:stage, prospect_words:prospectWords, company_context:companyContext || 'Not specified', previous_notes:notes})
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Could not generate suggestion.');
      setSuggestion(data);
    } catch (e) {
      setError(`${e.message} — check that the backend is running.`);
    } finally { setBusy(false); }
  }

  async function saveCall() {
    setNotice(''); setError('');
    try {
      const r = await fetch(`${API}/calls`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          prospect_name: prospectName || 'Unknown prospect',
          company_name: companyName,
          stage_reached: stage,
          notes,
          prospect_words: prospectWords,
          outcome
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Could not save call.');
      setNotice(data.saved ? 'Call saved to Supabase.' : 'Demo mode: call was not persisted. Add Supabase settings to save history.');
      await loadCalls();
    } catch (e) { setError(e.message); }
  }

  function moveStage(delta) {
    setStage(n => Math.max(1, Math.min(8, n + delta)));
    setSuggestion(null);
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-mark">CG</div>
      <div className="brand"><strong>CallGuide</strong><span>AI SALES COPILOT</span></div>
      <div className="side-label">WORKSPACE</div>
      <button className={`nav-item ${tab === 'guide' ? 'active' : ''}`} onClick={() => setTab('guide')}><span>◉</span> Live call guide</button>
      <button className={`nav-item ${tab === 'history' ? 'active' : ''}`} onClick={() => {setTab('history'); loadCalls();}}><span>◷</span> Call history</button>
      <div className="sidebar-bottom"><div className="online-dot"/> API workspace <span className="version">MVP</span></div>
    </aside>

    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">SALES WORKSPACE / {tab === 'guide' ? 'LIVE CALL' : 'HISTORY'}</div><h1>{tab === 'guide' ? 'Cold call companion' : 'Call history'}</h1></div>
        <div className="status-pill"><span/> AI assistant ready</div>
      </header>

      {tab === 'guide' ? <div className="workspace">
        <section className="stage-column">
          <div className="section-head"><div><div className="eyebrow">CALL PROGRESS</div><h2>Conversation stages</h2></div><span className="counter">{stage} <i>/ 8</i></span></div>
          <div className="progress-track"><div style={{width:`${stage/8*100}%`}}/></div>
          <div className="stage-list">
            {stages.map(s => <button key={s.number} onClick={() => {setStage(s.number);setSuggestion(null);}} className={`stage-row ${stage === s.number ? 'selected' : ''} ${stage > s.number ? 'completed' : ''}`}>
              <span className="stage-num">{stage > s.number ? '✓' : String(s.number).padStart(2,'0')}</span>
              <span className="stage-copy"><strong>{s.name}</strong><small>{s.goal}</small></span>
              {stage === s.number && <span className="current-dot"/>}
            </button>)}
          </div>
          <div className="tip-card"><span className="tip-icon">✦</span><div><strong>Coach tip</strong><p>Listen first. Use the prospect's own words to guide your next question.</p></div></div>
        </section>

        <section className="detail-column">
          <div className="stage-heading"><div className="eyebrow">STAGE {String(stage).padStart(2,'0')} OF 08</div><h2>{current.name}</h2><p>{current.goal}</p></div>
          <div className="field-grid">
            <label>Prospect name<input value={prospectName} onChange={e=>setProspectName(e.target.value)} placeholder="e.g. Alex Morgan"/></label>
            <label>Company<input value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="e.g. Northstar Ltd."/></label>
          </div>
          <label className="field-label">What does your company offer? <span>OPTIONAL CONTEXT</span>
            <input value={companyContext} onChange={e=>setCompanyContext(e.target.value)} placeholder="Briefly describe your product or service"/>
          </label>
          <div className="section-divider"/>
          <div className="field-title"><div><h3>Prospect's words</h3><p>Capture what they actually said, not what you think they meant.</p></div><span className="tag">LIVE NOTES</span></div>
          <textarea value={prospectWords} onChange={e=>setProspectWords(e.target.value)} placeholder={'Example: “We already use another provider and aren’t looking to change right now.”'} rows="4"/>
          <label className="field-label notes-label">Call notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add context, objections, or details to remember..." rows="2"/></label>
          <div className="actions"><button className="primary" onClick={getSuggestion} disabled={busy}>{busy ? <><span className="spinner"/> Thinking...</> : '✦  Get AI coaching'}</button><div className="stage-actions"><button className="secondary" onClick={()=>moveStage(-1)} disabled={stage===1}>← Previous</button><button className="secondary" onClick={()=>moveStage(1)} disabled={stage===8}>Next stage →</button></div></div>
          {error && <div className="alert error">{error}</div>}
          {suggestion && <div className="suggestion-card"><div className="suggestion-title"><span className="sparkle">✦</span><div><strong>AI coaching suggestion</strong><small>Review and adapt it to the conversation</small></div></div><div className="suggestion-section"><span>SUGGESTED REPLY</span><p>{suggestion.suggested_reply}</p></div><div className="suggestion-section"><span>FOLLOW-UP QUESTION</span><p>{suggestion.follow_up_question}</p></div><div className="suggestion-section"><span>NEXT STEP</span><p>{suggestion.next_step}</p></div></div>}
          <div className="save-panel"><div><h3>Wrap up this call</h3><p>Save the current stage, notes, and outcome to your call history.</p></div><div className="save-controls"><select value={outcome} onChange={e=>setOutcome(e.target.value)}><option>Other</option><option>Meeting booked</option><option>Follow-up needed</option><option>Not interested</option><option>No answer</option></select><button className="dark-button" onClick={saveCall}>Save call ↗</button></div></div>
          {notice && <div className="alert success">{notice}</div>}
        </section>
      </div> : <section className="history-panel">
        <div className="history-head"><div><h2>Previous calls</h2><p>Review outcomes and notes from saved calls.</p></div><button className="secondary" onClick={loadCalls}>↻ Refresh</button></div>
        {calls.length ? <div className="call-table"><div className="table-header"><span>PROSPECT</span><span>STAGE REACHED</span><span>OUTCOME</span><span>NOTES</span></div>{calls.map((c,i)=><div className="table-row" key={c.id || i}><div><strong>{c.prospect_name}</strong><small>{c.company_name || 'Company not added'}</small></div><div><span className="stage-chip">{c.stage_reached}/8</span></div><div><span className="outcome-chip">{c.outcome}</span></div><div className="table-notes">{c.notes || c.prospect_words || '—'}</div></div>)}</div> : <div className="empty-state"><div className="empty-icon">◷</div><h3>No saved calls yet</h3><p>Save a call from the Live call guide. Connect Supabase to persist your history.</p><button className="primary" onClick={()=>setTab('guide')}>Go to call guide</button></div>}
      </section>}
      <footer><span>CallGuide AI</span><span>Built for thoughtful, human-first conversations</span></footer>
    </main>
  </div>;
}
