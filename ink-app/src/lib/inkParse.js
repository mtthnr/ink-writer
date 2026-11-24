/**
 * Analyse statique légère d'une source ink (sans compiler) :
 * knots/stitches, diverts, choix, variables, et graphe narratif.
 * Elle fonctionne même si le fichier ne compile pas, ce qui permet
 * d'afficher la carte et les divert cassés.
 */

const KNOT_RE = /^\s*={2,}\s*(function\s+)?([A-Za-z_]\w*)/;
const STITCH_RE = /^\s*=(?!=)\s*([A-Za-z_]\w*)/;
const DECL_RE = /^\s*(VAR|CONST)\s+([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/;
const LIST_RE = /^\s*LIST\s+([A-Za-z_]\w*)\s*=\s*(.*?)\s*$/;
const CHOICE_RE = /^\s*((?:[*+]\s*)+)(.*)$/;
const GATHER_RE = /^\s*((?:-\s*)+)(?!>)(.*)$/;
const LABEL_RE = /^\s*(?:[*+-]\s*)+\(([A-Za-z_]\w*)\)/;
const DIVERT_RE = /(?:->|<-)\s*([A-Za-z_][\w.]*)/g;

const SPECIAL_TARGETS = new Set(['END', 'DONE']);

function stripComment(line, state) {
  let out = '';
  let i = 0;
  while (i < line.length) {
    if (state.block) {
      const end = line.indexOf('*/', i);
      if (end < 0) return out;
      state.block = false;
      i = end + 2;
    } else {
      const lineC = line.indexOf('//', i);
      const blockC = line.indexOf('/*', i);
      if (lineC >= 0 && (blockC < 0 || lineC < blockC)) return out + line.slice(i, lineC);
      if (blockC >= 0) {
        out += line.slice(i, blockC);
        state.block = true;
        i = blockC + 2;
      } else {
        return out + line.slice(i);
      }
    }
  }
  return out;
}

function valueType(raw) {
  if (/^(true|false)$/.test(raw)) return 'BOOL';
  if (/^-?\d+$/.test(raw)) return 'INT';
  if (/^-?\d*\.\d+$/.test(raw)) return 'FLOAT';
  if (/^".*"$/.test(raw)) return 'CHAÎNE';
  if (/^->/.test(raw)) return 'DIVERT';
  return 'EXPR';
}

function choiceLabel(rest) {
  return rest
    .replace(/^\s*\([^)]*\)/, '')
    .replace(/^(\s*\{[^}]*\})+/, '')
    .replace(/(?:->|<-)\s*[\w.]*/g, '')
    .replace(/#[^#]*/g, '')
    .replace(/[[\]]/g, '')
    .trim();
}

function conditionBefore(code, index) {
  const open = code.lastIndexOf('{', index);
  if (open < 0 || code.lastIndexOf('}', index) > open) return null;
  const inner = code.slice(open + 1, index);
  const colon = inner.indexOf(':');
  return colon >= 0 ? inner.slice(0, colon).trim() : null;
}

/** @returns {ParsedInk} */
export function parseInk(source) {
  const lines = source.replace(/\r/g, '').split('\n');
  const knots = [];            // { name, line, endLine, isFunction, ownContent, stitches: [...] }
  const containers = new Map(); // id -> { id, knot, stitch, line, endLine }
  const labels = new Map();     // `${knot}::${label}` -> container id
  const vars = [];              // { name, kind, init, type, line }
  const diverts = [];           // { from, raw, line, choice, condition }
  const lineOwner = new Array(lines.length).fill('');
  const comment = { block: false };

  let knot = null;
  let stitch = null;
  let lastChoice = null;
  const current = () => (stitch ? `${knot.name}.${stitch.name}` : knot ? knot.name : '');

  lines.forEach((rawLine, i) => {
    const n = i + 1;
    const code = stripComment(rawLine, comment);
    const trimmed = code.trim();

    const km = KNOT_RE.exec(code);
    if (km) {
      if (stitch) stitch.endLine = n - 1;
      if (knot) knot.endLine = n - 1;
      knot = { name: km[2], line: n, endLine: lines.length, isFunction: Boolean(km[1]), ownContent: false, stitches: [] };
      stitch = null;
      lastChoice = null;
      knots.push(knot);
      containers.set(knot.name, { id: knot.name, knot: knot.name, stitch: null, line: n, isFunction: knot.isFunction });
      lineOwner[i] = knot.name;
      return;
    }
    const sm = !km && STITCH_RE.exec(code);
    if (sm && knot) {
      if (stitch) stitch.endLine = n - 1;
      stitch = { name: sm[1], line: n, endLine: lines.length };
      lastChoice = null;
      knot.stitches.push(stitch);
      const id = `${knot.name}.${stitch.name}`;
      containers.set(id, { id, knot: knot.name, stitch: stitch.name, line: n });
      lineOwner[i] = id;
      return;
    }

    lineOwner[i] = current();
    if (!trimmed) return;

    const dm = DECL_RE.exec(code);
    if (dm) {
      vars.push({ name: dm[2], kind: dm[1], init: dm[3], type: dm[1] === 'CONST' ? 'CONST' : valueType(dm[3]), line: n });
      return;
    }
    const lm = LIST_RE.exec(code);
    if (lm) {
      vars.push({ name: lm[1], kind: 'LIST', init: lm[2], type: 'LISTE', line: n });
      return;
    }
    if (/^\s*INCLUDE\b/.test(code)) return;

    if (knot && !stitch) knot.ownContent = true;

    const lab = LABEL_RE.exec(code);
    if (lab && knot) labels.set(`${knot.name}::${lab[1]}`, current());

    const cm = CHOICE_RE.exec(code);
    let isChoiceLine = false;
    if (cm) {
      isChoiceLine = true;
      const cond = /^\s*(?:\([^)]*\)\s*)?\{([^}]*)\}/.exec(cm[2]);
      lastChoice = { text: choiceLabel(cm[2]) || '(choix)', condition: cond ? cond[1].trim() : null };
    } else if (GATHER_RE.test(code)) {
      lastChoice = null;
    }

    DIVERT_RE.lastIndex = 0;
    let m;
    while ((m = DIVERT_RE.exec(code))) {
      const inlineCond = conditionBefore(code, m.index);
      diverts.push({
        from: current(),
        raw: m[1],
        line: n,
        choice: lastChoice ? lastChoice.text : null,
        condition: (isChoiceLine && lastChoice?.condition) || inlineCond || (lastChoice?.condition ?? null),
      });
    }
  });

  // Résolution des cibles de divert.
  const resolve = (raw, from) => {
    if (SPECIAL_TARGETS.has(raw)) return { end: true };
    const fromKnot = from.split('.')[0];
    const parts = raw.split('.');
    if (parts.length >= 2) {
      const id = `${parts[0]}.${parts[1]}`;
      if (containers.has(id)) return { id };
      if (containers.has(parts[0]) && labels.has(`${parts[0]}::${parts[1]}`)) return { id: labels.get(`${parts[0]}::${parts[1]}`) };
      return { broken: true };
    }
    if (fromKnot && containers.has(`${fromKnot}.${raw}`)) return { id: `${fromKnot}.${raw}` };
    if (containers.has(raw)) return { id: raw };
    if (fromKnot && labels.has(`${fromKnot}::${raw}`)) return { id: labels.get(`${fromKnot}::${raw}`) };
    return { broken: true };
  };
  for (const d of diverts) Object.assign(d, resolve(d.raw, d.from));

  // Un knot sans contenu propre entre directement dans son premier stitch.
  for (const k of knots) {
    if (!k.ownContent && k.stitches.length) {
      diverts.push({ from: k.name, raw: k.stitches[0].name, id: `${k.name}.${k.stitches[0].name}`, line: k.line, choice: null, condition: null, implicit: true });
    }
  }

  const top = diverts.find((d) => d.from === '' && d.id);
  const firstKnot = knots.find((k) => !k.isFunction);
  const start = top ? top.id : firstKnot ? firstKnot.name : null;

  return { lines, knots, containers, vars, diverts, lineOwner, start };
}

