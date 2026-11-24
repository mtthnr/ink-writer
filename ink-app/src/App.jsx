import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TopBar } from './components/TopBar.jsx';
import { Toasts } from './components/Stamps.jsx';
import { useCompile } from './hooks/useCompile.js';
import { usePlayer } from './hooks/usePlayer.js';
import { useToasts } from './hooks/useToasts.js';
import { runInkTask } from './lib/api.js';
import { applyEdits, describeEdit } from './lib/edits.js';
import { logAiResponse, logApiFailure, logApplyFailure, logApplySuccess, logValidation } from './lib/log.js';
import { buildGraph, parseInk } from './lib/inkParse.js';
import { readPref, saveToRegistry, writePref } from './lib/registry.js';
import { SAMPLE_NAME, SAMPLE_SOURCE } from './lib/sample.js';
import Accueil from './views/Accueil.jsx';
import Editeur from './views/Editeur.jsx';
import Revue from './views/Revue.jsx';
import Carte from './views/Carte.jsx';
import Variables from './views/Variables.jsx';
import Lecteur from './views/Lecteur.jsx';

const BLANK_SOURCE = `-> debut

=== debut ===
Il était une fois…
-> END
`;

const CATEGORY_ORDER = { syntaxe: 0, coherence: 1, coquille: 2, style: 3 };
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Termine une phrase par un point si elle n'a pas déjà de ponctuation finale. */
const sentence = (s) => {
  const t = String(s ?? '').trim();
  return !t || /[.!?…)]$/.test(t) ? t : `${t}.`;
};

function compileFailureMessage(compile) {
  const e = compile?.errors?.[0];
  if (!e) return 'Compilation interrompue.';
  return `Compilation interrompue${e.line ? ` ligne ${e.line}` : ''} : ${sentence(e.message)}`;
}

const failureMessage = (r) => (r.stage === 'compile' ? compileFailureMessage(r.compile) : sentence(r.error || 'Erreur inconnue'));

function registryStamp(compile, analysis) {
  if (compile?.errors?.length) return { label: `${plural(compile.errors.length, 'ERREUR')}`, tone: 'red' };
  const pending = analysis.items.filter((i) => i.status === 'pending').length;
  if (pending) return { label: `${plural(pending, 'ALERTE')}`, tone: 'red' };
  if (analysis.status === 'done') return { label: 'EN CLAIR', tone: 'green' };
  return { label: 'BROUILLON', tone: 'draft' };
}

