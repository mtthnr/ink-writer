import { useMemo, useRef, useState } from 'react';
import { buildGraph, variablesReadIn } from '../lib/inkParse.js';
import './Carte.css';

const NODE_W = 168;
const NODE_H = 64;
const COL_W = 232;
const ROW_H = 120;
const MARGIN = 32;
const BUS = 32; // couloir vertical entre deux colonnes
const pad2 = (n) => String(n ?? 0).padStart(2, '0');
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

const pos = (n) => ({ x: MARGIN + n.col * COL_W, y: MARGIN + n.row * ROW_H });

function edgePath(e, byId) {
  const a = pos(byId.get(e.from));
  const b = pos(byId.get(e.to));
  if (e.loop || b.x <= a.x) {
    // Boucle : arc par-dessous, du bas de la source au bas de la cible.
    const sx = a.x + NODE_W / 2;
    const sy = a.y + NODE_H;
    const tx = b.x + NODE_W / 2 + 12;
    const ty = b.y + NODE_H + 4;
    const dip = Math.max(sy, ty) + 44;
    return `M ${sx} ${sy} C ${sx} ${dip}, ${tx} ${dip}, ${tx} ${ty}`;
  }
  const sx = a.x + NODE_W;
  const sy = a.y + NODE_H / 2;
  const tx = b.x - 4;
  const ty = b.y + NODE_H / 2;
  const bus = sx + BUS;
  if (b.x - a.x <= COL_W) return `M ${sx} ${sy} H ${bus} V ${ty} H ${tx}`;
  // Saut de colonnes : passage dans l'interligne, sous les deux rangées, pour ne traverser aucun nœud.
  const lane = Math.max(a.y, b.y) + NODE_H + (ROW_H - NODE_H) / 2;
  return `M ${sx} ${sy} H ${bus} V ${lane} H ${b.x - BUS} V ${ty} H ${tx}`;
}

function nodeSubtitle(n) {
  if (n.kind === 'broken') return `Cible introuvable · L.${n.line}`;
  const num = `N° ${pad2(n.num)}`;
  if (n.orphan) return `${num} · orphelin`;
  if (n.ending) return `${num} · FIN`;
  if (n.kind === 'stitch') return `${num} · stitch`;
  if (n.stitchCount) return `${num} · ${plural(n.stitchCount, 'stitch')}`;
  return `${num} · ${plural(n.outs.length, 'sortie')}`;
}

