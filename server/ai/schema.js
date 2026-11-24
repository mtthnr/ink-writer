/**
 * FORMAT DE RÉPONSE UNIQUE exigé d'OpenAI (Structured Outputs, mode strict).
 * Le front ne lit QUE ce format : `result` dans la réponse de POST /api/ink.
 *
 * @typedef {'suggest'|'apply_suggestion'|'edit'|'check_consistency'|'map_story'} Task
 *
 * @typedef {Object} Edit                 Changement atomique sur le fichier .ink
 * @property {'replace'|'insert_before'|'insert_after'|'delete'|'append'} operation
 * @property {string|null} knot           Knot (ou "knot.stitch") concerné, null si hors knot
 * @property {string} target              Extrait EXACT et unique du fichier actuel ("" pour append)
 * @property {string} content             Texte ink à insérer / de remplacement ("" pour delete)
 *
 * Champs communs à tous les items :
 * @typedef {'syntaxe'|'coherence'|'style'|'coquille'} Category
 *   syntaxe : construction ink fragile ou fautive · coherence : logique/récit ·
 *   style : écriture · coquille : faute de frappe, orthographe, typographie
 * @typedef {number} Confidence           Entier 0–100 : certitude que le changement est souhaitable
 *
 * @typedef {Object} Suggestion           Proposition soumise à l'utilisateur (accepter / refuser)
 * @property {'suggestion'} type
 * @property {string} id
 * @property {Category} category
 * @property {Confidence} confidence
 * @property {string} title
 * @property {string} description
 * @property {string|null} knot
 * @property {Edit[]} edits               Vide si c'est une idée qu'il faut encore concrétiser
 *
 * @typedef {Object} Modification         Changement résultant d'une demande explicite (edit / apply_suggestion)
 * @property {'modification'} type
 * @property {string} id
 * @property {Category} category
 * @property {Confidence} confidence
 * @property {string} title
 * @property {string} description
 * @property {string|null} knot
 * @property {Edit[]} edits
 *
 * @typedef {Object} Inconsistency        Incohérence détectée dans l'histoire
 * @property {'inconsistency'} type
 * @property {string} id
 * @property {Category} category
 * @property {Confidence} confidence
 * @property {'low'|'medium'|'high'} severity
 * @property {string} title
 * @property {string} description
 * @property {string[]} knots             Knots impliqués
 * @property {Edit[]} edits               Correctif proposé (peut être vide)
 *
 * @typedef {Object} GraphNode
 * @property {string} id                  Nom du knot / "knot.stitch", ou "END" / "DONE"
 * @property {string} label
 * @property {'start'|'knot'|'stitch'|'ending'} kind
 * @property {string} summary
 *
 * @typedef {Object} GraphEdge
 * @property {string} from
 * @property {string} to
 * @property {string|null} choice         Texte du choix, null pour un divert direct
 * @property {string|null} condition      Condition ink éventuelle, ex. "{has_key}"
 *
 * @typedef {Object} AiResult
 * @property {Task} task
 * @property {string} summary             Résumé court destiné à l'utilisateur
 * @property {(Suggestion|Modification|Inconsistency)[]} items
 * @property {{ nodes: GraphNode[], edges: GraphEdge[] } | null} graph   Non null uniquement pour map_story
 */

export const TASK_NAMES = ['suggest', 'apply_suggestion', 'edit', 'check_consistency', 'map_story'];
export const ITEM_TYPES = ['suggestion', 'modification', 'inconsistency'];
export const CATEGORIES = ['syntaxe', 'coherence', 'style', 'coquille'];

// Champs communs à tous les items (affichage : tampon de catégorie, jauge de confiance).
const common = {
  id: { type: 'string' },
  category: { type: 'string', enum: CATEGORIES },
  confidence: { type: 'integer', description: 'Entier de 0 à 100 : certitude que ce changement est souhaitable' },
};
const COMMON_KEYS = Object.keys(common);

const nullableString = (description) => ({ type: ['string', 'null'], description });

const edit = {
  type: 'object',
  additionalProperties: false,
  required: ['operation', 'knot', 'target', 'content'],
  properties: {
    operation: { type: 'string', enum: ['replace', 'insert_before', 'insert_after', 'delete', 'append'] },
    knot: nullableString('Knot ou "knot.stitch" concerné, null si hors knot'),
    target: {
      type: 'string',
      description: 'Seul repère de l\'edit (le champ knot ne sert qu\'à l\'affichage). Copie EXACTE, caractère pour caractère, d\'un extrait apparaissant UNE seule fois dans le fichier actuel, de préférence une ligne complète. Jamais vide, sauf pour append.',
    },
    content: { type: 'string', description: 'Texte ink valide à insérer ou de remplacement. Chaîne vide pour delete.' },
  },
};

const edits = { type: 'array', items: edit };

const suggestion = {
  type: 'object',
  additionalProperties: false,
  required: ['type', ...COMMON_KEYS, 'title', 'description', 'knot', 'edits'],
  properties: {
    type: { type: 'string', enum: ['suggestion'] },
    ...common,
    title: { type: 'string' },
    description: { type: 'string' },
    knot: nullableString('Knot principalement concerné'),
    edits,
  },
};

const modification = {
  type: 'object',
  additionalProperties: false,
  required: ['type', ...COMMON_KEYS, 'title', 'description', 'knot', 'edits'],
  properties: {
    type: { type: 'string', enum: ['modification'] },
    ...common,
    title: { type: 'string' },
    description: { type: 'string' },
    knot: nullableString('Knot principalement concerné'),
    edits,
  },
};

const inconsistency = {
  type: 'object',
  additionalProperties: false,
  required: ['type', ...COMMON_KEYS, 'severity', 'title', 'description', 'knots', 'edits'],
  properties: {
    type: { type: 'string', enum: ['inconsistency'] },
    ...common,
    severity: { type: 'string', enum: ['low', 'medium', 'high'] },
    title: { type: 'string' },
    description: { type: 'string' },
    knots: { type: 'array', items: { type: 'string' } },
    edits,
  },
};

const graph = {
  type: 'object',
  additionalProperties: false,
  required: ['nodes', 'edges'],
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'kind', 'summary'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          kind: { type: 'string', enum: ['start', 'knot', 'stitch', 'ending'] },
          summary: { type: 'string' },
        },
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'choice', 'condition'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          choice: nullableString('Texte du choix, null pour un divert direct'),
          condition: nullableString('Condition ink éventuelle'),
        },
      },
    },
  },
};

export const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['task', 'summary', 'items', 'graph'],
  properties: {
    task: { type: 'string', enum: TASK_NAMES },
    summary: { type: 'string', description: 'Résumé court de la réponse pour l\'utilisateur' },
    items: { type: 'array', items: { anyOf: [suggestion, modification, inconsistency] } },
    graph: { anyOf: [graph, { type: 'null' }] },
  },
};

export const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: { name: 'ink_assistant_response', strict: true, schema: RESPONSE_SCHEMA },
};
