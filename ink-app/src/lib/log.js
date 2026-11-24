// Journal console de l'application (outils de développement du navigateur, F12).
import { diagnoseTarget } from './edits.js';

const TAG = '[En Clair]';
const RED = 'color:#A3241C;font-weight:bold';
const GREEN = 'color:#2C6A3D;font-weight:bold';
const BLUE = 'color:#244C78;font-weight:bold';

/** Résumé d'un item IA (sans les champs calculés par le front). */
const itemSummary = (item) => ({
  uid: item.uid,
  type: item.type,
  category: item.category,
  confidence: item.confidence,
  title: item.title,
  description: item.description,
  knot: item.knot ?? item.knots ?? null,
  edits: item.edits,
});

/**
 * Échec d'application d'une suggestion : item, edit fautif, raison et diagnostic détaillé.
 * @param {object} p
 * @param {object} p.item       item IA concerné
 * @param {object[]} p.edits    edits tentés (ceux de l'item, ou ceux produits par apply_suggestion)
 * @param {object} p.failure    retour d'applyEdits en échec
 * @param {string} p.origin     d'où viennent les edits : 'item' | 'apply_suggestion' | 'modification manuelle' | 'tout accepter'
 */
export function logApplyFailure({ item, edits, failure, origin }) {
  const diag = failure.edit ? diagnoseTarget(failure.failedOn, failure.edit.target) : null;
  console.group(`%c${TAG} Échec d'application · « ${item.title} »`, RED);
  console.error(`Raison : ${failure.error}`);
  console.log(`Origine des edits : ${origin}`);
  if (failure.edit) {
    console.log(`Edit fautif : n° ${failure.index + 1} sur ${edits.length}${failure.appliedBefore ? ` (les ${failure.appliedBefore} précédents s'appliquaient, rien n'a été écrit)` : ''}`);
    console.log('Edit :', failure.edit);
    console.log('Repère (target) brut :', JSON.stringify(failure.edit.target));
    console.log('Diagnostic :', diag);
    if (diag?.texteReel) console.log('Texte réel dans le fichier :\n' + diag.texteReel);
  }
  console.log('Tous les edits tentés :', edits);
  console.log('Item IA :', itemSummary(item));
  console.groupEnd();
  return diag;
}

/** Échec d'un appel au serveur (compilation, requête, OpenAI, réseau). */
export function logApiFailure(context, payload, response) {
  console.group(`%c${TAG} Échec de l'appel « ${context} » (étape : ${response.stage ?? 'inconnue'})`, RED);
  console.error(response.error ?? 'Erreur sans message');
  if (response.compile) console.log('Résultat de compilation :', response.compile);
  console.log('Réponse du serveur :', response);
  console.log('Requête envoyée :', { ...payload, source: `(${payload.source?.length ?? 0} caractères)` });
  console.groupEnd();
}

/** Réponse IA reçue (repliée par défaut). */
export function logAiResponse(context, result) {
  console.groupCollapsed(`%c${TAG} Réponse IA « ${context} » · ${result.items.length} item(s)`, BLUE);
  console.log('Résumé :', result.summary);
  console.table(result.items.map((i) => ({ id: i.id, type: i.type, category: i.category, confidence: i.confidence, title: i.title, edits: i.edits.length })));
  console.log('Réponse complète :', result);
  console.groupEnd();
}

/**
 * Vérification des edits faite par le serveur avant de renvoyer la réponse :
 * edits rejetés (repère vide, introuvable, ambigu, ou fichier qui ne compile plus),
 * demande de correction à l'IA, et ce qui a été écarté.
 */
export function logValidation(context, validation) {
  if (!validation) return;
  if (validation.repaired?.length) {
    console.groupCollapsed(`%c${TAG} Repères réparés par le serveur « ${context} » · ${validation.repaired.length} item(s)`, BLUE);
    console.log('Repères approximatifs ou ambigus remplacés par un extrait exact et unique du fichier.');
    validation.repaired.forEach((it) => it.repairs.forEach((r) => {
      console.log(`• ${it.id} « ${it.title} », edit ${r.edit}${r.reason ? ` (${r.reason})` : ''}\n    IA      : ${JSON.stringify(r.from)}\n    fichier : ${JSON.stringify(r.to)}`);
    }));
    console.groupEnd();
  }
  const rejectedFirst = validation.rounds[0]?.invalid ?? [];
  if (!rejectedFirst.length) return;
  const corrected = validation.discarded.length === 0;
  console.group(`%c${TAG} Vérification serveur « ${context} » · ${rejectedFirst.length} item(s) aux edits inapplicables · ${validation.attempts} appel(s) IA`, corrected ? BLUE : RED);
  validation.rounds.forEach((round) => {
    if (!round.invalid.length) {
      console.log(`Appel ${round.attempt} : tous les edits sont valides.`);
      return;
    }
    console.log(`Appel ${round.attempt} : ${round.invalid.length} item(s) rejeté(s)`);
    round.invalid.forEach((it) => console.log(`  • ${it.id} « ${it.title} »\n${it.problems.map((p) => `      ${p}`).join('\n')}`));
  });
  if (validation.discarded.length) {
    console.warn('Toujours invalides après correction, écartés :', validation.discarded);
  } else {
    console.log('Corrigés par l’IA après la demande de correction.');
  }
  console.groupEnd();
}

/** Application réussie (repliée par défaut). */
export function logApplySuccess(item, edits, origin) {
  console.groupCollapsed(`%c${TAG} Appliqué · « ${item.title} » · ${edits.length} edit(s)`, GREEN);
  console.log(`Origine des edits : ${origin}`);
  console.log('Edits :', edits);
  console.groupEnd();
}
