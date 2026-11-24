import { CATEGORIES, STATUS } from '../lib/categories.js';

/** Tampon de catégorie : la catégorie se lit aussi par la forme et l'inclinaison. */
export function CategoryStamp({ category, size, tilt = true }) {
  const cat = CATEGORIES[category] ?? CATEGORIES.style;
  const cls = ['ec-stamp', `ec-cat-${category in CATEGORIES ? category : 'style'}`];
  if (category === 'coquille') cls.push('ec-stamp--dashed');
  if (size) cls.push(`ec-stamp--${size}`);
  return (
    <span className={cls.join(' ')} style={tilt ? { transform: `rotate(${cat.rot}deg)` } : undefined}>
      {cat.label}
    </span>
  );
}

export function StatusBadge({ status, small }) {
  const s = STATUS[status] ?? STATUS.pending;
  return <span className={`ec-badge ${s.cls}${small ? ' ec-badge--sm' : ''}`}>{s.label}</span>;
}

/**
 * Rotor de progression : graduations fixes, arc ambre, aucune rotation continue.
 * state : 'idle' | 'running' | 'done' | 'error'
 */
export function Rotor({ state = 'idle', size = 44 }) {
  const r = 19;
  const circ = 2 * Math.PI * r;
  const fill = state === 'done' ? circ * 0.87 : state === 'running' ? circ * 0.34 : state === 'error' ? circ : 0;
  const color = state === 'error' ? 'var(--ec-tampon)' : 'var(--ec-lampe-filet)';
  const labels = { idle: 'Aucune analyse', running: 'Analyse en cours', done: 'Analyse terminée', error: 'Analyse en échec' };
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label={labels[state]}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--ec-filet)" strokeWidth="5" />
      {fill > 0 && (
        <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="5" strokeDasharray={`${fill} ${circ}`} transform="rotate(-90 22 22)" />
      )}
      <circle cx="22" cy="22" r="10" fill="var(--ec-commande)" />
      {state === 'done' && <path d="M17.5 22.5l3 3 6-6.5" fill="none" stroke="#8CC487" strokeWidth="2" />}
      {state === 'error' && <path d="M22 16.5v7M22 26.5v1.5" fill="none" stroke="#F08B7A" strokeWidth="2" />}
      {(state === 'running' || state === 'idle') && (
        <g stroke="#F7F2E6" strokeWidth="1.5">
          <line x1="22" y1="14" x2="22" y2="17" />
          <line x1="22" y1="27" x2="22" y2="30" />
          <line x1="14" y1="22" x2="17" y2="22" />
          <line x1="27" y1="22" x2="30" y2="22" />
        </g>
      )}
    </svg>
  );
}

/** Indice de confiance (cadran). */
export function ConfidenceGauge({ value }) {
  const conf = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  const ang = Math.PI * (1 - conf / 100);
  const color = conf >= 90 ? 'var(--ec-telegraphe)' : conf >= 70 ? 'var(--ec-lampe-filet)' : 'var(--ec-tampon)';
  const label = conf >= 90 ? 'Correction sûre' : conf >= 70 ? 'À vérifier' : 'Question de goût';
  return (
    <div className="ec-card" style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 14, borderRadius: 0 }}>
      <svg width="84" height="50" viewBox="0 0 84 50" role="img" aria-label={`Confiance ${conf} %`}>
        <path d="M8 44 A34 34 0 0 1 76 44" fill="none" stroke="var(--ec-filet)" strokeWidth="6" />
        <path d="M8 44 A34 34 0 0 1 76 44" fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${Math.round(106.8 * conf / 100)} 200`} />
        <g stroke="var(--ec-encre-2)" strokeWidth="1">
          <line x1="42" y1="4" x2="42" y2="9" />
          <line x1="12" y1="20" x2="16" y2="23" />
          <line x1="72" y1="20" x2="68" y2="23" />
        </g>
        <line x1="42" y1="44" x2={Math.round(42 + 26 * Math.cos(ang))} y2={Math.round(44 - 26 * Math.sin(ang))} stroke="var(--ec-encre)" strokeWidth="2" />
        <circle cx="42" cy="44" r="3.5" fill="var(--ec-encre)" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="ec-label">Indice de confiance</span>
        <span className="ec-mono" style={{ fontSize: 24, fontWeight: 700 }}>{conf} %</span>
        <span className="ec-mute" style={{ fontSize: 12 }}>{label}</span>
      </div>
    </div>
  );
}

const TOAST_KIND = { ok: 'REÇU', err: 'ÉCHEC', wait: 'EN COURS' };

export function Toasts({ toasts, onDismiss }) {
  return (
    <div className="ec-toasts">
      {toasts.map((t) => (
        <div key={t.id} className="ec-toast" role={t.kind === 'err' ? 'alert' : 'status'}>
          <span className={`ec-toast__kind ec-toast__kind--${t.kind}`}>{TOAST_KIND[t.kind]}</span>
          <span className="ec-toast__msg">{t.message}</span>
          <button type="button" className="ec-toast__close" aria-label="Fermer" onClick={() => onDismiss(t.id)}>×</button>
        </div>
      ))}
    </div>
  );
}