/** Knot / stitch qui contient la ligne n (1-based). */
export function ownerOfLine(parsed, n) {
  return parsed.lineOwner[n - 1] ?? '';
}

/** Statistiques d'usage des variables : lectures / écritures, lignes concernées. */
export function variableUsage(parsed) {
  const usage = {};
  for (const v of parsed.vars) {
    const word = new RegExp(`\\b${v.name}\\b`, 'g');
    const write = new RegExp(`^\\s*~\\s*(?:temp\\s+)?${v.name}\\s*(?:=(?!=)|\\+=|-=|\\+\\+|--)`);
    let reads = 0;
    const writeLines = [];
    parsed.lines.forEach((line, i) => {
      if (i + 1 === v.line) return;
      const code = line.replace(/\/\/.*$/, '');
      const count = (code.match(word) || []).length;
      if (!count) return;
      if (write.test(code)) {
        writeLines.push({ line: i + 1, owner: parsed.lineOwner[i] });
        reads += count - 1;
      } else {
        reads += count;
      }
    });
    usage[v.name] = { reads, writes: writeLines.length, writeLines, lastWrite: writeLines[writeLines.length - 1] ?? null };
  }
  return usage;
}

/** Variables lues dans un knot (ou un stitch). */
export function variablesReadIn(parsed, containerId) {
  const names = parsed.vars.map((v) => v.name);
  const found = new Set();
  parsed.lines.forEach((line, i) => {
    const owner = parsed.lineOwner[i];
    if (owner !== containerId && !owner.startsWith(`${containerId}.`)) return;
    const code = line.replace(/\/\/.*$/, '');
    const blocks = [...code.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]);
    const assign = /^\s*~\s*\w+\s*(?:=|\+=|-=)(.*)$/.exec(code);
    if (assign) blocks.push(assign[1]);
    for (const b of blocks) for (const name of names) if (new RegExp(`\\b${name}\\b`).test(b)) found.add(name);
  });
  return [...found];
}

