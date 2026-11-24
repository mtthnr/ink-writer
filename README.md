# En Clair — atelier d'écriture pour histoires ink

En Clair est un éditeur web pour les histoires interactives écrites en [ink](https://www.inklestudios.com/ink/) (le langage d'Inkle). Il permet d'ouvrir un fichier `.ink`, de l'éditer, de le compiler, de le jouer, de visualiser sa structure et de le faire relire par une IA (OpenAI) qui propose des corrections que l'auteur accepte ou rejette une par une.

Le projet est composé de deux parties :

| Dossier | Rôle |
|---|---|
| [`server/`](server/) | Serveur Node.js sans framework : compile les fichiers ink et appelle l'API OpenAI. C'est lui qui détient la clé API. |
| [`ink-app/`](ink-app/) | Interface React (Vite) : éditeur, revue des suggestions, carte narrative, lecteur de test, inspecteur de variables. |
| [`sample/`](sample/) | Fichiers ink de test (dont `TheIntercept_endommage.ink`, qui contient des erreurs volontaires). |

---

## 1. Initialiser le projet

### Prérequis

- **Node.js 20.6 ou plus récent** (testé avec Node 22). Le serveur utilise l'option `--env-file`, apparue en 20.6.
- **Une clé API OpenAI** pour les fonctions d'analyse (l'éditeur, la compilation, la carte et le lecteur fonctionnent sans).

### Installation

```bash
git clone https://github.com/mtthnr/ink-writer.git
cd ink-writer

# Dépendances du serveur
cd server
npm install

# Dépendances de l'interface
cd ../ink-app
npm install
```

### Configuration

Créer le fichier `server/.env` à partir du modèle :

```bash
cd server
cp .env.example .env
```

Puis renseigner la clé :

```ini
OPENAI_API_KEY=sk-...          # obligatoire : le serveur refuse de démarrer sans
OPENAI_MODEL=gpt-4o-mini       # modèle utilisé (doit prendre en charge les Structured Outputs)
OPENAI_MAX_RETRIES=1           # demandes de correction envoyées à l'IA si ses modifications sont inapplicables (0 = aucune)
PORT=3001                      # port du serveur
CORS_ORIGIN=http://localhost:5173
```

Le fichier `.env` est ignoré par git (voir [`.gitignore`](.gitignore)) : la clé ne doit jamais être commitée.

> Si vous changez `PORT`, mettez aussi à jour la cible du proxy dans [`ink-app/vite.config.js`](ink-app/vite.config.js).

### Lancement

Dans deux terminaux :

```bash
# Terminal 1 — serveur (redémarre automatiquement à chaque modification)
cd server
npm run dev
```

```bash
# Terminal 2 — interface
cd ink-app
npm run dev
```

Ouvrir ensuite http://localhost:5173. En développement, Vite relaie les appels `/api/*` vers le serveur (port 3001) : l'interface ne voit jamais la clé OpenAI.

Pour vérifier que le serveur répond : http://localhost:3001/health doit renvoyer `{"ok":true}`.

### Scripts disponibles

| Dossier | Commande | Effet |
|---|---|---|
| `server/` | `npm run dev` | Démarre le serveur avec rechargement automatique |
| `server/` | `npm start` | Démarre le serveur sans rechargement |
| `ink-app/` | `npm run dev` | Démarre l'interface en développement |
| `ink-app/` | `npm run build` | Construit l'interface dans `ink-app/dist/` |
| `ink-app/` | `npm run lint` | Vérifie le code avec ESLint |
| `ink-app/` | `npm run preview` | Sert la version construite |

---

## 2. Utiliser l'application

1. **Accueil** : déposer un fichier `.ink`, en créer un vierge ou ouvrir l'histoire d'exemple. Les dossiers ouverts s'inscrivent au *registre des dossiers* (stocké dans le navigateur) ; la croix à droite d'une entrée la retire du registre.
2. **Éditeur** : édition du fichier avec coloration syntaxique. Le fichier est recompilé automatiquement à chaque pause de frappe ; les erreurs apparaissent en rouge dans la marge, dans le classeur des knots et dans la barre d'état. Le bouton **Analyser le dossier** lance l'analyse IA.
3. **Revue IA** : les remarques de l'IA, une par une, avec le texte actuel et le texte proposé. On peut **accepter** (A), **rejeter** (R) ou **modifier** la proposition avant de l'appliquer (M). Le bouton **Exporter le dossier** s'illumine quand toutes les remarques ont été traitées.
4. **Carte** : graphe des knots (et stitches), du départ jusqu'aux fins, avec les anomalies de structure : divert vers une cible introuvable, knot orphelin, boucle.
5. **Lecteur** : joue l'histoire compilée (choix au clavier 1–9, annulation du dernier choix, redémarrage).
6. **Variables** : valeurs des variables pendant la lecture de test, journal des écritures avec la ligne qui les produit, et retour à un pas précédent.

