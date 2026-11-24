/**
 * Résolution des repères (`target`) renvoyés par l'IA.
 *
 * Les modèles recopient rarement un extrait à l'identique dans un long fichier : tabulations remplacées
 * par des espaces, apostrophes typographiques, `===` final ajouté à un en-tête de knot, étiquette de
 * choix « (took) » oubliée… Quand l'extrait exact est introuvable, on le recherche après normalisation ;
 * s'il correspond à UN SEUL passage, on le remplace par le texte exact du fichier.
 */

const QUOTES = { '’': "'", '‘': "'", 'ʼ': "'", '“': '"', '”': '"', '«': '"', '»': '"' };
const HEADER_TAIL = /^(\s*=+\s*(?:function\s+)?[A-Za-z_]\w*(?:\([^)]*\))?)\s*=*\s*$/;
const CHOICE_LABEL = /^(\s*(?:[*+-]\s*)+)\(\s*[A-Za-z_]\w*\s*\)\s*/;

/** Normalise une ligne : en-têtes sans `===` final, choix sans étiquette. Renvoie les plages conservées. */
function lineKeep(line) {
  const header = HEADER_TAIL.exec(line);
  if (header) return [[0, header[1].length]];
  const label = CHOICE_LABEL.exec(line);
  if (label) return [[0, label[1].length], [label[0].length, line.length]];
  return [[0, line.length]];
}

/**
 * Texte normalisé + table de correspondance vers les positions d'origine.
 * Espaces, tabulations et sauts de ligne consécutifs → une seule espace ; guillemets → ASCII.
 */
export function normalizeWithMap(text) {
  let out = '';
  const map = [];
  let pendingSpace = -1;
  let offset = 0;
  for (const line of text.split('\n')) {
    for (const [from, to] of lineKeep(line)) {
      for (let i = from; i < to; i++) {
        const ch = line[i];
        const pos = offset + i;
        if (/\s/.test(ch)) {
          if (pendingSpace < 0) pendingSpace = pos;
          continue;
        }
        if (pendingSpace >= 0 && out.length) {
          out += ' ';
          map.push(pendingSpace);
        }
        pendingSpace = -1;
        out += QUOTES[ch] ?? ch;
        map.push(pos);
      }
    }
    if (pendingSpace < 0) pendingSpace = offset + line.length; // le saut de ligne compte comme un espace
    offset += line.length + 1;
  }
  return { text: out, map };
}

const normalize = (text) => normalizeWithMap(text).text.trim();

function occurrences(haystack, needle) {
  const found = [];
  for (let i = haystack.indexOf(needle); i >= 0 && needle; i = haystack.indexOf(needle, i + 1)) found.push(i);
  return found;
}

// Occurrences qui ne coupent pas un mot (« inside_hoopers_hut » ne doit pas viser « inside_hoopers_hut_2 »).
const W = /\w/;
function wholeOccurrences(haystack, needle) {
  return occurrences(haystack, needle).filter((i) => {
    const end = i + needle.length;
    const okStart = i === 0 || !W.test(needle[0]) || !W.test(haystack[i - 1]);
    const okEnd = end === haystack.length || !W.test(needle[needle.length - 1]) || !W.test(haystack[end]);
    return okStart && okEnd;
  });
}

const lineAt = (source, index) => source.slice(0, index).split('\n').length;

/**
 * @param {string} operation  pour une insertion, le repère peut être étendu jusqu'à la fin de sa ligne
 *                            afin d'être unique (la position d'insertion reste la même ligne)
 * @param {string|null} knotHint  champ `knot` de l'edit : départage des occurrences situées dans des knots différents
 * @returns {{ status: 'exact', target: string } |
 *           { status: 'repaired', target: string, pre: string, post: string, reason: string } |
 *           { status: 'ambiguous', occurrences: { line: number, owner: string, anchor: string|null }[] } |
 *           { status: 'empty' | 'missing' }}
 *   Pour 'repaired', `pre` / `post` est le texte ajouté avant / après le passage visé pour rendre le repère
 *   unique : un replace doit l'inclure dans son contenu (cf. validate.js).
 */
