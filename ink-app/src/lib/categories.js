// Catégories des items IA (champ `category` du format de réponse) et statuts de revue.

export const CATEGORIES = {
  syntaxe: { label: 'SYNTAXE', short: 'Syntaxe', rot: -2 },
  coherence: { label: 'COHÉRENCE', short: 'Cohérence', rot: 1.5 },
  style: { label: 'STYLE', short: 'Style', rot: -1 },
  coquille: { label: 'COQUILLE', short: 'Coquille', rot: 2 },
};

export const STATUS = {
  pending: { label: 'En attente', cls: 'ec-badge--pending' },
  accepted: { label: 'Accepté', cls: 'ec-badge--accepted' },
  rejected: { label: 'Rejeté', cls: 'ec-badge--rejected' },
};
