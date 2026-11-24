import { useMemo, useState } from 'react';
import { formatValue } from '../hooks/usePlayer.js';
import { variableUsage } from '../lib/inkParse.js';
import './Variables.css';

const CX = 84;
const CY = 88;
const pt = (f, r) => [CX - r * Math.cos(Math.PI * f), CY - r * Math.sin(Math.PI * f)];

function Dial({ name, value, max, delta }) {
  const v = typeof value === 'number' ? value : 0;
  const clamped = Math.max(0, Math.min(max, v));
  let ticks = '';
  for (let i = 0; i <= max; i++) {
    const f = i / max;
    const [x1, y1] = pt(f, 58);
    const [x2, y2] = pt(f, i % 5 === 0 ? 46 : 51);
    ticks += `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} `;
  }
  const [nx, ny] = pt(clamped / max, 54);
  return (
    <div className="var-instrument">
      <svg width="168" height="100" viewBox="0 0 168 100" role="img" aria-label={`${name} : ${formatValue(value)} sur ${max}`}>
        <circle cx={CX} cy={CY} r="74" fill="#ECE3CC" />
        <path d="M18 88 A66 66 0 0 1 150 88" fill="none" stroke="#CDBE9C" strokeWidth="8" />
        <path d={ticks} fill="none" stroke="#1B2230" strokeWidth="1.5" />
        <line x1={CX} y1={CY} x2={nx.toFixed(1)} y2={ny.toFixed(1)} stroke="#1B2230" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="6" fill="#26302A" />
        <text x="18" y="99" fontFamily="Courier Prime, monospace" fontSize="10" fill="#545A63">0</text>
        <text x="150" y="99" textAnchor="end" fontFamily="Courier Prime, monospace" fontSize="10" fill="#545A63">{max}</text>
      </svg>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="ec-mono" style={{ fontSize: 15, fontWeight: 700 }}>{name}</span>
        <span className="ec-mono" style={{ fontSize: 22, fontWeight: 700, color: v > max || v < 0 ? '#E26A57' : '#E8E0CB' }}>{formatValue(value)}</span>
      </div>
      <span className="var-instrument__delta">{delta}</span>
    </div>
  );
}

function Toggle({ name, value, delta }) {
  const on = value === true;
  return (
    <div className="var-instrument" style={{ justifyContent: 'center', gap: 12 }}>
      <div aria-hidden="true" className="var-toggle">
        <span style={{ color: on ? '#8CC487' : '#7C7866' }}>VRAI</span>
        <span className="var-toggle__track" style={{ justifyContent: on ? 'flex-start' : 'flex-end' }}>
          <span className="var-toggle__knob" style={{ background: on ? '#2C6A3D' : '#545A63' }} />
        </span>
        <span style={{ color: on ? '#7C7866' : '#E8E0CB' }}>FAUX</span>
      </div>
      <span className="ec-mono" style={{ fontSize: 15, fontWeight: 700 }}>{name} = {formatValue(value)}</span>
      <span className="var-instrument__delta">{delta}</span>
    </div>
  );
}