export function resolveTarget(source, target, operation = 'replace', knotHint = null) {
  if (!target) return { status: 'empty' };
  const exact = occurrences(source, target);
  if (exact.length === 1) return { status: 'exact', target };

  // Passages visés : correspondances exactes, sinon correspondances après normalisation.
  let spans = exact.map((at) => ({ start: at, end: at + target.length }));
  let repairedCopy = false;
  if (!spans.length) {
    const nt = normalize(target);
    if (nt.length < 4) return { status: 'missing' };
    const { text, map } = normalizeWithMap(source);
    spans = wholeOccurrences(text, nt).map((i) => ({ start: map[i], end: map[i + nt.length - 1] + 1 }));
    repairedCopy = true;
  }
  if (!spans.length) return { status: 'missing' };

  // Plusieurs passages : le knot indiqué par l'IA peut départager.
  if (spans.length > 1 && knotHint) {
    const byOwner = spans.filter((s) => ownerAt(source, s.start) === knotHint);
    const byKnot = spans.filter((s) => ownerAt(source, s.start).split('.')[0] === knotHint.split('.')[0]);
    if (byOwner.length === 1) spans = byOwner;
    else if (byKnot.length === 1) spans = byKnot;
  }

  const direction = operation === 'insert_before' ? 'forward' : 'backward';
  if (spans.length > 1) {
    return {
      status: 'ambiguous',
      occurrences: spans.map((s) => {
        const ext = uniqueExtension(source, s, direction);
        return { line: lineAt(source, s.start), owner: ownerAt(source, s.start), anchor: ext && source.slice(ext.start, ext.end) };
      }),
    };
  }

  // Un seul passage : repère exact, étendu par lignes entières si nécessaire pour être unique.
  const span = spans[0];
  const ext = uniqueExtension(source, span, direction);
  if (!ext) return { status: 'ambiguous', occurrences: [{ line: lineAt(source, span.start), owner: ownerAt(source, span.start), anchor: null }] };
  const real = source.slice(ext.start, ext.end);
  if (real === target) return { status: 'exact', target };
  return {
    status: 'repaired',
    target: real,
    pre: source.slice(ext.start, span.start),
    post: source.slice(span.end, ext.end),
    reason: repairedCopy ? 'copie approximative' : 'repère ambigu départagé par le knot',
  };
}

const HEADER_LINE = /^\s*(={1,})\s*(?:function\s+)?([A-Za-z_]\w*)/;

/** Knot (ou « knot.stitch ») contenant la position donnée. */
export function ownerAt(source, index) {
  const lines = source.slice(0, index).split('\n');
  let stitch = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = HEADER_LINE.exec(lines[i]);
    if (!m) continue;
    if (m[1].length === 1) { stitch ??= m[2]; continue; }
    return stitch ? `${m[2]}.${stitch}` : m[2];
  }
  return '';
}

/**
 * Étend un passage par lignes entières (vers le haut, ou vers le bas pour insert_before)
 * jusqu'à obtenir un extrait unique dans le fichier. Au plus 6 lignes ajoutées.
 */
function uniqueExtension(source, { start, end }, direction) {
  let s = start;
  let e = end;
  for (let step = 0; step <= 6; step++) {
    if (occurrences(source, source.slice(s, e)).length === 1) return { start: s, end: e };
    if (direction === 'backward') {
      if (s === 0) return null;
      const lineStart = source.lastIndexOf('\n', s - 1) + 1;
      s = lineStart < s ? lineStart : source.lastIndexOf('\n', s - 2) + 1;
    } else {
      if (e >= source.length) return null;
      const lineEnd = source.indexOf('\n', e);
      const nextEnd = source.indexOf('\n', e + 1);
      e = lineEnd < 0 ? source.length : lineEnd > e ? lineEnd : nextEnd < 0 ? source.length : nextEnd;
    }
  }
  return null;
}

/**
 * Lignes réelles du fichier les plus proches d'un extrait introuvable (pour aider l'IA à se corriger) :
 * on cherche les lignes de l'extrait, normalisées, dans le fichier.
 * @returns {{ line: number, text: string }[]}
 */
export function nearestLines(source, target, max = 3) {
  const sourceLines = source.split('\n');
  const normSource = sourceLines.map(normalize);
  const hits = new Map();
  const targetLines = target.split('\n').map(normalize).filter((l) => l.length >= 8);
  for (const tl of targetLines) {
    normSource.forEach((sl, i) => {
      if (sl.length >= 8 && (sl.includes(tl) || tl.includes(sl))) hits.set(i, (hits.get(i) ?? 0) + Math.min(sl.length, tl.length));
    });
  }
  return [...hits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .sort((a, b) => a[0] - b[0])
    .map(([i]) => ({ line: i + 1, text: sourceLines[i] }));
}