Autres commandes : **Mode nuit / Mode papier** (en haut à droite), **Exporter** pour télécharger le `.ink` (Ctrl S), Ctrl O pour ouvrir un fichier, Ctrl Alt N pour un nouveau dossier.

> Les modifications ne sont jamais écrites sur votre disque : le texte vit dans l'application et dans le registre du navigateur. Utilisez **Exporter** pour récupérer le fichier.

---

## 3. Fonctionnement

### Vue d'ensemble

```
 Navigateur (ink-app)                        Serveur (server)                     OpenAI
 ────────────────────                        ────────────────                     ──────
 Éditeur ── frappe ──► POST /api/compile ──► compile (inkjs) ─┐
                     ◄─ erreurs + JSON compilé ───────────────┘
 Lecteur : joue le JSON compilé (runtime inkjs)

 Analyser ──────────► POST /api/ink ───────► 1. compile ── erreurs ? ──► 422, aucun appel IA
                                             2. construit le prompt ──────────────► Chat Completions
                                             3. vérifie / répare les edits ◄─────── réponse au schéma imposé
                                                (si besoin : 1 demande de correction) ─►
                     ◄─ résultat validé ─────4. renvoie { result, validation }
 Accepter ──► applique les edits localement (aucun appel si la remarque en contient)
```

### Garde-fou de compilation

Aucun appel OpenAI n'est fait sur un fichier qui ne compile pas. Le serveur compile systématiquement la source avant d'appeler l'IA et renvoie les erreurs (HTTP 422) le cas échéant ; l'interface vérifie aussi la compilation avant d'appeler le serveur et annule l'analyse en affichant l'erreur. Les erreurs de compilation sont donc traitées séparément, sans IA, dans l'éditeur.

### API du serveur

Toutes les réponses suivent la même enveloppe `{ ok, stage, ... }`, où `stage` vaut `request`, `compile`, `ai` ou `server` et indique d'où vient une éventuelle erreur.

| Route | Corps | Réponse |
|---|---|---|
| `GET /health` | — | `{ ok: true }` |
| `POST /api/compile` | `{ source }` | `{ ok, stage: 'compile', compile: { ok, errors, warnings, todos, json } }` (422 si erreurs) |
| `POST /api/ink` | `{ task, source, fileName?, instruction?, focus?, suggestion? }` | `{ ok: true, stage: 'ai', compile, result, validation }` |

Une erreur de compilation est décrite par `{ severity, line, message }`.

### Tâches IA (`task`)

| Tâche | Usage | Types d'items renvoyés | Champ requis |
|---|---|---|---|
| `suggest` | Suggestions d'écriture, de rythme, de structure | `suggestion` | — |
| `check_consistency` | Détection des incohérences de l'histoire | `inconsistency` | — |
| `apply_suggestion` | Concrétiser une suggestion acceptée qui n'a pas encore de modification précise | `modification` | `suggestion` |
| `edit` | Édition demandée librement par l'utilisateur | `modification` | `instruction` |
| `map_story` | Graphe de l'histoire produit par l'IA | `graph` | — |

« Analyser le dossier » lance `suggest` et `check_consistency` en parallèle. La carte de l'interface est calculée localement (sans IA) ; `map_story` reste disponible côté serveur.

### Format de prompt

Le client n'envoie jamais de messages bruts à l'IA : il envoie une requête typée, et le serveur construit toujours le prompt de la même façon ([`server/ai/prompts.js`](server/ai/prompts.js)) :

- un **prompt système** fixe : rôle, règles de réponse, règles d'écriture des modifications ;
- un **message utilisateur** structuré en balises : `<task>`, `<task_rules>` (consignes propres à la tâche), `<instruction>`, `<focus>`, `<suggestion>` et `<ink_file>`.

### Format de réponse unique

L'IA doit répondre avec un seul schéma JSON, imposé par les *Structured Outputs* d'OpenAI en mode strict ([`server/ai/schema.js`](server/ai/schema.js)) :

```js
{
  task: 'suggest' | 'apply_suggestion' | 'edit' | 'check_consistency' | 'map_story',
  summary: string,
  items: [ Suggestion | Modification | Inconsistency ],   // distingués par item.type
  graph: { nodes, edges } | null                          // seulement pour map_story
}
```

Le champ `type` de chaque item permet à l'interface de les distinguer :

| `type` | Sens | Affichage |
|---|---|---|
| `suggestion` | Proposition que l'auteur accepte ou refuse | Revue IA, panneau de l'analyste |
| `modification` | Changement à appliquer, produit seulement sur demande | Appliqué à l'acceptation |
| `inconsistency` | Problème détecté dans l'histoire (avec une gravité) | Revue IA, panneau de l'analyste |

