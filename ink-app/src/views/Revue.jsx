import { useEffect, useRef, useState } from 'react';
import { CategoryStamp, ConfidenceGauge, StatusBadge } from '../components/Stamps.jsx';
import './Revue.css';

const pad2 = (n) => String(n).padStart(2, '0');
const SEGMENT = { pending: 'var(--ec-filet)', accepted: 'var(--ec-telegraphe)', rejected: 'var(--ec-tampon)' };

function linkedPieces(item, parsed) {
  const ids = [...new Set([...(item.knots ?? []), item.knot, item.owner].filter(Boolean))];
  return ids
    .map((id) => {
      const c = parsed.containers.get(id);
      if (!c) return null;
      return { id, line: c.line, label: c.stitch ? `= ${c.stitch} (L.${c.line})` : `=== ${c.knot} === (L.${c.line})` };
    })
    .filter(Boolean);
}

export default function Revue({ items, parsed, analysis, selectedUid, onSelect, onAccept, onReject, onAnalyse, jumpTo, navigate }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const advanceTimer = useRef(null);

  const index = Math.max(0, items.findIndex((i) => i.uid === selectedUid));
  const item = items[index];

  useEffect(() => () => clearTimeout(advanceTimer.current), []);

  const select = (uid) => {
    clearTimeout(advanceTimer.current);
    setEditing(false);
    onSelect(uid);
  };

  const advanceFrom = (i) => {
    const next = items.findIndex((it, j) => j > i && it.status === 'pending');
    const wrap = next >= 0 ? next : items.findIndex((it, j) => j < i && it.status === 'pending');
    if (wrap >= 0) advanceTimer.current = setTimeout(() => onSelect(items[wrap].uid), 650);
  };

  const accept = async () => {
    if (!item || busy || item.status !== 'pending') return;
    setBusy(true);
    const ok = await onAccept(item.uid, editing ? draft : undefined);
    setBusy(false);
    if (ok) {
      setEditing(false);
      advanceFrom(index);
    }
  };
  const reject = () => {
    if (!item || item.status !== 'pending') return;
    onReject(item.uid);
    setEditing(false);
    advanceFrom(index);
  };
  const toggleEdit = () => {
    if (!item?.info?.found || item.status !== 'pending') return;
    if (editing) accept();
    else {
      setDraft(item.info.after);
      setEditing(true);
    }
  };
  const next = () => items.length && select(items[(index + 1) % items.length].uid);

  // Raccourcis A / R / M (hors saisie).
  const keys = useRef({});
  useEffect(() => {
    keys.current = { accept, reject, toggleEdit };
  });
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'a') keys.current.accept();
      if (k === 'r') keys.current.reject();
      if (k === 'm') keys.current.toggleEdit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!items.length) {
    return (
      <div className="ec-body">
        <main className="ec-main rv-empty">
          <h1 className="ec-serif" style={{ margin: 0, fontSize: 24 }}>Aucune pièce à examiner</h1>
          <p className="ec-mute" style={{ margin: 0, maxWidth: 520 }}>
            {analysis.status === 'running'
              ? 'L’analyste lit le dossier. Les pièces apparaîtront ici dès réception.'
              : analysis.status === 'done'
                ? 'L’analyste n’a rien relevé dans ce dossier.'
                : 'Lancez une analyse du dossier : les suggestions et incohérences relevées seront présentées ici une par une.'}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="ec-btn ec-btn--primary" onClick={onAnalyse} disabled={analysis.status === 'running'}>Analyser le dossier</button>
            <button type="button" className="ec-btn ec-btn--secondary" onClick={() => navigate('editeur')}>Retour à l’éditeur</button>
          </div>
        </main>
      </div>
    );
  }

  const done = items.filter((i) => i.status !== 'pending').length;
  const shown = item.status === 'accepted' && item.applied ? item.applied : item.info;
  const pieces = linkedPieces(item, parsed);

  return (
    <div className="ec-body">
      <aside className="ec-side ec-side--left rv-queue" aria-label="File des corrections">
        <div className="rv-queue__head">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="ec-label ec-label--strong">Messages à traiter</span>
            <span className="ec-mono ec-mute" style={{ fontSize: 13 }}>{done} / {items.length}</span>
          </div>
          <div className="rv-segments" aria-hidden="true">
            {items.map((i) => <span key={i.uid} style={{ background: SEGMENT[i.status] }} />)}
          </div>
        </div>
        <ul className="rv-queue__list ec-scroll">
          {items.map((q) => (
            <li key={q.uid}>
              <button type="button" className={`rv-piece${q.uid === item.uid ? ' is-current' : ''}`} aria-current={q.uid === item.uid ? 'true' : undefined} onClick={() => select(q.uid)}>
                <span className="rv-piece__top">
                  <CategoryStamp category={q.category} size="sm" tilt={false} />
                  <StatusBadge status={q.status} small />
                </span>
                <span className="rv-piece__title">{q.title}</span>
                <span className="ec-mono ec-mute" style={{ fontSize: 12 }}>{q.where}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="ec-main rv-main ec-scroll">
        <div className="rv-heading">
          <CategoryStamp category={item.category} size="lg" />
          <h1 className="rv-title">{item.title}</h1>
          <span className="ec-mono ec-mute" style={{ marginLeft: 'auto', fontSize: 13 }}>Pièce {index + 1} / {items.length}</span>
        </div>

        <section aria-label="Message intercepté, texte actuel" className="rv-tape">
          <div className="rv-tape__perfs" aria-hidden="true" />
          <div className="rv-tape__body">
            <div className="rv-sheet-head ec-label">
              <span>Intercepté · texte actuel · {item.where}</span>
              <span>Chiffré</span>
            </div>
            {shown?.found !== false && shown ? (
              <div className="rv-lines ec-mono">
                {shown.line > 1 && <div className="rv-ctx"><span className="rv-n">{shown.line - 1}</span>{shown.ctxA}</div>}
                <div>
                  <span className="rv-n" style={{ color: 'var(--ec-tampon)', fontWeight: 700 }}>{shown.line}</span>
                  {shown.pre}
                  {shown.del && <span className="rv-del">{shown.del}</span>}
                  {shown.post}
                </div>
                {shown.ctxB !== '' && <div className="rv-ctx"><span className="rv-n">{(shown.lastLine ?? shown.line) + 1}</span>{shown.ctxB}</div>}
              </div>
            ) : (
              <p className="rv-note">
                {shown ? 'Extrait introuvable : le texte a changé depuis l’analyse. Relancez une analyse pour actualiser cette pièce.' : 'Aucun extrait ciblé : l’analyste signale un point d’ensemble, à concrétiser.'}
              </p>
            )}
          </div>
        </section>

        <div className="rv-divider" aria-hidden="true">
          <span />
          <svg width="28" height="28" viewBox="0 0 28 28">
            <circle cx="14" cy="14" r="12" fill="none" stroke="var(--ec-lampe-filet)" strokeWidth="1.5" />
            <circle cx="14" cy="14" r="5" fill="var(--ec-lampe-filet)" />
            <g stroke="var(--ec-lampe-filet)" strokeWidth="1.5"><line x1="14" y1="2" x2="14" y2="6" /><line x1="14" y1="22" x2="14" y2="26" /><line x1="2" y1="14" x2="6" y2="14" /><line x1="22" y1="14" x2="26" y2="14" /></g>
          </svg>
          <b className="ec-label" style={{ fontWeight: 700, letterSpacing: '.2em', color: 'var(--ec-encre-2)' }}>Proposition de l’analyste</b>
          <span />
        </div>

        <section aria-label="Message décodé, texte proposé" className="rv-decoded">
          <div className="rv-sheet-head ec-label">
            <span>Décodé · texte proposé</span>
            <span>En clair</span>
          </div>
          {editing ? (
            <>
              <label htmlFor="edit-after" className="ec-mute" style={{ fontSize: 13 }}>Modifier la proposition avant de l’appliquer</label>
              <textarea id="edit-after" className="rv-edit ec-mono" rows={Math.max(2, draft.split('\n').length)} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
            </>
          ) : shown?.found ? (
            <div className="rv-lines ec-mono">
              <span className="rv-n" style={{ color: 'var(--ec-telegraphe)', fontWeight: 700 }}>{shown.line}</span>
              {shown.pre}
              {shown.ins ? <span className="rv-ins">{shown.ins}</span> : <span className="ec-mute">(suppression)</span>}
              {shown.post}
            </div>
          ) : (
            <p className="rv-note" style={{ fontFamily: 'var(--ec-font-titre)' }}>{item.description}</p>
          )}
          {item.status !== 'pending' && (
            <div aria-live="polite" className={`ec-stamp ec-stamp--double rv-stamp ${item.status === 'accepted' ? 'is-ok' : 'is-ko'}`}>
              {item.status === 'accepted' ? 'ACCEPTÉ' : 'REJETÉ'}
            </div>
          )}
        </section>

        <div className="rv-actions">
          <button type="button" className="ec-btn ec-btn--accept ec-btn--lg" onClick={accept} disabled={busy || item.status !== 'pending' || shown?.found === false}>
            {busy ? 'Application…' : 'Accepter'} <kbd className="ec-kbd">A</kbd>
          </button>
          <button type="button" className="ec-btn ec-btn--reject ec-btn--lg" onClick={reject} disabled={item.status !== 'pending'}>
            Rejeter <kbd className="ec-kbd">R</kbd>
          </button>
          <button
            type="button"
            className="ec-btn ec-btn--secondary ec-btn--lg"
            aria-pressed={editing}
            style={editing ? { background: 'var(--ec-lampe-fond)' } : undefined}
            onClick={toggleEdit}
            disabled={item.status !== 'pending' || !item.info?.found}
          >
            {editing ? 'Valider la modification' : 'Modifier'} <kbd className="ec-kbd">M</kbd>
          </button>
          <button type="button" className="ec-btn ec-btn--link ec-btn--lg" style={{ marginLeft: 'auto' }} onClick={next}>
            Pièce suivante →
          </button>
        </div>
      </main>

      <aside className="ec-side ec-side--right rv-note-panel" aria-label="Note de l’analyste">
        <div className="rv-note-panel__head">
          <span className="ec-label ec-label--strong">Note de l’analyste</span>
          <span className="ec-mono ec-mute" style={{ fontSize: 12 }}>AN / {pad2(index + 1)}</span>
        </div>
        <p className="rv-note-panel__text">{item.description}</p>
        <ConfidenceGauge value={item.confidence} />
        {pieces.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span className="ec-label" style={{ fontWeight: 700, letterSpacing: '.18em' }}>Pièces liées</span>
            {pieces.map((p) => (
              <button key={p.id} type="button" className="ec-link ec-mono" onClick={() => jumpTo(p.line)}>{p.label}</button>
            ))}
          </div>
        )}
        <p className="rv-note-panel__foot">L’analyste propose, l’auteur dispose. Aucune modification n’est écrite dans le fichier avant votre accord.</p>
      </aside>
    </div>
  );
}