export default function App() {
  const [theme, setTheme] = useState(() => readPref('theme', 'papier'));
  const [view, setView] = useState('accueil');
  const [doc, setDoc] = useState(null); // { id, name, source, dirty, savedAt }
  const [analysis, setAnalysis] = useState({ status: 'idle', items: [], at: null, error: null });
  const [selectedUid, setSelectedUid] = useState(null);
  const [applyingUid, setApplyingUid] = useState(null); // item dont les corrections sont en cours d'application
  const applyingRef = useRef(null); // verrou synchrone contre les doubles clics
  const [focus, setFocus] = useState(null); // { line, nonce } : saut dans l'éditeur
  const { toasts, notify, dismiss } = useToasts();
  const openInputRef = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writePref('theme', theme);
  }, [theme]);

  const source = doc?.source ?? null;
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  const parsed = useMemo(() => (source != null ? parseInk(source) : null), [source]);
  const graph = useMemo(() => (parsed ? buildGraph(parsed) : null), [parsed]);
  const compile = useCompile(source);
  const compiled = compile.result; // dernier résultat connu (peut dater de quelques frappes)
  const player = usePlayer(compiled?.ok ? compiled.json : null, parsed);

  // Items IA enrichis : position actuelle dans le fichier, knot, extrait avant / après.
  const items = useMemo(() => {
    if (source == null) return [];
    return analysis.items.map((item) => {
      const info = item.edits.length ? describeEdit(source, item.edits[0]) : null;
      const fallbackKnot = item.knot ?? item.knots?.[0] ?? null;
      const container = fallbackKnot && parsed.containers.get(fallbackKnot);
      const line = info?.found ? info.line : container?.line ?? null;
      const owner = info?.found ? parsed.lineOwner[line - 1] : fallbackKnot;
      return { ...item, info, line, owner: owner || '', where: line ? `L.${line} · ${owner || 'début'}` : owner || 'fichier entier' };
    });
  }, [analysis.items, source, parsed]);

  /* ---------- Fichier ---------- */

  const openDoc = useCallback(({ id, name, source: src }) => {
    setDoc({ id, name, source: src, dirty: false, savedAt: null });
    setAnalysis({ status: 'idle', items: [], at: null, error: null });
    setSelectedUid(null);
    setFocus(null);
    setView('editeur');
  }, []);

  const openFile = useCallback(async (file) => {
    if (!file) return;
    if (!/\.(ink|txt)$/i.test(file.name)) {
      notify('err', `${file.name} : seuls les fichiers .ink sont pris en charge.`);
      return;
    }
    openDoc({ id: `fichier:${file.name}`, name: file.name, source: await file.text() });
  }, [openDoc, notify]);

  const newDoc = useCallback(() => openDoc({ id: `nouveau:${Date.now()}`, name: 'sans_titre.ink', source: BLANK_SOURCE }), [openDoc]);
  const openSample = useCallback(() => openDoc({ id: 'exemple', name: SAMPLE_NAME, source: SAMPLE_SOURCE }), [openDoc]);

  const updateSource = useCallback((next) => {
    setDoc((d) => (d && d.source !== next ? { ...d, source: next, dirty: true } : d));
  }, []);

  const exportDoc = useCallback(() => {
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([doc.source], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.name;
    a.click();
    URL.revokeObjectURL(url);
    notify('ok', `${doc.name} exporté.`);
  }, [doc, notify]);

  // Enregistrement local (registre du navigateur), en différé.
  const stamp = registryStamp(compile.fresh ? compiled : null, analysis);
  const stampKey = `${stamp.label}|${stamp.tone}`;
  useEffect(() => {
    if (!doc) return undefined;
    const timer = setTimeout(() => {
      const [label, tone] = stampKey.split('|');
      const saved = saveToRegistry({ id: doc.id, name: doc.name, source: doc.source, knots: parsed?.knots.length ?? 0, stamp: { label, tone } });
      setDoc((d) => (d && d.id === doc.id && d.source === doc.source ? { ...d, dirty: false, savedAt: saved ? Date.now() : d.savedAt } : d));
    }, 800);
    return () => clearTimeout(timer);
  }, [doc?.id, doc?.name, doc?.source, stampKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Navigation ---------- */

  const navigate = useCallback((next) => setView(next), []);
  const jumpTo = useCallback((line) => {
    if (!line) return;
    setFocus({ line, nonce: Date.now() });
    setView('editeur');
  }, []);

  /* ---------- Analyse IA ---------- */

  const analyse = useCallback(async () => {
    if (!doc) return;
    if (!compile.fresh) {
      notify('wait', 'Compilation en cours, réessayez dans un instant.');
      return;
    }
    if (compile.error) {
      notify('err', sentence(compile.error));
      return;
    }
    // Garde-fou : jamais d'appel IA sur un fichier qui ne compile pas.
    if (!compiled.ok) {
      notify('err', `${compileFailureMessage(compiled)} Analyse annulée.`);
      return;
    }
    setAnalysis((a) => ({ ...a, status: 'running', error: null }));
    const waitId = notify('wait', 'Analyse du dossier en cours : suggestions et cohérence…', { ttl: 0 });
    const payload = { source: doc.source, fileName: doc.name };
    const tasks = ['suggest', 'check_consistency'];
    try {
      const responses = await Promise.all(tasks.map((task) => runInkTask({ ...payload, task })));
      const received = [];
      const failures = [];
      responses.forEach((r, i) => {
        if (r.ok && Array.isArray(r.result?.items)) {
          logAiResponse(tasks[i], r.result);
          logValidation(tasks[i], r.validation);
          received.push(...r.result.items.map((it) => ({ ...it, uid: `${r.result.task}-${it.id}`, task: r.result.task, status: 'pending' })));
        } else {
          logApiFailure(tasks[i], { ...payload, task: tasks[i] }, r);
          failures.push(r.ok ? 'Réponse du serveur incomplète.' : failureMessage(r));
        }
      });
      received.sort((a, b) => (CATEGORY_ORDER[a.category] ?? 9) - (CATEGORY_ORDER[b.category] ?? 9) || b.confidence - a.confidence);

      if (failures.length === responses.length) {
        setAnalysis({ status: 'error', items: [], at: null, error: failures[0] });
        notify('err', failures[0]);
        return;
      }
      setAnalysis({ status: 'done', items: received, at: Date.now(), knotsRead: parsed.knots.length, error: failures[0] ?? null });
      setSelectedUid(received[0]?.uid ?? null);
      notify('ok', `${plural(received.length, 'remarque')} ${received.length > 1 ? 'reçues' : 'reçue'}.`);
      if (failures.length) notify('err', `Analyse partielle : ${failures[0]}`);
    } catch (err) {
      // Erreur inattendue (bug, réponse malformée) : on sort toujours de l'état « en cours ».
      console.error('[En Clair] Erreur inattendue pendant l’analyse', err);
      setAnalysis({ status: 'error', items: [], at: null, error: 'Erreur inattendue pendant l’analyse.' });
      notify('err', 'Erreur inattendue pendant l’analyse (détails dans la console).');
    } finally {
      dismiss(waitId);
    }
  }, [doc, compile.fresh, compile.error, compiled, parsed, notify, dismiss]);

  // `applied` garde l'avant / après au moment de l'acceptation (le texte d'origine disparaît ensuite du fichier).
  const setItemStatus = useCallback((uid, status, applied) => {
    setAnalysis((a) => ({ ...a, items: a.items.map((i) => (i.uid === uid ? { ...i, status, ...(applied && { applied }) } : i)) }));
  }, []);

  /**
   * Accepte un item : applique ses edits (ou les fait concrétiser par l'IA s'il n'en a pas).
   * Une seule application à la fois ; l'indicateur de chargement (`applyingUid`) est toujours
   * libéré à la fin, quelle que soit l'issue (succès, erreur, exception, délai dépassé).
   */
  const acceptItem = useCallback(async (uid, customAfter) => {
    const item = items.find((i) => i.uid === uid);
    if (!item || !doc || item.status !== 'pending') return false;
    if (applyingRef.current) {
      notify('wait', 'Une correction est déjà en cours d’application.');
      return false;
    }
    applyingRef.current = uid;
    setApplyingUid(uid);
    let waitId = null;

    try {
      let edits = item.edits;
      let origin = 'item';

      if (customAfter != null && item.info?.found) {
        edits = [{ operation: 'replace', knot: item.knot ?? null, target: item.info.before, content: customAfter }];
        origin = 'modification manuelle';
      } else if (!edits.length) {
        origin = 'apply_suggestion';
        waitId = notify('wait', `Concrétisation de « ${item.title} » par l’analyste…`, { ttl: 0 });
        const payload = {
          task: 'apply_suggestion',
          source: sourceRef.current,
          fileName: doc.name,
          suggestion: { type: 'suggestion', id: item.id, category: item.category, confidence: item.confidence, title: item.title, description: item.description, knot: item.knot ?? item.knots?.[0] ?? null, edits: [] },
        };
        const r = await runInkTask(payload);
        dismiss(waitId);
        waitId = null;
        if (!r.ok || !Array.isArray(r.result?.items)) {
          logApiFailure('apply_suggestion', payload, r);
          notify('err', `${r.ok ? 'Réponse du serveur incomplète.' : failureMessage(r)} Détails dans la console.`);
          return false;
        }
        logAiResponse('apply_suggestion', r.result);
        logValidation('apply_suggestion', r.validation);
        edits = r.result.items.flatMap((m) => m.edits ?? []);
        if (!edits.length) {
          const discarded = r.validation?.discarded?.length;
          console.warn(`[En Clair] apply_suggestion n'a renvoyé aucun edit applicable pour « ${item.title} »`, r.result);
          notify('err', `${discarded ? 'Aucune modification applicable : l’IA n’a pas su corriger ses edits.' : 'Aucune modification proposée.'} Détails dans la console.`, { ttl: 14000 });
          return false;
        }
      }

      const res = applyEdits(sourceRef.current, edits);
      if (!res.ok) {
        const diag = logApplyFailure({ item, edits, failure: res, origin });
        const where = edits.length > 1 ? ` (edit ${res.index + 1}/${edits.length})` : '';
        notify('err', `${(diag?.cause ?? res.error).replace(/[.\s]+$/, '')}${where}. Correction non appliquée, détails dans la console (F12).`, { ttl: 14000 });
        return false;
      }
      logApplySuccess(item, edits, origin);
      let applied = item.info?.found ? item.info : null;
      if (applied && customAfter != null) applied = { ...applied, pre: '', del: applied.before, ins: customAfter, post: '', after: customAfter };
      sourceRef.current = res.source;
      updateSource(res.source);
      setItemStatus(uid, 'accepted', applied);
      notify('ok', `${plural(edits.length, 'correction')} ${edits.length > 1 ? 'appliquées' : 'appliquée'}.`);
      return true;
    } catch (err) {
      console.error(`[En Clair] Erreur inattendue pendant l’application de « ${item.title} »`, err);
      notify('err', 'Erreur inattendue pendant l’application (détails dans la console).');
      return false;
    } finally {
      if (waitId) dismiss(waitId);
      applyingRef.current = null;
      setApplyingUid(null);
    }
  }, [items, doc, notify, dismiss, updateSource, setItemStatus]);

  const rejectItem = useCallback((uid) => setItemStatus(uid, 'rejected'), [setItemStatus]);

  const acceptAllSafe = useCallback(() => {
    if (applyingRef.current) {
      notify('wait', 'Une correction est déjà en cours d’application.');
      return;
    }
    let current = sourceRef.current;
    const accepted = [];
    let failed = 0;
    for (const item of items) {
      if (item.status !== 'pending' || item.confidence < 90 || !item.edits.length) continue;
      const r = applyEdits(current, item.edits);
      if (r.ok) {
        current = r.source;
        accepted.push(item.uid);
        logApplySuccess(item, item.edits, 'tout accepter');
      } else {
        failed += 1;
        logApplyFailure({ item, edits: item.edits, failure: r, origin: 'tout accepter' });
      }
    }
    if (failed) {
      const s = failed > 1 ? 's' : '';
      notify('err', `${failed} correction${s} sûre${s} non appliquée${s}, détails dans la console.`);
    }
    if (!accepted.length) {
      if (!failed) notify('wait', 'Aucune correction sûre en attente.');
      return;
    }
    sourceRef.current = current;
    updateSource(current);
    const infoByUid = new Map(items.map((i) => [i.uid, i.info]));
    setAnalysis((a) => ({
      ...a,
      items: a.items.map((i) => (accepted.includes(i.uid) ? { ...i, status: 'accepted', applied: infoByUid.get(i.uid)?.found ? infoByUid.get(i.uid) : undefined } : i)),
    }));
    notify('ok', `${plural(accepted.length, 'correction')} ${accepted.length > 1 ? 'appliquées' : 'appliquée'}.`);
  }, [items, notify, updateSource]);

  /* ---------- Raccourcis globaux ---------- */

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'o') { e.preventDefault(); openInputRef.current?.click(); }
      if (k === 's' && doc) { e.preventDefault(); exportDoc(); }
      if (k === 'n' && e.altKey) { e.preventDefault(); newDoc(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, exportDoc, newDoc]);

  /* ---------- Rendu ---------- */

  const current = doc ? view : 'accueil';
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const allTreated = items.length > 0 && pendingCount === 0;
  const themeButton = (
    <button type="button" className="ec-btn ec-btn--chrome ec-btn--md" onClick={() => setTheme(theme === 'nuit' ? 'papier' : 'nuit')} aria-label={`Basculer en mode ${theme === 'nuit' ? 'papier' : 'nuit'}`}>
      {theme === 'nuit' ? 'Mode papier' : 'Mode nuit'}
    </button>
  );

  const header = {
    accueil: {
      subtitle: null,
      actions: (
        <span className="ec-label" style={{ color: 'var(--ec-commande-2)', order: -1 }}>
          {new Date().getHours() >= 20 || new Date().getHours() < 6 ? 'Session de nuit' : 'Session de jour'}
        </span>
      ),
    },
    editeur: {
      subtitle: doc?.name,
      actions: (
        <>
          <button type="button" className="ec-btn ec-btn--chrome ec-btn--md" onClick={exportDoc}>Exporter</button>
          <button type="button" className="ec-btn ec-btn--lamp ec-btn--md" onClick={analyse} disabled={analysis.status === 'running'}>
            {analysis.status === 'running' ? 'Analyse en cours…' : 'Analyser le dossier'}
          </button>
        </>
      ),
    },
    revue: {
      subtitle: doc && `${doc.name} · rapport de l’analyste`,
      actions: (
        <>
          <button type="button" className="ec-btn ec-btn--chrome ec-btn--md" onClick={acceptAllSafe} disabled={!pendingCount || Boolean(applyingUid)}>
            Tout accepter (sûres ≥ 90 %)
          </button>
          {allTreated ? (
            <button type="button" className="ec-btn ec-btn--lamp ec-btn--md ec-btn--ready" onClick={exportDoc} title="Toutes les remarques ont été traitées">
              <span aria-hidden="true">✓</span> Exporter le dossier
            </button>
          ) : (
            <button type="button" className="ec-btn ec-btn--chrome ec-btn--md" onClick={exportDoc} title={pendingCount ? `${pendingCount} remarque(s) encore en attente` : undefined}>
              Exporter
            </button>
          )}
        </>
      ),
    },
    carte: { subtitle: doc && `${doc.name} · schéma de câblage`, actions: null },
    variables: { subtitle: doc && `${doc.name} · état au pas ${player.step}`, actions: null },
    lecteur: {
      subtitle: doc && `${doc.name} · transcription n° ${player.runNo}`,
      actions: (
        <>
          <button type="button" className="ec-btn ec-btn--chrome ec-btn--md" onClick={player.undo} disabled={!player.canUndo}>Annuler le dernier choix</button>
          <button type="button" className="ec-btn ec-btn--lamp ec-btn--md" onClick={player.restart} disabled={!player.ready}>Recommencer</button>
        </>
      ),
    },
  }[current];

  const shared = { doc, source, parsed, graph, compile, compiled, items, analysis, player, navigate, jumpTo, notify, applyingUid };

  return (
    <div className={`ec-app${current === 'accueil' ? '' : ' ec-app--fixed'}`}>
      <TopBar view={current} onNavigate={navigate} hasDoc={Boolean(doc)} subtitle={header.subtitle} dirty={current === 'editeur' && doc?.dirty}>
        {themeButton}
        {header.actions}
      </TopBar>

      {current === 'accueil' && (
        <Accueil onOpenFile={openFile} onNew={newDoc} onSample={openSample} onOpenEntry={openDoc} currentDoc={doc} onResume={() => setView('editeur')} />
      )}
      {current === 'editeur' && (
        <Editeur
          {...shared}
          focus={focus}
          onChange={updateSource}
          selectedUid={selectedUid}
          onSelect={setSelectedUid}
          onAccept={acceptItem}
          onReject={rejectItem}
          onAnalyse={analyse}
        />
      )}
      {current === 'revue' && (
        <Revue {...shared} selectedUid={selectedUid} onSelect={setSelectedUid} onAccept={acceptItem} onReject={rejectItem} onAnalyse={analyse} />
      )}
      {current === 'carte' && <Carte {...shared} />}
      {current === 'variables' && <Variables {...shared} />}
      {current === 'lecteur' && <Lecteur {...shared} />}

      <input
        ref={openInputRef}
        type="file"
        accept=".ink,.txt"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          openFile(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
