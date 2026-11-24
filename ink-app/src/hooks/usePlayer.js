import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Story } from 'inkjs';
import { variableUsage } from '../lib/inkParse.js';

const EMPTY = {
  ready: false,
  entries: [],   // { kind: 'knot' | 'p' | 'you' | 'err' | 'end', text }
  choices: [],   // { index, text }
  trail: [],     // { name, step }
  tags: [],
  knot: null,
  visited: [],   // knots / stitches parcourus pendant le pas courant
  step: 0,       // nombre de choix effectués
  steps: [],     // valeurs des variables après chaque pas
  log: [],       // { step, name, value, where }
  ended: false,
  history: [],
};

export const formatValue = (v) => (typeof v === 'string' ? `"${v}"` : v == null ? '—' : String(v));
const endLabel = (knot) => {
  const name = (knot || '').replace(/^fin_?/i, '').replace(/_/g, ' ').trim().toUpperCase();
  return name ? `FIN · ${name}` : 'FIN';
};

/**
 * Lecture de test d'une histoire compilée (JSON runtime ink) avec le runtime inkjs.
 * L'histoire redémarre quand le JSON compilé change.
 *
 * Journal des écritures : les observateurs inkjs sont notifiés en différé (le runtime lit
 * en avance), on compare donc les valeurs après chaque ligne, puis on rattache chaque
 * changement aux lignes du source qui écrivent la variable dans les knots parcourus.
 */
export function usePlayer(json, parsed) {
  const storyRef = useRef(null);
  const [run, setRun] = useState({ ...EMPTY, runNo: 0 });

  const knotNames = useMemo(() => new Set((parsed?.knots ?? []).map((k) => k.name)), [parsed]);
  const varNames = useMemo(() => (parsed?.vars ?? []).filter((v) => v.kind !== 'CONST').map((v) => v.name), [parsed]);
  const usage = useMemo(() => (parsed ? variableUsage(parsed) : {}), [parsed]);

  const snapshot = useCallback((story) => {
    const vals = {};
    for (const name of varNames) {
      try { vals[name] = story.variablesState.$(name); } catch { vals[name] = undefined; }
    }
    return vals;
  }, [varNames]);

  const containerOf = useCallback((path) => {
    const [k, s] = path.split('.');
    if (!knotNames.has(k)) return null;
    return s && parsed.containers.has(`${k}.${s}`) ? `${k}.${s}` : k;
  }, [knotNames, parsed]);

  // Rattache les écritures du pas aux lignes du source qui les produisent.
  const locateWrites = useCallback((log, step, visited) => {
    const rank = (owner) => {
      const i = visited.indexOf(owner);
      return i >= 0 ? i : visited.indexOf(owner.split('.')[0]);
    };
    const byVar = new Map();
    for (const entry of log) if (entry.step === step && !entry.where) byVar.set(entry.name, [...(byVar.get(entry.name) ?? []), entry]);
    for (const [name, entries] of byVar) {
      const candidates = (usage[name]?.writeLines ?? [])
        .filter((w) => rank(w.owner) >= 0)
        .sort((a, b) => rank(a.owner) - rank(b.owner) || a.line - b.line)
        .map((w) => `${w.owner || 'début'} · L.${w.line}`);
      entries.forEach((entry, i) => {
        entry.where = candidates.length === entries.length ? candidates[i] : candidates.join(' ou ') || null;
      });
    }
  }, [usage]);

  // Fait avancer l'histoire jusqu'au prochain choix (ou la fin).
  const advance = useCallback((story, base) => {
    const next = {
      ...base,
      entries: [...base.entries], trail: [...base.trail], tags: [...base.tags],
      log: base.log.map((l) => ({ ...l })), steps: [...base.steps], visited: [...base.visited],
    };
    const errors = [];
    story.onError = (message) => errors.push(message);
    let before = snapshot(story);
    try {
      while (story.canContinue) {
        const text = story.Continue();
        const path = story.state.previousPointer?.path?.toString() ?? '';
        const container = containerOf(path);
        if (container && !next.visited.includes(container)) next.visited.push(container);
        const knot = container?.split('.')[0];
        if (knot && knot !== next.knot) {
          next.knot = knot;
          next.entries.push({ kind: 'knot', text: knot });
          next.trail.push({ name: knot, step: next.step });
        }
        const after = snapshot(story);
        for (const name of varNames) {
          if (after[name] !== before[name]) next.log.push({ step: next.step, name, value: after[name], where: null });
        }
        before = after;
        if (text.trim()) next.entries.push({ kind: 'p', text: text.trim() });
        if (story.currentTags?.length) next.tags.push(...story.currentTags.filter((t) => !next.tags.includes(t)));
        if (errors.length) break;
      }
    } catch (err) {
      errors.push(err.message);
    }
    locateWrites(next.log, next.step, next.visited);
    if (errors.length) {
      next.entries.push({ kind: 'err', text: errors.join(' · ') });
      next.choices = [];
      next.ended = true;
    } else {
      next.choices = story.currentChoices.map((c) => ({ index: c.index, text: c.text }));
      next.ended = next.choices.length === 0;
      if (next.ended) next.entries.push({ kind: 'end', text: endLabel(next.knot) });
    }
    next.steps[next.step] = before;
    return next;
  }, [snapshot, containerOf, varNames, locateWrites]);

  const start = useCallback((runNo) => {
    if (!json) {
      storyRef.current = null;
      setRun({ ...EMPTY, runNo });
      return;
    }
    let story;
    try {
      story = new Story(json);
    } catch (err) {
      storyRef.current = null;
      setRun({ ...EMPTY, runNo, ready: true, ended: true, entries: [{ kind: 'err', text: err.message }] });
      return;
    }
    storyRef.current = story;
    setRun(advance(story, { ...EMPTY, ready: true, runNo }));
  }, [json, advance]);

  // Synchronisation avec le runtime ink (système externe) quand l'histoire compilée change.
  useEffect(() => {
    start(1); // eslint-disable-line react-hooks/set-state-in-effect
  }, [start]);

  // Le runtime ink est mutable : on lit l'état courant via une ref plutôt que
  // dans un updater de setState (que StrictMode exécute deux fois).
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const choose = useCallback((index) => {
    const story = storyRef.current;
    const cur = runRef.current;
    const choice = cur.choices.find((c) => c.index === index);
    if (!story || !choice) return;
    const saved = story.state.toJson();
    const { history, ...rest } = cur;
    story.ChooseChoiceIndex(index);
    const base = {
      ...cur,
      step: cur.step + 1,
      visited: cur.visited.slice(-1), // le texte du choix appartient au conteneur courant
      entries: [...cur.entries, { kind: 'you', text: choice.text }],
      history: [...history, { saved, run: rest }],
    };
    const next = advance(story, base);
    runRef.current = next;
    setRun(next);
  }, [advance]);

  const undo = useCallback(() => {
    const story = storyRef.current;
    const cur = runRef.current;
    const last = cur.history[cur.history.length - 1];
    if (!story || !last) return;
    story.state.LoadJson(last.saved);
    const prev = { ...last.run, history: cur.history.slice(0, -1) };
    runRef.current = prev;
    setRun(prev);
  }, []);

  const restart = useCallback(() => start(run.runNo + 1), [start, run.runNo]);

  return { ...run, canUndo: run.history.length > 0, choose, undo, restart };
}
