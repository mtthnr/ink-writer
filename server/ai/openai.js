import { RESPONSE_FORMAT } from './schema.js';
import { TASKS, buildCorrectionMessage, buildMessages } from './prompts.js';
import { validateItems } from './validate.js';

const API_URL = 'https://api.openai.com/v1/chat/completions';
const CALL_TIMEOUT_MS = 90_000; // au-delà, l'appel est abandonné (le front attend au plus 200 s)

function fail(message, status = 502) {
  return Object.assign(new Error(message), { status });
}

/** Un appel au modèle avec le format de réponse imposé. Renvoie le JSON parsé. */
async function callModel(messages, { apiKey, model }) {
  let response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, response_format: RESPONSE_FORMAT }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw fail(`OpenAI n’a pas répondu en ${CALL_TIMEOUT_MS / 1000} s, opération abandonnée.`, 504);
    }
    throw fail(`OpenAI injoignable : ${err.message}`, 502);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw fail(data.error?.message || `Erreur OpenAI (${response.status})`);

  const choice = data.choices?.[0];
  if (choice?.message?.refusal) throw fail(`Requête refusée par le modèle : ${choice.message.refusal}`);
  if (choice?.finish_reason === 'length') throw fail('Réponse tronquée (fichier trop long ou réponse trop longue)');

  try {
    return JSON.parse(choice?.message?.content ?? '');
  } catch {
    throw fail('Réponse OpenAI illisible (JSON invalide)');
  }
}

/**
 * Appelle OpenAI avec le format de prompt et le format de réponse imposés, puis vérifie
 * que chaque edit s'applique et laisse le fichier compilable. Si ce n'est pas le cas,
 * l'IA reçoit la liste des problèmes et corrige sa réponse (au plus `maxRetries` fois).
 * Un repère approximatif mais sans ambiguïté est réparé sans nouvel appel (cf. anchor.js).
 * Les items encore invalides après correction perdent leurs edits (suggestion, incohérence)
 * ou sont retirés (modification).
 *
 * @param {object} request requête déjà validée (voir validateRequest)
 * @param {{ apiKey: string, model: string, maxRetries?: number }} config
 * @returns {Promise<{ result: import('./schema.js').AiResult, validation: Validation }>}
 *
 * @typedef {Object} Validation
 * @property {number} attempts                nombre d'appels au modèle effectués
 * @property {{ attempt: number, invalid: { id: string, title: string, problems: string[] }[], repaired: object[] }[]} rounds
 * @property {{ id: string, title: string, problems: string[], action: 'edits retirés' | 'item retiré' }[]} discarded
 * @property {{ id: string, title: string, repairs: { edit: number, from: string, to: string }[] }[]} repaired
 *           repères approximatifs remplacés par le texte exact du fichier (réponse finale)
 */
export async function runTask(request, { apiKey, model, maxRetries = 1 }) {
  const messages = buildMessages(request);
  const validation = { attempts: 0, rounds: [], discarded: [], repaired: [] };

  let result;
  let invalid = [];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      messages.push({ role: 'assistant', content: JSON.stringify(result) });
      messages.push({ role: 'user', content: buildCorrectionMessage(invalid) });
    }
    const raw = enforceTaskRules(request.task, await callModel(messages, { apiKey, model }));
    validation.attempts += 1;
    const checked = validateItems(request.source, raw);
    result = checked.result;
    invalid = checked.invalid;
    validation.repaired = checked.repaired;
    validation.rounds.push({ attempt: attempt + 1, invalid, repaired: checked.repaired });
    if (!invalid.length) break;
  }

  if (invalid.length) {
    const byId = new Map(invalid.map((i) => [i.id, i]));
    const items = [];
    for (const item of result.items) {
      const bad = byId.get(item.id);
      if (!bad) items.push(item);
      else if (item.type === 'modification') validation.discarded.push({ ...bad, action: 'item retiré' });
      else {
        items.push({ ...item, edits: [] });
        validation.discarded.push({ ...bad, action: 'edits retirés' });
      }
    }
    result = { ...result, items };
    console.warn(`[${request.task}] ${invalid.length} item(s) aux edits inapplicables après ${validation.attempts} appel(s)`);
  }

  return { result, validation };
}

/** Garantit que la réponse respecte les règles de la tâche, même si le modèle s'en écarte. */
function enforceTaskRules(task, result) {
  const def = TASKS[task];
  const items = result.items.filter((item) => def.items.includes(item.type));
  if (items.length !== result.items.length) {
    console.warn(`[${task}] ${result.items.length - items.length} item(s) d'un type non autorisé ignoré(s)`);
  }
  return {
    ...result,
    task,
    items,
    graph: def.graph ? result.graph ?? { nodes: [], edges: [] } : null,
  };
}
