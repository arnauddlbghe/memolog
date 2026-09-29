# Format des fichiers Memolog

Ce document est le **contrat** entre Memolog, l'utilisateur et les futures
intégrations (CLI `memolog`, serveur MCP, hook Claude Code). Tout outil qui
respecte ce document peut lire et écrire les données sans passer par
l'application.

Principes :

1. **Les fichiers sont l'unique source de vérité.** Aucune base de données.
   L'index de Memolog est reconstructible à tout moment à partir des fichiers.
2. **Tout reste lisible et modifiable à la main**, dans n'importe quel éditeur.
3. **Ce que Memolog n'a pas écrit est préservé.** Le corps d'une conversation
   est votre texte : l'application n'y touche jamais d'elle-même.

---

## 1. Le modèle

**Une conversation = un fichier.**

C'est un bloc-notes libre, en Markdown, sur un sujet. Il porte quatre
métadonnées, et rien d'autre :

| | |
|---|---|
| **nom** | le nom du fichier, sans l'extension |
| **date de création** | quand la conversation a commencé |
| **état** | où elle en est, aujourd'hui |
| **historique** | quand l'état a changé, et pour quoi |

Le reste du fichier est à vous.

---

## 2. Arborescence

```
<racine>/                              dossier choisi par l'utilisateur
├── conversations/
│   ├── Migration serveur.md
│   ├── Import CSV.md
│   └── Recrutement.md
└── .memolog/
    └── activite/
        └── 2026-09-29.jsonl           journal d'activité (ajout seulement)
```

- Les fichiers `.md` de `conversations/` sont des conversations.
- Les autres fichiers `.md` du dossier sont des notes libres ordinaires :
  Memolog les indexe et les rend cherchables, sans leur imposer de structure
  ni d'état.
- Le dossier `.memolog/` contient des données produites par l'application. Il
  est masqué et exclu de la recherche.
- Conventions : UTF-8 sans BOM, fins de ligne `\n`, un saut de ligne final.

---

## 3. Un fichier de conversation

```markdown
conversations/Migration serveur.md

---
créée: 2026-09-14
état: en-cours
historique:
  - 2026-09-14 a-faire
  - 2026-09-20 en-cours
  - 2026-09-28 a-reprendre
  - 2026-09-29 en-cours
---

# Migration serveur

Le client attend le devis signé avant qu'on planifie la bascule.

- [x] Chiffrer la bascule
- [ ] Planifier la fenêtre

## Contacts
Camille, par courriel.
```

### 3.1 L'en-tête

Un **frontmatter YAML** délimité par `---`, en tête de fichier. C'est le seul
endroit où Memolog écrit des métadonnées, et il n'y écrit que ces trois clés.

| Clé | Contenu |
|---|---|
| `créée` | date locale `AAAA-MM-JJ` de création |
| `état` | `a-faire`, `en-cours`, `a-reprendre` ou `termine` |
| `historique` | une ligne par changement, `AAAA-MM-JJ <état>`, de la plus ancienne à la plus récente |

- Les clés sont lues **sans tenir compte des accents ni de la casse**
  (`creee`, `Créée`, `etat`, `État`) ; elles sont toujours **écrites**
  accentuées.
- Toute autre clé présente dans le frontmatter est **préservée telle quelle**
  et ignorée par la V1.
- Un fichier sans frontmatter est une conversation valide : son état vaut
  `a-faire`, sa date de création est celle du fichier sur le disque, et
  Memolog écrit l'en-tête au premier changement d'état.
- L'historique se termine toujours par l'état courant. Si les deux divergent
  (fichier modifié à la main), **`état` fait foi**.

### 3.2 Les états

| État | Bulle | Sens |
|---|---|---|
| `a-faire` | grise | pas encore commencé |
| `en-cours` | ambre | en cours |
| `a-reprendre` | rouge | mis de côté, à ne pas oublier |
| `termine` | verte | fini |

Changer l'état ajoute une ligne à l'historique, datée du jour. Reposer le même
état n'ajoute rien.

### 3.3 Le corps

Tout ce qui suit le frontmatter est du Markdown libre, écrit par vous.
Memolog ne le réécrit jamais de lui-même : il l'affiche, le rend cherchable,
et l'enregistre tel que vous l'avez laissé.

Les cases à cocher `- [ ]` / `- [x]` y sont du Markdown ordinaire : cliquables
dans l'éditeur, mais elles ne portent aucun état de conversation et ne sont
comptées nulle part.

---

## 4. Journal d'activité

`.memolog/activite/AAAA-MM-JJ.jsonl` — un fichier par jour (date locale),
**en ajout seulement : aucune ligne n'est jamais réécrite ni supprimée**. Un
objet JSON par ligne, sans indentation.

### 4.1 Champs communs

| Champ | Type | Contenu |
|---|---|---|
| `ts` | chaîne | date-heure ISO 8601 avec décalage local |
| `auteur` | `"vous"` \| `"claude"` \| `"externe"` | qui a fait l'action |
| `type` | chaîne | type d'événement |

`vous` : action faite dans l'application. `externe` : modification détectée
sur le disque. `claude` : réservé au CLI, au serveur MCP et au hook Claude
Code, qui passent par la même fonction d'ajout.

Un lecteur doit **ignorer les champs et les types qu'il ne connaît pas**.

### 4.2 Types d'événements

| `type` | Champs supplémentaires |
|---|---|
| `conversation.creee` | `fichier`, `nom` |
| `conversation.etat` | `fichier`, `nom`, `de`, `vers` |
| `fichier.edite` | `fichier`, `ligne`, `extrait` (tronqué à 200 caractères), `lignes` |

```jsonl
{"ts":"2026-09-29T09:12:03+02:00","auteur":"vous","type":"conversation.creee","fichier":"conversations/Migration serveur.md","nom":"Migration serveur"}
{"ts":"2026-09-29T14:32:05+02:00","auteur":"vous","type":"conversation.etat","fichier":"conversations/Migration serveur.md","nom":"Migration serveur","de":"a-reprendre","vers":"en-cours"}
```

### 4.3 Diff et regroupement

- Le diff compare le fichier à **la dernière version connue**, gardée en
  mémoire. Au démarrage, la version connue est celle lue sur le disque : une
  modification faite hors application ne produit donc pas d'événement.
- **Un seul événement `fichier.edite` par fichier et par auteur tant que
  l'édition continue** ; un nouvel événement n'est ouvert qu'après 10 minutes
  sans modification (réglable). L'événement est écrit à la fermeture de la
  rafale, avec le cumul — ce qui permet de rester strictement en ajout
  seulement tout en publiant des chiffres justes.
- Les changements d'état ne sont jamais regroupés.

---

## 5. Réglages

Les réglages vivent dans le dossier de configuration de l'OS
(`settings.json`), avec le cache d'index (`index.cache.json`), qui est
jetable. Rien de tout cela n'est écrit dans le dossier de notes.

---

## 6. Ce que Memolog ne fait jamais

- Supprimer définitivement : toute suppression passe par la corbeille du
  système.
- Réécrire un fichier `.jsonl` d'activité.
- Réécrire le corps d'une conversation de lui-même.
- Toucher à une clé de frontmatter qu'il ne connaît pas.
- Écrire quoi que ce soit hors du dossier de notes et du dossier de
  configuration.
