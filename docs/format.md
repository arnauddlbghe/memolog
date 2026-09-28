# Format des fichiers Memolog

Ce document est le **contrat** entre Memolog, l'utilisateur et les futures
intégrations (CLI `memolog`, serveur MCP, hook Claude Code). Tout outil qui
respecte ce document peut lire et écrire les données sans passer par
l'application.

Principes :

1. **Les fichiers sont l'unique source de vérité.** Aucune base de données.
   L'index de Memolog est reconstructible à tout moment à partir des fichiers.
2. **Tout reste lisible et modifiable à la main**, dans n'importe quel éditeur.
3. **Ce que Memolog n'a pas écrit est préservé.** Un bloc inconnu, un
   frontmatter, un commentaire : rien n'est supprimé ni reformaté.

---

## 1. Arborescence

```
<racine>/                              dossier choisi par l'utilisateur
├── journal/
│   └── 2026-09-28.md                  notes libres du jour
├── taches.md                          toutes les tâches actives
├── taches/
│   └── archive-2026.md                tâches terminées ou abandonnées, archivées
├── projets/
│   └── infra.md                       fiche projet (optionnelle)
└── .memolog/
    └── activite/
        └── 2026-09-28.jsonl           journal d'activité (ajout seulement)
```

- Les autres fichiers `.md` de la racine et de ses sous-dossiers sont des notes
  libres ordinaires : Memolog les indexe et les affiche, sans leur imposer de
  structure.
- Le dossier `.memolog/` contient des données produites par l'application.
  Il est masqué dans l'arborescence et **exclu de la recherche**.
- Conventions communes à tous les fichiers `.md` : UTF-8 sans BOM, fins de
  ligne `\n`, un saut de ligne final. Un frontmatter YAML en tête est
  facultatif ; Memolog n'en écrit jamais mais préserve celui qu'il trouve,
  octet pour octet, et ne l'indexe pas comme du texte.
- Le **titre** d'une note est son nom de fichier sans l'extension. Aucun titre
  n'est dupliqué dans le contenu.

---

## 2. Journal

Un fichier par jour : `journal/AAAA-MM-JJ.md` (date **locale**, jamais UTC).

Le journal contient **uniquement des notes libres**. Il ne contient pas de
tâches : celles-ci vivent dans `taches.md` (voir §4).

### 2.1 Entrée

Une entrée est une puce de premier niveau :

```
- HH:MM — Texte de l'entrée #tag
```

- `-` puis une espace, l'heure locale sur deux chiffres, une espace, un tiret
  cadratin `—` (U+2014), une espace, puis le texte.
- Les entrées sont rangées de la plus ancienne à la plus récente.

**Une entrée = une puce et ses sous-puces.** Les puces indentées sous une
entrée en font partie et n'ont pas d'heure :

```
- 14:32 — Point hebdo #infra
  - Migration repoussée à la semaine prochaine
  - Budget validé #budget
- 16:05 — Relu la doc d'API #api
```

L'entrée de 14:32 comporte deux sous-puces. Chaque niveau d'indentation vaut
deux espaces ; une tabulation compte pour deux espaces.

### 2.2 Lecture tolérante, écriture stricte

Memolog **écrit** toujours la forme ci-dessus. Il **accepte en lecture** :
`*` ou `+` comme puce, une heure sur un chiffre (`9:05`), des secondes
(`09:05:30`), et `-` ou `–` à la place du tiret cadratin.

Une ligne qui ne correspond pas à ce motif n'est pas une entrée : elle est
conservée telle quelle (titre, paragraphe, liste, bloc de code…).

---

## 3. Tags

Un tag s'écrit `#tag` n'importe où dans le texte d'une puce.

- Caractères autorisés : lettres (accents compris), chiffres, `-`, `_`, `/`.
  `#infra`, `#client/acme`, `#compte-rendu` sont valides.
- Un `#` collé à un caractère non blanc à sa gauche n'est pas un tag
  (`C#`, `couleur#3`), et un `#` suivi d'un chiffre seul non plus (`#1`).
