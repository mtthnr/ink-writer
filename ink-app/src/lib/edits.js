/**
 * Application des `edits` renvoyés par l'IA (format défini dans server/ai/schema.js)
 * et calcul de ce qu'il faut afficher (avant / après) pour un item.
 */

function findUnique(source, target) {
  if (!target) return { error: 'Extrait de repère vide' };
  const at = source.indexOf(target);
  if (at < 0) return { error: 'Extrait introuvable dans le fichier actuel' };
  if (source.indexOf(target, at + 1) >= 0) return { error: 'Extrait présent plusieurs fois dans le fichier' };
  return { at };
}

/** @returns {{ ok: true, source: string } | { ok: false, error: string }} */
export function applyEdit(source, edit) {
  const { operation, target, content } = edit;
  if (operation === 'append') {
    const sep = source.endsWith('\n') || !source ? '' : '\n';
    return { ok: true, source: source + sep + content };
  }
  const found = findUnique(source, target);
  if (found.error) return { ok: false, error: found.error };
  const { at } = found;
  const end = at + target.length;
  switch (operation) {
    case 'replace': return { ok: true, source: source.slice(0, at) + content + source.slice(end) };
    case 'delete': return { ok: true, source: source.slice(0, at) + source.slice(end) };
    case 'insert_before': return { ok: true, source: source.slice(0, at) + content + source.slice(at) };
    case 'insert_after': return { ok: true, source: source.slice(0, end) + content + source.slice(end) };
    default: return { ok: false, error: `Opération inconnue : ${operation}` };
  }
}

/**
 * Applique tous les edits, dans l'ordre, ou aucun.
 * En cas d'échec : index de l'edit fautif, l'edit lui-même et la source sur laquelle il a échoué
 * (qui peut différer de la source d'origine si des edits précédents ont déjà été appliqués).
 */
export function applyEdits(source, edits) {
  let current = source;
  for (const [index, edit] of edits.entries()) {
    const r = applyEdit(current, edit);
    if (!r.ok) return { ...r, index, edit, failedOn: current, appliedBefore: index };
    current = r.source;
  }
  return { ok: true, source: current };
}

const lineAt = (source, index) => source.slice(0, index).split('\n').length;

/* ---------------------------------------------------------------------------
   Diagnostic d'un extrait de repère (`target`) qui ne s'applique pas.
   --------------------------------------------------------------------------- */

const normalize = (s) => s
  .replace(/[’‘ʼ]/g, "'")
  .replace(/[“”«»]/g, '"')
  .replace(/[\u00A0\u202F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Plus long préfixe de `target` présent dans `source` (recherche dichotomique). */
function longestPrefix(source, target) {
  let lo = 0;
  let hi = target.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (source.includes(target.slice(0, mid))) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Explique pourquoi un extrait n'est pas trouvé (ou pas unique) : occurrences,
 * correspondance après normalisation (espaces, apostrophes, guillemets),
 * plus long préfixe trouvé et premier caractère divergent.
 */
export function diagnoseTarget(source, target) {
  if (!target) return { cause: 'Extrait de repère vide (seule l’opération append l’autorise)' };

  const occurrences = [];
  for (let i = source.indexOf(target); i >= 0; i = source.indexOf(target, i + 1)) occurrences.push(lineAt(source, i));
  if (occurrences.length > 1) {
    return { cause: `Extrait présent ${occurrences.length} fois : impossible de savoir lequel modifier`, occurrencesAuxLignes: occurrences, target };
  }
  if (occurrences.length === 1) return { cause: 'Extrait trouvé une seule fois (pas de problème de repère)', ligne: occurrences[0] };

  const diag = { cause: 'Extrait introuvable', target, longueur: target.length };

  // Même texte à la typographie / aux espaces près ?
  const nt = normalize(target);
  const lines = source.split('\n');
  for (let size = 1; size <= Math.min(12, target.split('\n').length + 2); size++) {
    for (let i = 0; i + size <= lines.length; i++) {
      if (normalize(lines.slice(i, i + size).join('\n')).includes(nt)) {
        diag.cause = 'Extrait introuvable tel quel, mais présent à la typographie ou aux espaces près (apostrophes, guillemets, espaces, retours à la ligne)';
        diag.ressemblantAuxLignes = `${i + 1}–${i + size}`;
        diag.texteReel = lines.slice(i, i + size).join('\n');
        return diag;
      }
    }
  }

  // Jusqu'où l'extrait correspond-il ?
  const n = longestPrefix(source, target);
  if (n >= 6) {
    const at = source.indexOf(target.slice(0, n));
    diag.prefixeTrouve = { caracteres: `${n} / ${target.length}`, ligne: lineAt(source, at) };
    diag.divergence = {
      attendu: JSON.stringify(target.slice(n, n + 40)),
      reel: JSON.stringify(source.slice(at + n, at + n + 40)),
    };
    diag.cause = `Extrait introuvable : les ${n} premiers caractères correspondent (ligne ${lineAt(source, at)}), puis le texte diverge`;
  } else {
    diag.cause = 'Extrait introuvable : texte absent du fichier (inventé ou reformulé par l’IA)';
  }
  return diag;
}

/**
 * Localise le premier edit d'un item dans la source et prépare l'affichage
 * « texte actuel » / « texte proposé » à l'échelle des lignes touchées.
 */
export function describeEdit(source, edit) {
  if (!edit) return null;
  const lines = source.split('\n');
  if (edit.operation === 'append') {
    return { line: lines.length + 1, pre: '', del: '', ins: edit.content, post: '', before: '', after: edit.content, ctxA: lines[lines.length - 1] ?? '', ctxB: '', found: true };
  }
  const found = findUnique(source, edit.target);
  if (found.error) return { found: false, error: found.error, del: edit.target, ins: edit.content };
  const at = found.at;
  const end = at + edit.target.length;
  // La région affichée couvre les lignes entières touchées par l'extrait.
  const lineStart = source.lastIndexOf('\n', at - 1) + 1;
  const nl = edit.target.endsWith('\n') ? end - 1 : source.indexOf('\n', end);
  const regionEnd = Math.max(end, nl < 0 ? source.length : nl);

  let pre = source.slice(lineStart, at);
  let del = edit.target;
  let ins = edit.content;
  let post = source.slice(end, regionEnd);
  if (edit.operation === 'delete') ins = '';
  if (edit.operation === 'insert_after') { pre = source.slice(lineStart, end); del = ''; }
  if (edit.operation === 'insert_before') { del = ''; post = source.slice(at, regionEnd); }

  const line = lineAt(source, lineStart);
  const lastLine = lineAt(source, Math.max(lineStart, regionEnd - (edit.target.endsWith('\n') ? 1 : 0)));
  return {
    found: true,
    line,
    lastLine,
    start: at,
    end,
    pre, del, ins, post,
    before: pre + del + post, // = source.slice(lineStart, regionEnd)
    after: pre + ins + post,
    ctxA: lines[line - 2] ?? '',
    ctxB: lines[lastLine] ?? '',
  };
}