/**
 * Graphe narratif.
 * @param {{ stitches?: boolean }} opts  false : un nœud par knot ; true : un nœud par knot et par stitch
 */
export function buildGraph(parsed, { stitches = false } = {}) {
  const nodeOf = (id) => (stitches ? id : id.split('.')[0]);
  const nodes = new Map();
  const knotIndex = new Map();
  parsed.knots.filter((k) => !k.isFunction).forEach((k, i) => knotIndex.set(k.name, i + 1));

  for (const k of parsed.knots) {
    if (k.isFunction) continue;
    nodes.set(k.name, { id: k.name, kind: 'knot', knot: k.name, line: k.line, num: knotIndex.get(k.name), stitchCount: k.stitches.length, hasEnd: false });
    if (stitches) {
      for (const s of k.stitches) {
        const id = `${k.name}.${s.name}`;
        nodes.set(id, { id, kind: 'stitch', knot: k.name, line: s.line, num: knotIndex.get(k.name), stitchCount: 0, hasEnd: false });
      }
    }
  }

  const edges = [];
  const seen = new Set();
  for (const d of parsed.diverts) {
    if (!d.from) continue;
    const from = nodeOf(d.from);
    if (!nodes.has(from)) continue;
    if (d.end) { nodes.get(from).hasEnd = true; continue; }
    let to;
    if (d.broken) {
      to = `?${d.raw}`;
      if (!nodes.has(to)) nodes.set(to, { id: to, kind: 'broken', knot: d.raw, line: d.line, raw: d.raw });
    } else {
      to = nodeOf(d.id);
      if (!nodes.has(to)) continue;
    }
    if (from === to) continue;
    const key = `${from}>${to}>${d.choice ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to, choice: d.choice, condition: d.condition, line: d.line, broken: Boolean(d.broken), implicit: Boolean(d.implicit) });
  }

  const start = parsed.start ? nodeOf(parsed.start) : null;
  const outs = new Map([...nodes.keys()].map((id) => [id, []]));
  const ins = new Map([...nodes.keys()].map((id) => [id, []]));
  for (const e of edges) { outs.get(e.from).push(e); ins.get(e.to).push(e); }

  // Atteignabilité depuis le départ.
  const reachable = new Set();
  const order = [];
  if (start && nodes.has(start)) {
    const queue = [start];
    reachable.add(start);
    while (queue.length) {
      const id = queue.shift();
      order.push(id);
      for (const e of outs.get(id)) if (!reachable.has(e.to)) { reachable.add(e.to); queue.push(e.to); }
    }
  }

  // Arcs retour (boucles) par DFS, depuis le départ puis depuis les nœuds non atteints.
  const state = new Map();
  const dfs = (id) => {
    state.set(id, 1);
    for (const e of outs.get(id)) {
      const s = state.get(e.to);
      if (s === 1) e.loop = true;
      else if (!s) dfs(e.to);
    }
    state.set(id, 2);
  };
  if (start && nodes.has(start)) dfs(start);
  for (const id of nodes.keys()) if (!state.get(id)) dfs(id);

  // Profondeur = plus long chemin (arcs retour exclus).
  const forward = edges.filter((e) => !e.loop);
  const indeg = new Map([...nodes.keys()].map((id) => [id, 0]));
  for (const e of forward) indeg.set(e.to, indeg.get(e.to) + 1);
  const depth = new Map();
  const choices = new Map();
  const queue = [...nodes.keys()].filter((id) => indeg.get(id) === 0);
  queue.forEach((id) => { depth.set(id, 0); choices.set(id, 0); });
  while (queue.length) {
    const id = queue.shift();
    for (const e of forward.filter((f) => f.from === id)) {
      depth.set(e.to, Math.max(depth.get(e.to) ?? 0, depth.get(id) + 1));
      choices.set(e.to, Math.max(choices.get(e.to) ?? 0, choices.get(id) + (e.choice ? 1 : 0)));
      indeg.set(e.to, indeg.get(e.to) - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }

  for (const n of nodes.values()) {
    n.depth = depth.get(n.id) ?? 0;
    n.start = n.id === start;
    n.orphan = n.kind !== 'broken' && !reachable.has(n.id);
    n.ending = n.kind !== 'broken' && n.hasEnd && !outs.get(n.id).some((e) => !e.broken);
    n.ins = ins.get(n.id).map((e) => e.from);
    n.outs = outs.get(n.id).map((e) => e.to);
  }

  // Placement en colonnes (profondeur) et rangées (ordre de découverte).
  const rank = (n) => (n.kind === 'broken' ? 2 : n.orphan ? 1 : 0);
  const sorted = [...nodes.values()].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.line - b.line;
  });
  const rows = new Map();
  for (const n of sorted) {
    n.col = n.depth;
    n.row = rows.get(n.col) ?? 0;
    rows.set(n.col, n.row + 1);
  }

  const real = [...nodes.values()].filter((n) => n.kind !== 'broken');
  const stats = {
    knots: parsed.knots.filter((k) => !k.isFunction).length,
    stitches: parsed.knots.reduce((s, k) => s + k.stitches.length, 0),
    diverts: parsed.diverts.filter((d) => !d.implicit && d.from).length,
    endings: real.filter((n) => n.ending).length,
    longest: Math.max(0, ...choices.values()),
  };

  const loops = new Map();
  for (const e of edges) if (e.loop && !loops.has(`${e.from}>${e.to}`)) loops.set(`${e.from}>${e.to}`, e);
  const anomalies = [
    ...edges.filter((e) => e.broken).map((e) => ({ kind: 'broken', node: e.to, from: e.from, raw: nodes.get(e.to).raw, line: e.line })),
    ...real.filter((n) => n.orphan).map((n) => ({ kind: 'orphan', node: n.id, line: n.line })),
    ...[...loops.values()].map((e) => ({ kind: 'loop', node: e.from, to: e.to, condition: e.condition, line: e.line })),
  ];

  return { nodes: [...nodes.values()], edges, start, stats, anomalies };
}

/* ---------------------------------------------------------------------------
   Coloration syntaxique (par ligne). Renvoie des jetons { t, k, b?, i? }.
   k ∈ knot | divert | choice | logic | var | comment | tag | text
   --------------------------------------------------------------------------- */
export function tokenizeLine(line) {
  const out = [];
  const lead = line.match(/^\s*/)[0];
  if (lead) out.push({ t: lead, k: 'text' });
  let s = line.slice(lead.length);
  if (!s) return out;

  // Commentaire de fin de ligne : traité à part.
  let tail = null;
  const cIdx = s.indexOf('//');
  if (cIdx >= 0) { tail = s.slice(cIdx); s = s.slice(0, cIdx); }
  const finish = () => (tail ? out.concat([{ t: tail, k: 'comment', i: 1 }]) : out);

  if (/^={2,}/.test(s) || /^=\s*\w/.test(s)) { out.push({ t: s, k: 'knot', b: /^={2,}/.test(s) ? 1 : 0 }); return finish(); }
  const v = s.match(/^(VAR|CONST|LIST)(\s+)(\w+)(.*)$/);
  if (v) { out.push({ t: v[1], k: 'logic', b: 1 }, { t: v[2], k: 'text' }, { t: v[3], k: 'var' }, { t: v[4], k: 'text' }); return finish(); }
  if (/^INCLUDE\b/.test(s)) { out.push({ t: s, k: 'logic', b: 1 }); return finish(); }
  if (/^~/.test(s)) { out.push({ t: s, k: 'var' }); return finish(); }

  const cm = s.match(/^(?:[*+]\s*)+|^(?:-(?!>)\s*)+/);
  if (cm) { out.push({ t: cm[0], k: 'choice', b: 1 }); s = s.slice(cm[0].length); }
  const re = /((?:->|<-)\s*[\w.]*(?:\s*->)?|\{[^}]*\}|\[[^\]]*\]|#[^#{}\n]*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: s.slice(last, m.index), k: 'text' });
    const x = m[0];
    const k = x.startsWith('->') || x.startsWith('<-') ? 'divert' : x.startsWith('{') ? 'logic' : x.startsWith('[') ? 'choice' : 'tag';
    out.push({ t: x, k });
    last = m.index + x.length;
  }
  if (last < s.length) out.push({ t: s.slice(last), k: 'text' });
  return finish();
}

/**
 * @typedef {Object} ParsedInk
 * @property {string[]} lines
 * @property {Array} knots
 * @property {Map} containers
 * @property {Array} vars
 * @property {Array} diverts
 * @property {string[]} lineOwner
 * @property {string|null} start
 */
