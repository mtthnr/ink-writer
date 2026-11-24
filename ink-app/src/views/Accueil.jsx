import { useState } from 'react';
import { loadRegistry, removeFromRegistry } from '../lib/registry.js';
import './Accueil.css';

const STAMP_TONE = {
  red: { color: 'var(--ec-tampon)', style: 'solid' },
  green: { color: 'var(--ec-telegraphe)', style: 'solid' },
  amber: { color: 'var(--ec-lampe)', style: 'solid' },
  draft: { color: 'var(--ec-encre-2)', style: 'dashed' },
};
const ROTATIONS = [-2, 1.5, -1, 2];

function formatNow(d) {
  const day = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  const time = `${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`;
}

function formatWhen(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 60 * 12) return `il y a ${Math.round(min / 60)} h`;
  const d = new Date(ts);
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d) + `, ${d.getHours()} h ${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Accueil({ onOpenFile, onNew, onSample, onOpenEntry, currentDoc, onResume }) {
  const [now] = useState(() => new Date());
  const [dragging, setDragging] = useState(false);
  const [recents, setRecents] = useState(() => loadRegistry());

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    onOpenFile(e.dataTransfer.files[0]);
  };

  return (
    <>
      <main className="acc">
        <section className="acc__main">
          <div className="acc__intro">
            <div className="ec-label" style={{ fontSize: 13, letterSpacing: '.18em' }}>{formatNow(now)}</div>
            <h1 className="acc__title">Un nouveau dossier est arrivé ?</h1>
            <p className="acc__lead">Déposez-le sur la table. Nous l’ouvrirons ensemble.</p>
          </div>

          <div className="acc__folder">
            <div className="acc__folder-tab" aria-hidden="true">DOSSIER À OUVRIR</div>
            <label
              htmlFor="ink-file"
              className={`acc__drop${dragging ? ' is-dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span className="acc__drop-frame" aria-hidden="true" />
              <span className="acc__drop-stamp" aria-hidden="true">CONFIDENTIEL</span>
              <span className="acc__sheet" aria-hidden="true">
                <span style={{ height: 6, width: '70%', background: 'var(--ec-sx-knot)' }} />
                <span style={{ width: '100%' }} />
                <span style={{ width: '88%' }} />
                <span style={{ width: '60%', background: 'var(--ec-lampe-filet)' }} />
                <span style={{ width: '92%' }} />
                <span style={{ width: '50%', background: 'var(--ec-telegraphe)' }} />
                <span className="acc__sheet-ext">.ink</span>
              </span>
              <span className="acc__drop-text">
                <span className="acc__drop-title">Déposez un fichier .ink ici</span>
                <span className="acc__drop-sub">ou <span className="acc__browse">parcourez vos fichiers</span></span>
              </span>
              <input
                id="ink-file"
                type="file"
                accept=".ink,.txt"
                className="visually-hidden"
                onChange={(e) => {
                  onOpenFile(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div className="acc__actions">
            {currentDoc && (
              <button type="button" className="ec-btn ec-btn--primary ec-btn--xl" onClick={onResume}>
                Reprendre {currentDoc.name}
              </button>
            )}
            <button type="button" className={`ec-btn ${currentDoc ? 'ec-btn--secondary' : 'ec-btn--primary'} ec-btn--xl`} onClick={onNew}>
              Nouveau dossier vierge
            </button>
            <button type="button" className="ec-btn ec-btn--secondary ec-btn--xl" onClick={onSample}>
              Ouvrir l’histoire d’exemple
            </button>
          </div>
        </section>

        <aside className="acc__side" aria-labelledby="recents">
          <div className="acc__side-head">
            <h2 id="recents" className="acc__side-title">Registre des dossiers</h2>
            <span className="ec-mono ec-mute" style={{ fontSize: 13 }}>{recents.length} {recents.length > 1 ? 'entrées' : 'entrée'}</span>
          </div>
          {recents.length === 0 && (
            <p className="acc__empty">Aucun dossier pour l’instant. Les fichiers ouverts ici s’inscrivent au registre.</p>
          )}
          {recents.map((r, i) => {
            const tone = STAMP_TONE[r.stamp?.tone] ?? STAMP_TONE.draft;
            return (
              <div key={r.id} className="acc__row">
                <button type="button" className="acc__entry" onClick={() => onOpenEntry({ id: r.id, name: r.name, source: r.source })}>
                  <span className="ec-mono ec-mute" style={{ fontSize: 13 }}>N° {String(recents.length - i).padStart(2, '0')}</span>
                  <span className="acc__entry-body">
                    <span className="acc__entry-file">{r.name}</span>
                    <span className="acc__entry-meta">{r.knots} knots · {formatWhen(r.updatedAt)}</span>
                  </span>
                  <span
                    className="ec-stamp"
                    style={{ color: tone.color, borderStyle: tone.style, transform: `rotate(${ROTATIONS[i % ROTATIONS.length]}deg)` }}
                  >
                    {r.stamp?.label ?? 'BROUILLON'}
                  </span>
                </button>
                <button
                  type="button"
                  className="acc__remove"
                  aria-label={`Retirer ${r.name} du registre`}
                  title="Retirer du registre (le fichier d’origine n’est pas supprimé)"
                  onClick={() => setRecents(removeFromRegistry(r.id))}
                >
                  ×
                </button>
              </div>
            );
          })}
          <div className="ec-perfs" aria-hidden="true" />
          <p className="acc__note">
            Rien ne quitte ce poste sans votre accord : le fichier n’est envoyé à l’analyste IA que lorsque vous lancez une analyse,
            et le registre reste dans ce navigateur.
          </p>
        </aside>
      </main>

      <footer className="acc__footer">
        <span>Ctrl O · ouvrir</span>
        <span>Ctrl S · exporter</span>
        <span>Ctrl Alt N · nouveau</span>
      </footer>
    </>
  );
}
