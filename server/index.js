import http from 'node:http';
import { compileInk } from './ink/compile.js';
import { validateRequest } from './ai/prompts.js';
import { runTask } from './ai/openai.js';

const PORT = Number(process.env.PORT) || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
// Nombre de demandes de correction envoyées à l'IA quand ses edits sont inapplicables (0 = aucune).
const OPENAI_MAX_RETRIES = Math.max(0, Number(process.env.OPENAI_MAX_RETRIES ?? 1) || 0);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
const MAX_BODY_BYTES = 1_000_000;

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY manquante : renseigne-la dans server/.env');
  process.exit(1);
}

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
  });
  res.end(JSON.stringify(data));
}

function requestError(message, status = 400) {
  return Object.assign(new Error(message), { status, stage: 'request' });
}

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw requestError('Payload trop volumineux', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw requestError('JSON invalide');
  }
}

/**
 * Toutes les réponses suivent la même enveloppe :
 *   { ok: true,  stage: 'compile', compile }                    -> POST /api/compile
 *   { ok: true,  stage: 'ai',      compile, result, validation } -> POST /api/ink (result = AiResult,
 *                                                                  validation = vérification des edits, cf. ai/openai.js)
 *   { ok: false, stage: 'compile', compile }                    -> fichier non compilable, AUCUN appel OpenAI
 *   { ok: false, stage: 'request' | 'ai' | 'server', error }    -> autres erreurs
 */
const routes = {
  'GET /health': async () => [200, { ok: true }],

  // Vérification de compilation seule (ex. à l'import du fichier), sans appel OpenAI.
  'POST /api/compile': async (req) => {
    const { source } = await readJson(req);
    if (typeof source !== 'string') throw requestError('"source" (contenu du fichier .ink) est requis');
    const compile = compileInk(source);
    return [compile.ok ? 200 : 422, { ok: compile.ok, stage: 'compile', compile }];
  },

  // Point d'entrée unique pour les cas d'usage IA.
  'POST /api/ink': async (req) => {
    const body = await readJson(req);
    const invalid = validateRequest(body);
    if (invalid) throw requestError(invalid);

    // 1. Garde-fou : on ne contacte jamais OpenAI avec un fichier qui ne compile pas.
    const { json, ...compile } = compileInk(body.source);
    if (!compile.ok) return [422, { ok: false, stage: 'compile', compile }];

    // 2. Appel OpenAI avec le format de prompt et le schéma de réponse imposés.
    try {
      const { result, validation } = await runTask(body, { apiKey: OPENAI_API_KEY, model: OPENAI_MODEL, maxRetries: OPENAI_MAX_RETRIES });
      return [200, { ok: true, stage: 'ai', compile, result, validation }];
    } catch (err) {
      throw Object.assign(err, { stage: 'ai' });
    }
  },
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CORS_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  const handler = routes[`${req.method} ${req.url}`];
  if (!handler) return send(res, 404, { ok: false, stage: 'request', error: 'Route introuvable' });

  try {
    const [status, data] = await handler(req);
    send(res, status, data);
  } catch (err) {
    if (!err.status || err.status >= 500) console.error(err);
    send(res, err.status || 500, { ok: false, stage: err.stage || 'server', error: err.message || 'Erreur serveur' });
  }
});

server.listen(PORT, () => {
  console.log(`Serveur prêt sur http://localhost:${PORT}`);
});
