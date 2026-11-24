// Client du serveur Node (server/). En dev, Vite relaie /api vers http://localhost:3001.
// Toutes les réponses suivent l'enveloppe { ok, stage, ... } définie côté serveur.

async function post(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, stage: 'network', error: 'Serveur injoignable. Lancez-le avec « npm run dev » dans server/.' };
  }
  try {
    return await res.json();
  } catch {
    return { ok: false, stage: 'network', error: `Serveur injoignable ou réponse illisible (HTTP ${res.status}).` };
  }
}

/** Compilation seule, sans IA. → { ok, stage: 'compile', compile: { ok, errors, warnings, todos, json } } */
export const compileSource = (source) => post('/api/compile', { source });

/** Tâche IA. → { ok, stage: 'ai', result } ou { ok: false, stage: 'compile' | 'request' | 'ai', ... } */
export const runInkTask = (payload) => post('/api/ink', payload);
