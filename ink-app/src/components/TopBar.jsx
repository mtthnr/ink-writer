const VIEWS = [
  ['editeur', 'Éditeur'],
  ['revue', 'Revue IA'],
  ['carte', 'Carte'],
  ['variables', 'Variables'],
  ['lecteur', 'Lecteur'],
];

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="9.5" fill="none" stroke="#E7AE4F" strokeWidth="1.5" />
      <circle cx="11" cy="11" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <g stroke="currentColor" strokeWidth="1.5">
        <line x1="11" y1="1.5" x2="11" y2="5" />
        <line x1="11" y1="17" x2="11" y2="20.5" />
        <line x1="1.5" y1="11" x2="5" y2="11" />
        <line x1="17" y1="11" x2="20.5" y2="11" />
      </g>
    </svg>
  );
}

/** Barre de commande commune à tous les écrans. */
export function TopBar({ view, onNavigate, hasDoc, subtitle, dirty, children }) {
  return (
    <header className="ec-topbar">
      <button type="button" className="ec-topbar__brand" onClick={() => onNavigate('accueil')} aria-label="En Clair, retour à l’accueil">
        <Logo />
        EN CLAIR
      </button>
      {hasDoc && (
        <nav aria-label="Vues" className="ec-topbar__nav">
          {VIEWS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="ec-topbar__tab"
              aria-current={view === id ? 'page' : undefined}
              onClick={() => onNavigate(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      {subtitle && (
        <div className="ec-topbar__file">
          <span>{subtitle}</span>
          {dirty && <span className="ec-topbar__dirty" role="img" aria-label="Modifications non enregistrées" />}
        </div>
      )}
      <div className="ec-topbar__actions">{children}</div>
    </header>
  );
}
