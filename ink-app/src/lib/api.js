// Client du serveur Node (server/). En dev, Vite relaie /api vers http://localhost:3001.
// Toutes les réponses suivent l'enveloppe { ok, stage, ... } définie côté serveur.
// Cette fonction ne lève jamais d'exception : erreur réseau, délai dépassé ou réponse
// illisible donnent { ok: false, stage: 'network', error }.

const COMPILE_TIMEOUT_MS = 30_000;
// Une tâche IA peut enchaîner deux appels OpenAI côté serveur (90 s max chacun) + la vérification.
const AI_TIMEOUT_MS = 200_000;

async function post(path, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { ok: false, stage: 'network', error: `Le serveur n’a pas répondu en ${Math.round(timeoutMs / 1000)} s, opération abandonnée.` };
    }
    return { ok: false, stage: 'network', error: 'Serveur injoignable. Lancez-le avec « npm run dev » dans server/.' };
  }
  try {
    return await res.json();
  } catch {
    return { ok: false, stage: 'network', error: `Serveur injoignable ou réponse illisible (HTTP ${res.status}).` };
  } finally {
    clearTimeout(timer);
  }
}

/** Compilation seule, sans IA. → { ok, stage: 'compile', compile: { ok, errors, warnings, todos, json } } */
export const compileSource = (source) => post('/api/compile', { source }, COMPILE_TIMEOUT_MS);

/** Tâche IA. → { ok, stage: 'ai', result, validation } ou { ok: false, stage: 'compile' | 'request' | 'ai' | 'network', ... } */
export const runInkTask = (payload) => post('/api/ink', payload, AI_TIMEOUT_MS);