export default function Variables({ parsed, player, compiled, navigate, jumpTo }) {
  const usage = useMemo(() => variableUsage(parsed), [parsed]);
  const [picked, setPicked] = useState(null);
  const step = picked == null ? player.step : Math.min(picked, player.step);
  const values = player.steps[step] ?? {};
  const log = player.log.filter((l) => l.step <= step);
  const running = player.ready && player.steps.length > 0;

  const lastWriteOf = (name) => [...log].reverse().find((l) => l.name === name);
  const deltaOf = (name) => {
    const w = lastWriteOf(name);
    if (w) return `${formatValue(w.value)} au pas ${w.step} · ${w.where ?? '—'}`;
    return usage[name]?.writes ? 'inchangée depuis le départ' : 'jamais écrite';
  };

  const decl = parsed.vars;
  const ints = decl.filter((v) => v.kind === 'VAR' && (v.type === 'INT' || v.type === 'FLOAT'));
  const bools = decl.filter((v) => v.kind === 'VAR' && v.type === 'BOOL');
  const consts = decl.filter((v) => v.kind === 'CONST').length;

  const maxOf = (name) => {
    const seen = player.steps.map((s) => s?.[name]).filter((x) => typeof x === 'number');
    const top = Math.max(10, ...seen);
    return Math.ceil(top / 5) * 5;
  };

  const blocked = compiled && !compiled.ok;

  return (
    <>
      <div className="var-source">
        <span className="ec-label ec-label--strong">Source</span>
        <span style={{ fontSize: 14 }}>
          {blocked
            ? 'Le fichier ne compile pas : lecture de test impossible, valeurs déclarées seulement.'
            : running
              ? <>Lecture de test en cours · pas <b>{step}</b> sur {player.step}{player.knot && <> · knot <span className="ec-mono" style={{ fontWeight: 700 }}>{player.knot}</span></>}</>
              : 'Lecture de test en préparation…'}
        </span>
        <label htmlFor="pas" className="ec-mute" style={{ fontSize: 13, marginLeft: 'auto' }}>Remonter le ruban</label>
        <input id="pas" type="range" min="0" max={player.step} value={step} onChange={(e) => setPicked(Number(e.target.value))} disabled={!running || player.step === 0} className="var-range" />
        <button type="button" className="ec-btn ec-btn--secondary ec-btn--md" onClick={() => setPicked(0)} disabled={!running}>Valeurs initiales</button>
        <button type="button" className="ec-btn ec-btn--quiet ec-btn--md" onClick={() => navigate('lecteur')}>Ouvrir le lecteur</button>
      </div>

      <div className="ec-body">
        <main className="ec-main var-main ec-scroll">
          {(ints.length > 0 || bools.length > 0) && (
            <section aria-labelledby="cadrans" className="var-panel">
              <div className="var-panel__head">
                <h2 id="cadrans" className="var-panel__title">Tableau des cadrans · VAR</h2>
                <span className="ec-mono" style={{ fontSize: 12, color: '#B0AA94' }}>{ints.length + bools.length} voies</span>
              </div>
              <div className="var-grid">
                {ints.map((v) => (
                  <Dial key={v.name} name={v.name} value={running ? values[v.name] : Number(v.init)} max={maxOf(v.name)} delta={running ? deltaOf(v.name) : `initiale ${v.init}`} />
                ))}
                {bools.map((v) => (
                  <Toggle key={v.name} name={v.name} value={running ? values[v.name] : v.init === 'true'} delta={running ? deltaOf(v.name) : `initiale ${v.init}`} />
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="fiche" className="var-sheet">
            <div className="var-sheet__head">
              <h2 id="fiche" className="var-panel__title" style={{ color: 'var(--ec-encre)' }}>Fiche signalétique</h2>
              <span className="ec-mono ec-mute" style={{ fontSize: 12 }}>{decl.length - consts} VAR · {consts} CONST</span>
            </div>
            {decl.length === 0 ? (
              <p className="ec-mute" style={{ margin: 0, padding: 16 }}>Aucune variable globale déclarée (VAR / CONST).</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="var-table">
                  <thead>
                    <tr>
                      <th>Nom</th><th>Nature</th><th>Initiale</th><th>Actuelle</th><th>Lue / écrite</th><th>Dernière écriture</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decl.map((v) => {
                      const isConst = v.kind === 'CONST';
                      const cur = isConst ? v.init : running && v.name in values ? formatValue(values[v.name]) : v.init;
                      const changed = !isConst && cur !== v.init;
                      const w = lastWriteOf(v.name);
                      const u = usage[v.name] ?? { reads: 0, writes: 0 };
                      return (
                        <tr key={v.name} className={isConst ? 'is-const' : changed ? 'is-changed' : undefined}>
                          <td className="ec-mono var-table__name">
                            <button type="button" className="var-link" onClick={() => jumpTo(v.line)}>{v.name}</button>
                          </td>
                          <td>
                            <span className="var-kind" style={{ color: isConst ? 'var(--ec-lampe)' : 'var(--ec-encre-bleue)' }}>{isConst ? 'CONST' : `${v.kind} · ${v.type}`}</span>
                          </td>
                          <td className="ec-mono ec-mute">{v.init}</td>
                          <td className="ec-mono" style={{ fontWeight: 700, color: cur === 'true' ? 'var(--ec-telegraphe)' : changed ? 'var(--ec-lampe)' : isConst ? 'var(--ec-encre-2)' : 'var(--ec-encre)' }}>{cur}</td>
                          <td className="ec-mono">{u.reads} / {isConst ? '—' : u.writes}</td>
                          <td className="ec-mono ec-mute">
                            {isConst
                              ? 'constante'
                              : w
                                ? `${w.where ?? '—'} · pas ${w.step}`
                                : !u.writes
                                  ? 'jamais écrite'
                                  : running
                                    ? 'pas encore écrite'
                                    : `${u.lastWrite.owner || 'début'} · L.${u.lastWrite.line}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        <aside className="ec-side ec-side--right var-journal ec-scroll" aria-labelledby="journal">
          <h2 id="journal" className="var-panel__title var-journal__title">Journal des écritures</h2>
          {log.length === 0 && <p className="ec-mute" style={{ margin: 0, fontSize: 13 }}>Aucune écriture enregistrée à ce pas.</p>}
          <ol className="var-journal__list">
            {[...log].reverse().map((l, i) => (
              <li key={i}>
                <span className="ec-mono ec-mute" style={{ fontSize: 12 }}>P.{l.step}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="ec-mono" style={{ fontSize: 14, color: 'var(--ec-sx-var)' }}>~ {l.name} = {formatValue(l.value)}</span>
                  <span className="ec-mute" style={{ fontSize: 12 }}>{l.where ?? '—'}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </>
  );
}