- Un `#` en début de ligne suivi d'une espace est un titre Markdown, pas un tag.
- Les tags dans un bloc de code (délimité par ``` ou ~~~) sont ignorés.
- La comparaison est **insensible à la casse et aux accents** : `#Infra`,
  `#infra` et `#INFRA` sont le même tag. La forme affichée est celle
  rencontrée en premier.

### 3.1 Héritage

**Une puce hérite des tags de sa puce parente.**

```
- 14:32 — Point hebdo #infra
  - Migration repoussée #urgent
    - Prévenir le client
```

| Puce | Tags propres | Tags effectifs |
|---|---|---|
| `Point hebdo` | `infra` | `infra` |
| `Migration repoussée` | `urgent` | `infra`, `urgent` |
| `Prévenir le client` | — | `infra`, `urgent` |

L'héritage ne descend que dans la même entrée, et jamais d'une entrée à
l'autre.

---

## 4. Tâches

**Toutes les tâches vivent dans `taches.md`.** Une case à cocher écrite
ailleurs (journal, note libre) n'est pas une tâche pour Memolog : elle reste
du Markdown ordinaire.

### 4.1 Structure du fichier

```markdown
## Infra

- [/] Relancer l'équipe infra ^t42 [créée:: 2026-09-10] [maj:: 2026-09-14]
- [ ] Documenter la procédure de bascule ^t47 [créée:: 2026-09-21] [maj:: 2026-09-21]

## Divers

- [>] Racheter du café ^t44 [créée:: 2026-09-12] [maj:: 2026-09-20]
```

- Chaque tâche appartient à la **section `##` qui la précède**. Le nom de la
  section est le nom du projet.
- Une tâche écrite avant toute section appartient au projet **`Divers`**, qui
  est aussi la section par défaut à la création.
- Le texte libre entre les tâches (paragraphes, sous-titres `###`) est
  conservé tel quel.
- Une tâche peut être indentée sous une autre : elle reste une tâche à part
  entière, du même projet, et son indentation est préservée.

### 4.2 Ligne de tâche

```
- [<état>] <texte> ^t<id> [créée:: AAAA-MM-JJ] [maj:: AAAA-MM-JJ]
```

Dans cet ordre : la case, le texte, l'identifiant, puis les champs en ligne.

### 4.3 Description

Une tâche peut porter une description : les lignes qui **suivent
immédiatement** la ligne de tâche et qui sont **plus indentées** qu'elle.

```markdown
## Infra

- [/] Relancer l'équipe infra ^t42 [créée:: 2026-09-10] [maj:: 2026-09-14]
  Ils attendent le devis signé avant de planifier la bascule.
  Contact : Camille, par courriel.
- [ ] Documenter la procédure ^t47 [créée:: 2026-09-21] [maj:: 2026-09-21]
```

- La description s'arrête à la **première ligne vide** ou à la première ligne
  qui n'est pas plus indentée que la tâche.
- Memolog écrit ces lignes avec l'indentation de la tâche **plus deux
  espaces**, et conserve telle quelle une description écrite à la main.
- Une ligne plus indentée qui est elle-même une tâche (`- [ ] …`) n'est pas
  une description : c'est une sous-tâche, avec son propre identifiant.
- Modifier la description met `maj` à jour, comme le texte ou l'état.
- Archiver une tâche déplace sa description avec elle.

### 4.4 États

| Marque | État | Sens |
|---|---|---|
| `[ ]` | `a-faire` | à faire |
| `[/]` | `en-cours` | en cours |
| `[>]` | `reportee` | reportée |
| `[x]` | `terminee` | terminée |
| `[-]` | `abandonnee` | abandonnée |

`[X]` est lu comme `[x]`. Toute autre marque à un caractère est lue comme
`a-faire` et normalisée à la première écriture.

`terminee` et `abandonnee` sont les deux états **fermés** : ce sont eux qui
déclenchent l'archivage (§4.8). Les trois autres sont **actifs**.

Un clic sur la case fait défiler `[ ] → [/] → [x] → [ ]`. Les états `[>]` et
`[-]` s'atteignent par le menu contextuel ou un raccourci.

### 4.5 Identifiant

`^t<n>` où `<n>` est un entier décimal, par exemple `^t42`.

- Attribué par l'application, **jamais réutilisé**, même après suppression ou
  archivage.
- **Stable** : il ne change ni au renommage, ni au changement d'état, ni au
  déplacement d'une section à l'autre, ni à l'archivage.
- Le prochain identifiant est mémorisé dans `.memolog/state.json`
  (`{"nextTaskId": 48}`). Si ce fichier manque, Memolog repart de
  `max(identifiants trouvés dans taches.md et taches/archive-*.md) + 1`.
- Une tâche écrite à la main sans identifiant en reçoit un au premier passage
  de l'application sur le fichier.

### 4.6 Champs en ligne

Syntaxe `[clé:: valeur]`, compatible avec les champs en ligne de Dataview.

| Champ | Contenu | Écrit par l'app |
|---|---|---|
| `créée` | date locale `AAAA-MM-JJ` de création | à la création |
| `maj` | date locale de la dernière **modification d'état ou de texte** | à chaque modification |

- `créée` n'est jamais modifié après coup.
- `maj` ne bouge pas quand l'application se contente d'ajouter un
  identifiant ou un champ manquant : compléter n'est pas modifier.
- Une tâche écrite à la main sans ces champs les reçoit au premier passage ;
  les deux valent alors la date du jour.
- La clé est lue sans tenir compte des accents ni de la casse (`creee`,
  `Créée`) ; elle est toujours **écrite** `créée`.
- Les autres champs en ligne (`[échéance:: …]`, `[priorité:: …]`) sont
  **préservés** mais ignorés par la V1.
- Dans l'éditeur, identifiant et champs en ligne sont atténués visuellement,
  pour que la ligne reste lisible.

### 4.7 Références `@t<id>`

`@t42` dans n'importe quelle note (journal, note libre, fiche projet) est une
référence vers la tâche `^t42`.

- Memolog l'affiche comme une étiquette cliquable portant le titre et l'état
  **actuels** de la tâche ; le fichier, lui, ne contient que `@t42`.
- Une référence vers un identifiant inconnu est affichée comme du texte, en
  signalant qu'elle est orpheline.
- Taper `@` déclenche l'autocomplétion sur les tâches actives.
- Une référence ne crée ni ne modifie jamais la tâche : c'est un lien.

### 4.8 Archivage

Les tâches `terminee` ou `abandonnee` dont la date `maj` remonte à plus de
N jours (réglable, 30 par défaut) sont déplacées vers
`taches/archive-AAAA.md`, où `AAAA` est **l'année de la date `maj`** au moment
de l'archivage.

- Le fichier d'archive reprend la même structure : sections `##` par projet,
  lignes de tâches inchangées, identifiants conservés.
- L'archivage se déclenche à la demande (commande) ou automatiquement, selon
  les réglages.
- Rien n'est supprimé : archiver, c'est déplacer.

---

## 5. Projets

Un projet est identifié par son **nom normalisé** : minuscules, sans accents,
espaces et `_` remplacés par `-`. `Client ACME`, `client-acme` et
`#client-acme` désignent le même projet.

Un projet peut apparaître de trois façons, qui se complètent :

1. une **section `##`** de `taches.md` (ses tâches) ;
2. un **tag** utilisé dans le journal (son historique) ;
3. une **fiche** `projets/<nom>.md` (sa description, facultative).

La vue Projets réunit les trois et trie par dernière activité.

---

## 6. Journal d'activité

`.memolog/activite/AAAA-MM-JJ.jsonl` — un fichier par jour (date locale de
l'événement), **en ajout seulement : aucune ligne n'est jamais réécrite ni
supprimée**. Un objet JSON par ligne, sans indentation.

### 6.1 Champs communs

| Champ | Type | Contenu |
|---|---|---|
| `ts` | chaîne | date-heure ISO 8601 avec décalage local : `2026-09-28T14:32:05+02:00` |
| `auteur` | `"vous"` \| `"claude"` \| `"externe"` | qui a fait l'action |
| `type` | chaîne | type d'événement |

- `vous` : action faite dans l'application.
- `externe` : modification détectée sur le disque et non provoquée par
  l'application (autre éditeur, script, synchronisation).
- `claude` : réservé au CLI, au serveur MCP et au hook Claude Code. Ces outils
  passent par la même fonction d'ajout que l'application.

Un lecteur doit **ignorer les champs qu'il ne connaît pas** et les types
d'événements inconnus.

### 6.2 Types d'événements

| `type` | Champs supplémentaires |
|---|---|
| `tache.creee` | `tache` (id, ex. `t42`), `titre`, `projet` |
| `tache.etat` | `tache`, `de` (état), `vers` (état) |
| `tache.modifiee` | `tache`, `titre` (nouveau titre) |
| `fichier.edite` | `fichier` (chemin relatif POSIX), `ligne` (n° de la première ligne modifiée, à partir de 1), `extrait` (contenu de cette ligne, tronqué à 200 caractères), `lignes` (nombre de lignes touchées) |

```jsonl
{"ts":"2026-09-28T09:12:03+02:00","auteur":"vous","type":"tache.creee","tache":"t47","titre":"Documenter la procédure de bascule","projet":"Infra"}
{"ts":"2026-09-28T14:32:05+02:00","auteur":"vous","type":"tache.etat","tache":"t42","de":"a-faire","vers":"en-cours"}
{"ts":"2026-09-28T14:40:11+02:00","auteur":"externe","type":"fichier.edite","fichier":"journal/2026-09-28.md","ligne":12,"extrait":"- 14:39 — Note ajoutée depuis un autre éditeur","lignes":3}
```

### 6.3 Diff et regroupement

- Le diff est calculé en comparant le fichier à **la dernière version connue**,
  gardée en mémoire par l'application. Au démarrage, la version connue est
  celle lue sur le disque : une modification faite pendant que Memolog était
  éteint ne produit donc pas d'événement.
- **Un seul événement `fichier.edite` par fichier et par auteur tant que
  l'édition continue.** Une rafale d'écritures est regroupée ; un nouvel
  événement n'est ouvert qu'après 10 minutes sans modification (réglable).
- L'événement est écrit **à la fermeture de la rafale**, avec le cumul :
  `ligne` et `extrait` désignent la première ligne modifiée de la rafale,
  `lignes` le nombre total de lignes touchées. C'est ce qui permet de rester
  strictement en ajout seulement tout en publiant des chiffres justes. Les
  rafales encore ouvertes sont visibles dans la vue Jour et sont écrites au
  plus tard à la fermeture de l'application ou au changement de jour.
- Les changements d'état de tâche ne sont jamais regroupés : chaque
  changement produit son propre événement, immédiatement.

---

## 7. Réglages

Les réglages ne sont **pas** dans le dossier de notes : ils vivent dans le
dossier de configuration de l'OS (`settings.json`), avec le cache d'index
(`index.cache.json`), qui est jetable.

Seule exception, dans le dossier de notes : `.memolog/state.json`, qui porte
le compteur d'identifiants de tâches — une donnée qui appartient aux données,
pas à l'application, et qui doit suivre le dossier s'il est déplacé ou
sauvegardé.

---

## 8. Ce que Memolog ne fait jamais

- Supprimer définitivement : toute suppression passe par la corbeille du
  système.
- Réécrire un fichier `.jsonl` d'activité.
- Modifier un frontmatter, un bloc de code ou du texte qu'il n'a pas écrit.
- Renommer un identifiant de tâche, ou en réutiliser un.
- Écrire quoi que ce soit hors du dossier de notes et du dossier de
  configuration.