export default function Carte({ parsed, jumpTo, navigate }) {
  const [withStitches, setWithStitches] = useState(false);
  const [highlight, setHighlight] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null);
  const viewportRef = useRef(null);

  const graph = useMemo(() => buildGraph(parsed, { stitches: withStitches }), [parsed, withStitches]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const width = MARGIN * 2 + (Math.max(0, ...graph.nodes.map((n) => n.col)) + 1) * COL_W - (COL_W - NODE_W);
  const height = MARGIN * 2 + (Math.max(0, ...graph.nodes.map((n) => n.row)) + 1) * ROW_H - (ROW_H - NODE_H) + 48;

  const current = byId.get(selected) ?? byId.get(graph.start) ?? graph.nodes[0];
  const readVars = current && current.kind !== 'broken' ? variablesReadIn(parsed, current.id) : [];

  const fit = () => {
    const box = viewportRef.current;
    if (!box) return;
    setZoom(Math.max(0.4, Math.min(1, (box.clientWidth - 48) / width, (box.clientHeight - 48) / height)));
  };

  const nodeClass = (n) => {
    const cls = ['map-node'];
    if (n.kind === 'broken') cls.push(highlight ? 'is-broken' : 'is-plain');
    else if (n.orphan && highlight) cls.push('is-orphan');
    else if (n.ending) cls.push('is-end');
    if (n.start) cls.push('is-start');
    if (n.kind === 'stitch') cls.push('is-stitch');
    if (current && n.id === current.id) cls.push('is-selected');
    return cls.join(' ');
  };

  const edgeClass = (e) => (!highlight ? 'map-edge' : e.broken ? 'map-edge is-broken' : e.loop ? 'map-edge is-loop' : 'map-edge');
  const markerFor = (e) => (!highlight ? 'url(#arrow)' : e.broken ? 'url(#arrow-broken)' : e.loop ? 'url(#arrow-loop)' : 'url(#arrow)');

  const anomalyText = (a) => {
    if (a.kind === 'broken') return { tag: 'DIVERT CASSÉ', cls: 'is-red', text: `${a.from} → « ${a.raw} » (L.${a.line})` };
    if (a.kind === 'orphan') return { tag: 'ORPHELIN', cls: 'is-grey', text: `${a.node} : aucun divert n’y mène` };
    return { tag: 'BOUCLE', cls: 'is-amber', text: `${a.node} ⇄ ${a.to}${a.condition ? `, sortie si ${a.condition}` : ''}` };
  };

  return (
    <div className="ec-body">
      <aside className="ec-side ec-side--left map-side ec-scroll" aria-label="Légende et anomalies">
        <div className="map-legend">
          <span className="ec-label ec-label--strong">Légende</span>
          <div><span className="map-swatch" />Knot</div>
          <div><span className="map-swatch is-start" />Point de départ</div>
          <div><span className="map-swatch is-end" />Fin (-&gt; END)</div>
          <div><span className="map-swatch is-orphan" />Orphelin, jamais atteint</div>
          <div><span className="map-swatch is-broken" />Cible introuvable</div>
          <div>
            <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden="true"><line x1="0" y1="4" x2="28" y2="4" stroke="var(--ec-lampe)" strokeWidth="2" strokeDasharray="5 4" /></svg>
            Boucle
          </div>
        </div>
        <div className="ec-perfs" aria-hidden="true" />
        <div className="map-anomalies">
          <span className="ec-label ec-label--strong">Anomalies · {graph.anomalies.length}</span>
          {graph.anomalies.length === 0 && <p className="ec-mute" style={{ margin: 0, fontSize: 13 }}>Aucune anomalie de structure.</p>}
          {graph.anomalies.map((a, i) => {
            const t = anomalyText(a);
            return (
              <button key={i} type="button" className="map-anomaly" onClick={() => { setSelected(a.kind === 'broken' ? a.from : a.node); }} onDoubleClick={() => jumpTo(a.line)}>
                <span className={`map-anomaly__tag ${t.cls}`}>{t.tag}</span>
                <span style={{ fontSize: 13 }}>{t.text}</span>
              </button>
            );
          })}
        </div>
        <div className="map-stats ec-mono">
          {plural(graph.stats.knots, 'knot')} · {plural(graph.stats.stitches, 'stitch')}<br />
          {plural(graph.stats.diverts, 'divert')} · {plural(graph.stats.endings, 'fin')}<br />
          Chemin le plus long : {graph.stats.longest} choix
        </div>
      </aside>

      <main className="ec-main map-main">
        <div className="map-toolbar">
          <button type="button" className="ec-btn ec-btn--tool ec-btn--md" aria-pressed={!withStitches} onClick={() => setWithStitches(false)}>Knots</button>
          <button type="button" className="ec-btn ec-btn--tool ec-btn--md" aria-pressed={withStitches} onClick={() => setWithStitches(true)}>Knots + stitches</button>
          <button type="button" className="ec-btn ec-btn--tool ec-btn--lamp-toggle ec-btn--md" aria-pressed={highlight} onClick={() => setHighlight(!highlight)}>Surligner les anomalies</button>
          <span className="map-zoom">
            <button type="button" className="ec-btn ec-btn--tool ec-btn--md map-zoom__btn" aria-label="Dézoomer" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}>−</button>
            <span className="ec-mono" style={{ fontSize: 13, width: 48, textAlign: 'center' }}>{Math.round(zoom * 100)} %</span>
            <button type="button" className="ec-btn ec-btn--tool ec-btn--md map-zoom__btn" aria-label="Zoomer" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}>+</button>
            <button type="button" className="ec-btn ec-btn--tool ec-btn--md" onClick={fit}>Ajuster</button>
          </span>
        </div>

        <div className="map-viewport" ref={viewportRef}>
          <div style={{ width: width * zoom, height: height * zoom }}>
            <div className="map-canvas" style={{ width, height, transform: `scale(${zoom})` }}>
              <svg className="map-edges" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <defs>
                  {[['arrow', 'var(--ec-trait)'], ['arrow-loop', 'var(--ec-lampe)'], ['arrow-broken', 'var(--ec-tampon)']].map(([id, color]) => (
                    <marker key={id} id={id} orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible">
                      <path d="M0 0 L4 2 L0 4 Z" style={{ fill: color }} />
                    </marker>
                  ))}
                </defs>
                {graph.edges.map((e, i) => (
                  <path key={i} className={edgeClass(e)} d={edgePath(e, byId)} markerEnd={markerFor(e)}>
                    <title>{`${e.from} → ${e.to}${e.choice ? ` · choix « ${e.choice} »` : ''}${e.condition ? ` · si ${e.condition}` : ''}`}</title>
                  </path>
                ))}
              </svg>

              {graph.nodes.map((n) => {
                const { x, y } = pos(n);
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={nodeClass(n)}
                    style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
                    onClick={() => setSelected(n.id)}
                    onDoubleClick={() => jumpTo(n.line)}
                    aria-pressed={current?.id === n.id}
                  >
                    <b>{n.kind === 'broken' ? `${n.raw} ?` : n.kind === 'stitch' ? `= ${n.id.split('.')[1]}` : n.id}</b>
                    <span>{nodeSubtitle(n)}</span>
                  </button>
                );
              })}
              {graph.start && byId.get(graph.start) && (
                <div className="map-start-label" style={{ left: pos(byId.get(graph.start)).x, top: pos(byId.get(graph.start)).y - 22 }}>DÉPART</div>
              )}
            </div>
          </div>
        </div>

        {current && (
          <section aria-label="Fiche du nœud sélectionné" className="map-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
              <span className="ec-label">{current.kind === 'broken' ? 'Cible introuvable' : `Fiche n° ${pad2(current.num)}`}</span>
              <span className="ec-serif" style={{ fontWeight: 700, fontSize: 20 }}>{current.kind === 'broken' ? current.raw : current.id}</span>
              <button type="button" className="ec-link" style={{ fontFamily: 'var(--ec-font-ui)', fontSize: 13 }} onClick={() => jumpTo(current.line)}>
                Ouvrir dans l’éditeur
              </button>
            </div>
            <div className="map-card__col">
              <span className="ec-label">Entrées · {current.ins.length}</span>
              <span className="ec-mono">{current.ins.join(', ') || '—'}</span>
            </div>
            <div className="map-card__col">
              <span className="ec-label">Sorties · {current.outs.length}</span>
              <span className="ec-mono">{[...current.outs.map((o) => o.replace(/^\?/, '?')), ...(current.hasEnd ? ['END'] : [])].join(', ') || '—'}</span>
            </div>
            <div className="map-card__col">
              <span className="ec-label">Variables lues</span>
              <span className="ec-mono">{readVars.join(', ') || '—'}</span>
            </div>
            {graph.anomalies.some((a) => a.kind === 'broken') && (
              <button type="button" className="ec-btn ec-btn--quiet ec-btn--sm" style={{ marginLeft: 'auto', alignSelf: 'center' }} onClick={() => navigate('editeur')}>
                Corriger dans l’éditeur
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