Chaque item porte aussi `category` (`syntaxe`, `coherence`, `style`, `coquille`), `confidence` (0 à 100), `title`, `description` et une liste d'`edits` :

```js
{ operation: 'replace' | 'insert_before' | 'insert_after' | 'delete' | 'append',
  knot: string | null,   // affichage seulement
  target: string,        // extrait exact et unique du fichier, servant de repère
  content: string }      // texte à insérer ou de remplacement
```

Une suggestion sans `edits` est une idée générale : l'accepter déclenche la tâche `apply_suggestion` pour la transformer en modifications concrètes.

### Vérification et réparation des modifications

Les modèles recopient rarement un extrait à l'identique dans un long fichier. Avant de renvoyer une réponse, le serveur applique chaque item sur une copie du fichier ([`server/ai/validate.js`](server/ai/validate.js), [`server/ai/anchor.js`](server/ai/anchor.js)) :

1. **Repère exact** trouvé une seule fois : accepté tel quel.
2. **Repère approximatif** (tabulations remplacées par des espaces, apostrophes typographiques, `===` final ajouté à un en-tête, étiquette de choix `(label)` oubliée) : s'il correspond à un seul passage, il est **réparé**, c'est-à-dire remplacé par le texte exact du fichier.
3. **Repère présent plusieurs fois** : départagé par le champ `knot` quand les occurrences sont dans des knots différents, sinon rejeté.
4. **Texte inséré juste après un divert** (`-> cible`, `->->`) : rejeté, car il ne serait jamais lu.
5. **Fichier qui ne compile plus** après application : rejeté.

Si des items sont rejetés, le serveur envoie à l'IA la liste des problèmes, avec les lignes réelles les plus proches et les repères uniques à utiliser, et lui demande de corriger sa réponse (`OPENAI_MAX_RETRIES`, 1 par défaut). Ce qui reste invalide est écarté : une suggestion perd ses edits, une modification est retirée. Le détail est renvoyé dans le champ `validation` de la réponse.

### Journal dans la console du navigateur

Ouvrir les outils de développement (F12) pour suivre les échanges avec l'IA :

- **bleu** : réponse IA reçue (tableau des items) et repères réparés par le serveur ;
- **rouge** : échec d'application d'une modification (modification en cause, repère brut, diagnostic) ou échec d'un appel au serveur ;
- **vert** : modification appliquée.

### Données locales

Le registre des dossiers, le thème et le contenu des fichiers ouverts sont stockés dans le `localStorage` du navigateur. Rien n'est envoyé à OpenAI tant qu'une analyse n'est pas lancée ; l'analyse envoie alors le fichier entier.

---

## 4. Structure du code

```
server/
├── index.js            routes HTTP, garde-fou de compilation, enveloppe des réponses
├── ink/compile.js      compilation ink (inkjs) → erreurs, avertissements, JSON compilé
└── ai/
    ├── prompts.js      tâches, prompt système, construction des messages, message de correction
    ├── schema.js       format de réponse unique (JSON Schema strict) et types documentés
    ├── openai.js       appel OpenAI, vérification, demande de correction
    ├── validate.js     application des edits sur une copie + compilation
    └── anchor.js       recherche tolérante et réparation des repères

ink-app/src/
├── App.jsx             état global, actions (analyser, accepter, rejeter, exporter), navigation
├── index.css           design system « En Clair » : tokens --ec-*, modes papier / nuit, composants
├── views/              un écran par fichier : Accueil, Editeur, Revue, Carte, Variables, Lecteur
├── components/         barre de commande, éditeur de code, tampons, rotor, jauge, télégrammes
├── hooks/              useCompile (compilation différée), usePlayer (lecture inkjs), useToasts
└── lib/
    ├── api.js          client du serveur
    ├── inkParse.js     analyse statique : knots, diverts, variables, graphe, coloration
    ├── edits.js        application des edits et diagnostic des repères
    ├── log.js          journal console
    ├── registry.js     registre des dossiers (localStorage)
    ├── categories.js   catégories et statuts des remarques
    └── sample.js       histoire d'exemple
```

---

## 5. Limites connues

- Un seul fichier ouvert à la fois : les `INCLUDE` vers d'autres fichiers ne sont pas résolus.
- Le lecteur ne montre que les choix disponibles : un choix dont la condition n'est pas remplie n'apparaît pas (le runtime inkjs ne les expose pas). La carte permet de vérifier qu'une branche reste atteignable.
- La qualité des suggestions dépend du modèle. Sur un long fichier, `gpt-4o-mini` produit souvent des idées générales et place parfois ses modifications loin du passage visé : relisez chaque proposition avant de l'accepter. Un modèle plus récent améliore nettement la précision (`OPENAI_MODEL`).
- Le fichier entier est envoyé à chaque analyse : le coût et la durée augmentent avec la taille de l'histoire.
