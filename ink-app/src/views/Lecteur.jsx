import { useEffect, useRef } from 'react';
import { formatValue } from '../hooks/usePlayer.js';
import './Lecteur.css';

const LETTERS = 'ABCDEFGHI';
const ROTS = [-0.6, 0.5, -0.3, 0.4];

export default function Lecteur({ parsed, player, compiled, compile, navigate, jumpTo }) {
  const articleRef = useRef(null);
  const vars = parsed.vars.filter((v) => v.kind === 'VAR');
  const values = player.steps[player.step] ?? {};
  const blocked = compiled && !compiled.ok;

  // Touches 1–9 pour choisir.
  const { choices, choose } = player;
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= choices.length) choose(choices[n - 1].index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choices, choose]);

  // Suit la transcription.
  useEffect(() => {
    const el = articleRef.current?.closest('.ec-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  }, [player.entries.length]);

  return (
    <div className="ec-body">
      <aside className="ec-side ec-side--left rd-trail ec-scroll" aria-label="Ruban du parcours">
        <span className="ec-label ec-label--strong">Ruban du parcours</span>
        <ol className="rd-trail__list">
          {player.trail.map((t, i) => (
            <li key={`${t.name}-${i}`}>
              <span className="ec-mono" style={{ fontSize: 14, fontWeight: i === player.trail.length - 1 ? 700 : 400, color: i === player.trail.length - 1 ? 'var(--ec-lampe)' : 'var(--ec-encre)' }}>{t.name}</span>
              <span className="ec-mute" style={{ fontSize: 12 }}>{i === 0 ? 'départ' : `pas ${t.step}`}</span>
            </li>
          ))}
        </ol>
      </aside>

      <main className="ec-main rd-main ec-scroll">
        <article aria-live="polite" className="rd-sheet" ref={articleRef}>
          <div className="rd-sheet__head ec-label">
            <span>Transcription · lecture de test</span>
            <span>Feuillet {player.runNo}</span>
          </div>

          {blocked && (
            <div role="alert" className="rd-alert">
              <span className="rd-alert__title">TRANSMISSION INTERROMPUE</span>
              <span className="ec-mono" style={{ fontSize: 14 }}>
                Le fichier ne compile pas{compiled.errors[0] ? ` : ${compiled.errors[0].message}${compiled.errors[0].line ? ` (L.${compiled.errors[0].line})` : ''}` : ''}.
              </span>
              <button type="button" className="rd-alert__link" onClick={() => jumpTo(compiled.errors[0]?.line)}>Voir dans l’éditeur</button>
            </div>
          )}
          {!blocked && !player.ready && (
            <p className="ec-mute" style={{ margin: 0 }}>{compile.error ? `Compilateur injoignable : ${compile.error}` : 'Compilation de l’histoire…'}</p>
          )}

          {player.entries.map((e, i) => {
            if (e.kind === 'knot') return <div key={i} className="rd-knot ec-label"><span />{`— ${e.text} —`}<span /></div>;
            if (e.kind === 'p') return <p key={i} className="rd-p">{e.text}</p>;
            if (e.kind === 'you') return <p key={i} className="rd-you">&gt; {e.text}</p>;
            if (e.kind === 'err') {
              return (
                <div key={i} role="alert" className="rd-alert">
                  <span className="rd-alert__title">TRANSMISSION INTERROMPUE</span>
                  <span className="ec-mono" style={{ fontSize: 14 }}>{e.text}</span>
                  <button type="button" className="rd-alert__link" onClick={() => navigate('editeur')}>Corriger dans l’éditeur</button>
                </div>
              );
            }
            return (
              <div key={i} className="rd-end">
                <span className="ec-stamp ec-stamp--double" style={{ color: 'var(--ec-encre)', letterSpacing: '.3em', transform: 'rotate(-3deg)' }}>{e.text}</span>
              </div>
            );
          })}
        </article>

        {player.choices.length > 0 && (
          <div role="group" aria-label="Choix disponibles" className="rd-choices">
            {player.choices.map((c, i) => (
              <button key={c.index} type="button" className="rd-choice" style={{ transform: `rotate(${ROTS[i % ROTS.length]}deg)` }} onClick={() => player.choose(c.index)}>
                <span className="rd-choice__meta"><span>FICHE {LETTERS[i] ?? i + 1}</span><span>{i < 9 ? `touche ${i + 1}` : ''}</span></span>
                <span className="rd-choice__label">{c.text}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <aside className="ec-side ec-side--right rd-state ec-scroll" aria-label="État de la lecture">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="ec-label ec-label--strong">Variables en direct</span>
          {vars.length === 0 && <p className="ec-mute" style={{ margin: 0, fontSize: 13 }}>Aucune variable globale.</p>}
          {vars.map((v) => {
            const val = values[v.name];
            const isInt = typeof val === 'number' && Number.isInteger(val) && val >= 0 && val <= 10;
            return (
              <div key={v.name} className="rd-var">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span>{v.name}</span>
                  <b style={{ color: val === true ? 'var(--ec-telegraphe)' : val === false ? 'var(--ec-encre-2)' : 'var(--ec-encre)' }}>{formatValue(val)}</b>
                </div>
                {isInt && (
                  <div aria-hidden="true" style={{ display: 'flex', gap: 2 }}>
                    {Array.from({ length: 10 }, (_, k) => <span key={k} style={{ flex: 1, height: 8, background: k < val ? 'var(--ec-commande)' : 'var(--ec-filet-doux)' }} />)}
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="ec-link" style={{ fontFamily: 'var(--ec-font-ui)', fontSize: 13 }} onClick={() => navigate('variables')}>
            Ouvrir l’inspecteur complet
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="ec-label ec-label--strong">Tags reçus</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {player.tags.length === 0 && <span className="ec-mute" style={{ fontSize: 13 }}>Aucun tag.</span>}
            {player.tags.map((t) => <span key={t} className="rd-tag">#{t}</span>)}
          </div>
        </div>
        <p className="rd-state__foot">
          Seuls les choix disponibles sont proposés : un choix dont la condition n’est pas remplie n’apparaît pas.
          Consultez la carte pour vérifier qu’une branche reste atteignable.
        </p>
      </aside>
    </div>
  );
}
