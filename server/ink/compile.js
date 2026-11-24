import { Compiler, CompilerOptions } from 'inkjs/full';

// Types d'erreur remontés par le compilateur inkjs (enum ErrorType).
const SEVERITY = { 0: 'todo', 1: 'warning', 2: 'error' };

// Ex. : "ERROR: line 3: Divert target not found: '-> nowhere'"
const ISSUE_RE = /^(?:RUNTIME )?(?:ERROR|WARNING|TODO):\s*(?:'[^']*'\s+)?(?:line (\d+):\s*)?([\s\S]*)$/;

function parseIssue(raw, type) {
  const match = ISSUE_RE.exec(raw);
  return {
    severity: SEVERITY[type] ?? 'error',
    line: match?.[1] ? Number(match[1]) : null,
    message: (match?.[2] ?? raw).trim(),
  };
}

/**
 * Compile une source ink sans rien exécuter.
 * `json` contient l'histoire compilée (format runtime ink) quand ok = true,
 * pour que le front puisse la jouer avec le runtime inkjs.
 * @returns {{ ok: boolean, errors: Issue[], warnings: Issue[], todos: Issue[], json: string|null }}
 * @typedef {{ severity: 'error'|'warning'|'todo', line: number|null, message: string }} Issue
 */
export function compileInk(source) {
  const issues = [];
  const options = new CompilerOptions(null, [], false, (msg, type) => issues.push(parseIssue(msg, type)));

  let story = null;
  try {
    story = new Compiler(source, options).Compile();
  } catch (err) {
    // Le compilateur lève "Compilation failed." après avoir appelé le handler ;
    // on ne garde le message brut que s'il s'agit d'un crash imprévu.
    if (!issues.some((i) => i.severity === 'error')) {
      issues.push({ severity: 'error', line: null, message: err.message });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const ok = errors.length === 0 && story !== null;
  return {
    ok,
    errors,
    warnings: issues.filter((i) => i.severity === 'warning'),
    todos: issues.filter((i) => i.severity === 'todo'),
    json: ok ? story.ToJson() : null,
  };
}
