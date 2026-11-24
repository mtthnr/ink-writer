import { compileInk } from '../ink/compile.js';
import { nearestLines, resolveTarget } from './anchor.js';

/**
 * Validation des `edits` renvoyés par l'IA, avant qu'ils n'atteignent l'interface.
 * Même sémantique d'application que le front (ink-app/src/lib/edits.js) : le `target` doit être
 * non vide (sauf append) et présent exactement une fois. Un repère approximatif mais sans ambiguïté
 * est réparé (remplacé par le texte exact du fichier). Après application, le fichier doit compiler.
 */

function splice(source, at, target, { operation, content }) {
  const end = at + target.length;
  switch (operation) {
    case 'replace': return source.slice(0, at) + content + source.slice(end);
    case 'delete': return source.slice(0, at) + source.slice(end);
    case 'insert_before': return source.slice(0, at) + content + source.slice(at);
    case 'insert_after': return source.slice(0, end) + content + source.slice(end);
    default: return null;
  }
}

// Une insertion sans séparateur se collerait au texte voisin (« head."Hooper… ») : on ajoute une espace.
function separate(operation, target, content) {
  if (!content) return content;
  if (operation === 'insert_after' && !/\s$/.test(target) && !/^\s/.test(content)) return ` ${content}`;
  if (operation === 'insert_before' && !/^\s/.test(target) && !/\s$/.test(content)) return `${content} `;
  return content;
}

// Après un divert (« -> cible », « ->-> »), seul un choix, un rassemblement « - » ou un en-tête peut être atteint.
const ENDS_WITH_DIVERT = /(->\s*[\w.]*|->->)\s*$/;
const REACHABLE_START = /^\s*([*+]|-(?!>)|=)/;
function insertsDeadText(target, content) {
  const lastLine = target.replace(/\s+$/, '').split('\n').pop();
  if (!ENDS_WITH_DIVERT.test(lastLine)) return false;
  const firstLine = content.split('\n').find((l) => l.trim());
  return Boolean(firstLine) && !REACHABLE_START.test(firstLine) && !/^\s*\/\//.test(firstLine);
}

const show = (s) => JSON.stringify(s.length > 160 ? `${s.slice(0, 160)}…` : s);

/**
 * Vérifie (et répare si possible) les edits d'un item.
 * @returns {{ problems: string[], edits: object[], repairs: { edit: number, from: string, to: string }[] }}
 */
export function checkItem(source, item) {
  const edits = [];
  const repairs = [];
  let current = source;

  for (const [i, edit] of item.edits.entries()) {
    const label = `edit ${i + 1} (${edit.operation})`;
    if (edit.operation === 'append') {
      current = current + (current.endsWith('\n') || !current ? '' : '\n') + edit.content;
      edits.push(edit);
      continue;
    }
    const hint = edit.knot ?? item.knot ?? null;
    if (edit.operation === 'insert_after' && edit.target && insertsDeadText(edit.target, edit.content)) {
      const divertLine = edit.target.replace(/\s+$/, '').split('\n').pop().trim();
      const alt = resolveTarget(current, divertLine, 'insert_before', hint);
      const anchors = alt.status === 'ambiguous'
        ? alt.occurrences.slice(0, 6).map((o) => `      L.${o.line} (knot ${o.owner || 'début'}) → ${o.anchor ? JSON.stringify(o.anchor) : '(pas d’extrait court unique)'}`).join('\n')
        : alt.target ? `      ${JSON.stringify(alt.target)}` : '      (divert introuvable)';
      return { problems: [`${label} : texte inséré juste après un divert (${show(divertLine)}) : il ne serait jamais lu. Utilise insert_before (content terminé par "\\n") avec pour target l'un de ces extraits uniques :\n${anchors}`], edits: item.edits, repairs };
    }
    const r = resolveTarget(current, edit.target, edit.operation, hint);
    if (r.status === 'empty') return { problems: [`${label} : target vide (seule l’opération append l’autorise ; pour viser un knot, prends sa ligne d’en-tête)`], edits: item.edits, repairs };
    if (r.status === 'ambiguous') {
      const choices = r.occurrences.slice(0, 6).map((o) => `      L.${o.line} (knot ${o.owner || 'début'}) → target unique à utiliser : ${o.anchor ? JSON.stringify(o.anchor) : '(aucun extrait court unique, choisis un autre repère)'}`);
      return { problems: [`${label} : target présent ${r.occurrences.length} fois : ${show(edit.target)}. Choisis le bon passage et reprends EXACTEMENT son target unique :\n${choices.join('\n')}`], edits: item.edits, repairs };
    }
    if (r.status === 'missing') {
      const near = nearestLines(current, edit.target);
      const hint = near.length
        ? `\n      Lignes réelles les plus proches dans le fichier (à recopier telles quelles, tabulations comprises) :\n${near.map((n) => `      L.${n.line} ${JSON.stringify(n.text)}`).join('\n')}`
        : '\n      Aucune ligne ressemblante : ce texte n’existe pas dans le fichier.';
      return { problems: [`${label} : target introuvable dans le fichier : ${show(edit.target)}${hint}`], edits: item.edits, repairs };
    }
    let fixed = { ...edit, target: r.target, content: separate(edit.operation, r.target, edit.content) };
    if (r.status === 'repaired') {
      repairs.push({ edit: i + 1, from: edit.target, to: r.target, reason: r.reason });
      // Repère étendu pour être unique : le texte ajouté autour doit être conservé par un replace / delete.
      if (edit.operation === 'replace') fixed.content = r.pre + fixed.content + r.post;
      if (edit.operation === 'delete' && (r.pre || r.post)) fixed = { ...fixed, operation: 'replace', content: r.pre + r.post };
    }
    const next = splice(current, current.indexOf(r.target), r.target, fixed);
    if (next == null) return { problems: [`${label} : opération inconnue`], edits: item.edits, repairs };
    current = next;
    edits.push(fixed);
  }

  if (edits.length) {
    const compiled = compileInk(current);
    if (!compiled.ok) {
      const problems = compiled.errors.slice(0, 3).map((e) => `après application, le fichier ne compile plus${e.line ? ` (ligne ${e.line})` : ''} : ${e.message}`);
      return { problems, edits: item.edits, repairs };
    }
  }
  return { problems: [], edits, repairs };
}

/**
 * Valide tous les items d'une réponse.
 * @returns {{ result: object, invalid: { id: string, title: string, problems: string[] }[], repaired: { id: string, title: string, repairs: object[] }[] }}
 *   `result` porte les edits réparés.
 */
export function validateItems(source, result) {
  const invalid = [];
  const repaired = [];
  const items = result.items.map((item) => {
    const { problems, edits, repairs } = checkItem(source, item);
    if (problems.length) {
      invalid.push({ id: item.id, title: item.title, problems });
      return item;
    }
    if (repairs.length) repaired.push({ id: item.id, title: item.title, repairs });
    return { ...item, edits };
  });
  return { result: { ...result, items }, invalid, repaired };
}
