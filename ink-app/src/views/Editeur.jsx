import { useMemo, useState } from 'react';
import CodeEditor from '../components/CodeEditor.jsx';
import { CategoryStamp, Rotor, Spinner } from '../components/Stamps.jsx';
import { CATEGORIES } from '../lib/categories.js';
import './Editeur.css';

const CAT_MARK = {
  syntaxe: 'var(--ec-tampon)',
  coherence: 'var(--ec-lampe-filet)',
  style: 'var(--ec-encre-bleue)',
  coquille: 'var(--ec-encre-3)',
};
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (ts) => {
  const d = new Date(ts);
  return `${d.getHours()} h ${pad2(d.getMinutes())}`;
};
const since = (ts) => {
  const min = Math.round((Date.now() - ts) / 60000);
  return min < 1 ? 'à l’instant' : `il y a ${min} min`;
};

/* ------------------------------------------------------------------ */

function KnotTree({ parsed, graph, compiled, activeOwner, jumpTo, navigate }) {
  const [filter, setFilter] = useState('');
  const issuesByOwner = useMemo(() => {
    const map = new Map();
    for (const issue of [...(compiled?.errors ?? []), ...(compiled?.warnings ?? [])]) {
      if (!issue.line) continue;
      const owner = parsed.lineOwner[issue.line - 1] ?? '';
      const entry = map.get(owner) ?? { err: 0, warn: 0 };
      if (issue.severity === 'error') entry.err += 1;
      else entry.warn += 1;
      map.set(owner, entry);
    }
    return map;
  }, [compiled, parsed]);

  const nodeInfo = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const knots = parsed.knots.filter((k) => !k.isFunction);
  const stitchCount = knots.reduce((s, k) => s + k.stitches.length, 0);
  const q = filter.trim().toLowerCase();

  const rows = [];
  knots.forEach((k, i) => {
    const stitches = k.stitches.filter((s) => !q || s.name.toLowerCase().includes(q) || k.name.toLowerCase().includes(q));
    if (q && !k.name.toLowerCase().includes(q) && !stitches.length) return;
    rows.push({ id: k.name, num: pad2(i + 1), name: k.name, line: k.line, stitch: false });
    for (const s of stitches) rows.push({ id: `${k.name}.${s.name}`, num: '§', name: s.name, line: s.line, stitch: true });
  });

  const consts = parsed.vars.filter((v) => v.kind === 'CONST').length;
  const vars = parsed.vars.length - consts;

  return (
    <aside className="ec-side ec-side--left ed-tree" aria-label="Classeur des knots">
      <div className="ed-tree__head">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span className="ec-label ec-label--strong">Classeur</span>
          <span className="ec-mono ec-mute" style={{ fontSize: 12 }}>{plural(knots.length, 'knot')} · {plural(stitchCount, 'stitch')}</span>
        </div>
        <label htmlFor="filtre" className="visually-hidden">Filtrer les knots</label>
        <input id="filtre" className="ec-input ec-input--sm" placeholder="Filtrer les knots…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <ul className="ed-tree__list ec-scroll">
        {rows.map((r) => {
          const active = r.id === activeOwner;
          const issues = issuesByOwner.get(r.id);
          const node = nodeInfo.get(r.id);
          let pill = null;
          if (issues?.err) pill = <span className="ec-pill ec-pill--err" title="Erreurs de compilation">{issues.err}</span>;
          else if (issues?.warn) pill = <span className="ec-pill ec-pill--warn" title="Avertissements">{issues.warn}</span>;
          else if (node?.orphan) pill = <span className="ec-pill ec-pill--orph">ORPHELIN</span>;
          else if (node?.ending) pill = <span className="ec-pill ec-pill--fin">FIN</span>;
          return (
            <li key={r.id}>
              <button
                type="button"
                className={`ed-tree__item${active ? ' is-active' : ''}${r.stitch ? ' is-stitch' : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => jumpTo(r.line)}
              >
                <span className="ed-tree__num">{r.num}</span>
                <span className="ed-tree__name">{r.name}</span>
                {pill}
              </button>
            </li>
          );
        })}
        {rows.length === 0 && <li className="ec-mute" style={{ padding: '8px 16px', fontSize: 13 }}>Aucun knot.</li>}
      </ul>
      <div className="ed-tree__foot">
        <span className="ec-label ec-label--strong" style={{ color: 'var(--ec-encre-2)', fontSize: 12 }}>Globales</span>
        <button type="button" className="ec-link ec-mono" onClick={() => navigate('variables')}>
          {vars} VAR · {consts} CONST → inspecteur
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */

function AnalystPanel({ items, analysis, compiled, selectedUid, onSelect, onAccept, onReject, jumpTo, navigate, onAnalyse, applyingUid }) {
  const [cat, setCat] = useState('all');
  const pending = items.filter((i) => i.status === 'pending');
  const shown = pending.filter((i) => cat === 'all' || i.category === cat);
  const counts = Object.fromEntries(Object.keys(CATEGORIES).map((c) => [c, pending.filter((i) => i.category === c).length]));
  const rotor = analysis.status === 'running' ? 'running' : analysis.status === 'error' ? 'error' : analysis.status === 'done' ? 'done' : 'idle';

  let subtitle = 'Aucune analyse pour ce fichier';
  if (analysis.status === 'running') subtitle = 'Déchiffrement en cours…';
  else if (analysis.status === 'error') subtitle = 'Analyse en échec';
  else if (analysis.status === 'done') subtitle = `${plural(pending.length, 'remarque')} · ${plural(analysis.knotsRead ?? 0, 'knot')} lus · ${since(analysis.at)}`;

  const blocked = compiled && !compiled.ok;

  return (
    <aside className="ec-side ec-side--right ed-panel" aria-label="Suggestions de l’analyste">
      <div className="ed-panel__head">
        <Rotor state={rotor} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span className="ec-label ec-label--strong">Rapport de l’analyste</span>
          <span className="ec-mute" style={{ fontSize: 13 }}>{subtitle}</span>
        </div>
      </div>

      {analysis.status === 'done' && (
        <div className="ed-panel__filters" role="group" aria-label="Filtrer par catégorie">
          <button type="button" className="ec-chip" aria-pressed={cat === 'all'} onClick={() => setCat('all')}>Tout · {pending.length}</button>
          {Object.entries(CATEGORIES).map(([id, c]) => (
            <button key={id} type="button" className="ec-chip" aria-pressed={cat === id} onClick={() => setCat(id)}>
              {c.short} · {counts[id]}
            </button>
          ))}
        </div>
      )}

      <div className="ed-panel__list ec-scroll">
        {analysis.status !== 'done' && (
          <div className="ed-panel__empty">
            {blocked ? (
              <>
                <p><strong>Le fichier ne compile pas.</strong> L’analyste n’est pas sollicité tant que les erreurs de compilation ne sont pas corrigées.</p>
                <button type="button" className="ec-btn ec-btn--quiet ec-btn--sm" onClick={() => jumpTo(compiled.errors[0]?.line)}>
                  Aller à la première erreur
                </button>
              </>
            ) : analysis.status === 'error' ? (
              <p>{analysis.error}</p>
            ) : analysis.status === 'running' ? (
              <p>L’analyste lit le dossier : suggestions d’écriture et contrôle de cohérence.</p>
            ) : (
              <>
                <p>L’analyste n’a encore rien lu. Lancez une analyse : le fichier entier lui sera transmis.</p>
                <button type="button" className="ec-btn ec-btn--primary ec-btn--sm" onClick={onAnalyse}>Analyser le dossier</button>
              </>
            )}
          </div>
        )}
        {analysis.status === 'done' && shown.length === 0 && (
          <div className="ed-panel__empty"><p>{pending.length ? 'Rien dans cette catégorie.' : 'Toutes les remarques ont été traitées.'}</p></div>
        )}
        {analysis.status === 'done' && shown.map((item) => {
          const selected = item.uid === selectedUid;
          return (
            <article
              key={item.uid}
              className={`ed-card${selected ? ' is-selected' : ''}`}
              onClick={() => { onSelect(item.uid); jumpTo(item.line); }}
            >
              <div className="ed-card__top">
                <CategoryStamp category={item.category} />
                <span className="ec-mono ec-mute" style={{ fontSize: 12 }}>{item.where}</span>
              </div>
              <div className="ed-card__title">{item.title}</div>
              <ItemDiff item={item} />
              <div className="ed-card__actions">
                <button
                  type="button"
                  className="ec-btn ec-btn--accept ec-btn--sm"
                  disabled={(item.info && !item.info.found) || Boolean(applyingUid)}
                  aria-busy={applyingUid === item.uid}
                  onClick={(e) => { e.stopPropagation(); onAccept(item.uid); }}
                >
                  {applyingUid === item.uid ? <><Spinner label="Application en cours" /> Application…</> : 'Accepter'}
                </button>
                <button type="button" className="ec-btn ec-btn--quiet ec-btn--sm" disabled={applyingUid === item.uid} onClick={(e) => { e.stopPropagation(); onReject(item.uid); }}>
                  Ignorer
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="ed-panel__foot">
        <button type="button" className="ec-btn ec-btn--primary" style={{ width: '100%', height: 38 }} onClick={() => navigate('revue')} disabled={!items.length}>
          Ouvrir la revue détaillée
        </button>
      </div>
    </aside>
  );
}

function ItemDiff({ item }) {
  if (!item.info) return <p className="ed-card__desc">{item.description}</p>;
  if (!item.info.found) return <p className="ed-card__desc ed-card__desc--warn">Extrait introuvable : le texte a changé depuis l’analyse.</p>;
  const { del, ins } = item.info;
  return (
    <div className="ed-card__diff ec-mono">
      {del && <span className="ed-del">{del.trim() || '¶'}</span>}
      {ins && <span className="ed-ins">{del ? '' : '+ '}{ins.trim() || '¶'}</span>}
      {!ins && <span className="ec-mute">(suppression)</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function Editeur({ doc, source, parsed, graph, compile, compiled, items, analysis, focus, onChange, selectedUid, onSelect, onAccept, onReject, onAnalyse, jumpTo, navigate, applyingUid }) {
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  const errors = useMemo(() => compiled?.errors ?? [], [compiled]);
  const warnings = useMemo(() => compiled?.warnings ?? [], [compiled]);
  const issuesAtCursor = [...errors, ...warnings].filter((i) => i.line === cursor.line);

  const pendingItems = useMemo(() => items.filter((i) => i.status === 'pending' && i.info?.found), [items]);

  const decor = useMemo(() => {
    const map = new Map();
    for (const it of pendingItems) map.set(it.line, { mark: CAT_MARK[it.category] });
    for (const w of warnings) if (w.line) map.set(w.line, { mark: 'var(--ec-lampe-filet)', title: w.message });
    for (const e of errors) if (e.line) map.set(e.line, { tone: 'error', mark: 'var(--ec-tampon)', title: e.message });
    return map;
  }, [pendingItems, errors, warnings]);

  const ranges = useMemo(
    () => pendingItems.map((it) => ({ start: it.info.start, end: Math.max(it.info.end, it.info.start + 1), cls: it.uid === selectedUid ? `${it.category} selected` : it.category })),
    [pendingItems, selectedUid],
  );

  const owner = parsed.lineOwner[cursor.line - 1] ?? '';
  const [knotName, stitchName] = owner.split('.');
  const knotNum = parsed.knots.filter((k) => !k.isFunction).findIndex((k) => k.name === knotName) + 1;

  return (
    <div className="ec-body">
      <KnotTree parsed={parsed} graph={graph} compiled={compiled} activeOwner={owner} jumpTo={jumpTo} navigate={navigate} />

      <main className="ec-main ed-main">
        <div className="ec-tabs" role="tablist" aria-label="Fichiers ouverts">
          <button type="button" role="tab" aria-selected="true" className="ec-tab">{doc.name}</button>
        </div>
        <div className="ed-crumbs">
          <nav aria-label="Fil d’Ariane" className="ec-label" style={{ fontSize: 13, letterSpacing: '.14em' }}>
            {knotName ? (
              <>
                Knot {pad2(knotNum)} · {stitchName ? knotName : <span style={{ color: 'var(--ec-encre)' }}>{knotName}</span>}
                {stitchName && <> <span aria-hidden="true">›</span> <span style={{ color: 'var(--ec-encre)' }}>{stitchName}</span></>}
              </>
            ) : (
              'En-tête du fichier'
            )}
          </nav>
          <span className="ec-mono ec-mute" style={{ fontSize: 12 }}>Réf. {doc.name.replace(/\.ink$/, '')} / f. {pad2(Math.max(knotNum, 0))}</span>
        </div>

        <CodeEditor
          source={source}
          onChange={onChange}
          decor={decor}
          ranges={ranges}
          focus={focus}
          cursorLine={cursor.line}
          onCursor={setCursor}
        />

        <div className="ed-status ec-mono">
          <span>Ln {cursor.line}, Col {cursor.col}</span>
          <span>ink · UTF-8</span>
          {compile.error ? (
            <span style={{ color: 'var(--ec-tampon)' }}>● compilateur injoignable</span>
          ) : !compiled ? (
            <span>Compilation…</span>
          ) : (
            <>
              <button type="button" className="ed-status__btn" style={{ color: errors.length ? 'var(--ec-tampon)' : 'var(--ec-telegraphe)' }} onClick={() => jumpTo(errors[0]?.line)} disabled={!errors.length}>
                ● {errors.length ? plural(errors.length, 'erreur') : 'compile'}
              </button>
              {warnings.length > 0 && (
                <button type="button" className="ed-status__btn" style={{ color: 'var(--ec-lampe)' }} onClick={() => jumpTo(warnings[0]?.line)}>
                  ◐ {plural(warnings.length, 'avertissement')}
                </button>
              )}
              {!compile.fresh && <span>· recompilation…</span>}
            </>
          )}
          {issuesAtCursor[0] && (
            <span className="ed-status__msg" style={{ color: issuesAtCursor[0].severity === 'error' ? 'var(--ec-tampon)' : 'var(--ec-lampe)' }}>
              L.{cursor.line} : {issuesAtCursor[0].message}
            </span>
          )}
          <span style={{ marginLeft: 'auto' }} title="Dans le registre de ce navigateur">
            {doc.dirty ? 'Modifications en cours…' : doc.savedAt ? `Enregistré ${hhmm(doc.savedAt)}` : 'Non enregistré'}
          </span>
        </div>
      </main>

      <AnalystPanel
        items={items}
        analysis={analysis}
        compiled={compiled}
        selectedUid={selectedUid}
        onSelect={onSelect}
        onAccept={onAccept}
        onReject={onReject}
        jumpTo={jumpTo}
        navigate={navigate}
        onAnalyse={onAnalyse}
        applyingUid={applyingUid}
      />
    </div>
  );
}
