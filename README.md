# Memolog

Un bloc-notes par sujet, avec un état et une date. Application desktop
locale : un raccourci clavier global l'affiche par-dessus tout le reste, le
même la masque.

- **100 % local** : pas de compte, pas de serveur, rien n'est envoyé sur
  Internet.
- **Vos fichiers restent vos fichiers** : de simples `.md` dans le dossier de
  votre choix, lisibles et modifiables avec n'importe quel autre éditeur.
- **Rien n'est supprimé définitivement** : toute suppression passe par la
  corbeille du système.

## Le modèle

**Une conversation = un fichier.** Un bloc-notes libre, en Markdown, sur un
sujet. Il porte quatre métadonnées, et rien d'autre : un **nom**, une **date
de création**, un **état**, et l'**historique** des changements d'état.

```
┌───────────────────────┬──────────────────────────────────────────┐
│ + Nouvelle conversation│ Migration serveur      ● En cours       │
│                        │ Créée le 2026-09-14 · 3 changements     │
│ AUJOURD'HUI            │──────────────────────────────────────────│
│  ● Import CSV          │  H  B  I  </>  •  ☑  ❝  🔗   [Markdown] │
│  ● Migration serveur   │──────────────────────────────────────────│
│                        │ # Migration serveur                      │
│ HIER                   │                                          │
│  ● Point client        │ Le client attend le devis signé.         │
│                        │                                          │
│ 12 SEPTEMBRE           │ ☑ Chiffrer la bascule                    │
│  ● Recrutement         │ ☐ Planifier la fenêtre                   │
├───────────────────────┴──────────────────────────────────────────┤
│ 3 en cours                                          Paramètres    │
└───────────────────────────────────────────────────────────────────┘
```

- **La barre latérale** liste les conversations **groupées par jour de
  création**, la plus récente en haut. Chaque ligne porte une **bulle
  colorée** qui dit son état d'un coup d'œil.
- **Quatre états** : `À faire` (gris), `En cours` (ambre), `À reprendre`
  (rouge), `Terminé` (vert). Un clic sur la bulle en tête de conversation les
  propose ; chaque changement est **daté et inscrit dans le fichier**.
- **L'historique** se déplie sous le titre : quand la conversation a
  commencé, et quand son état a changé.
- **Deux modes d'écriture**, par le bouton en haut à droite. *Rendu visuel* :
  les titres, le gras, le code et les cases à cocher s'affichent mis en
  forme, et la syntaxe réapparaît sur la ligne où se trouve le curseur.
  *Markdown* : le texte brut, tel qu'il est dans le fichier. La barre d'outils
  (titre, gras, italique, code, liste, case, citation, lien) fonctionne dans
  les deux.
- Le corps est **à vous** : l'application ne le réécrit jamais d'elle-même,
  elle ne touche qu'à l'en-tête.

## Installation

Prérequis : **Node.js ≥ 20** et **pnpm 9**. Si `pnpm` n'est pas installé :

```bash
corepack enable pnpm
```

Puis :

```bash
pnpm install
```

## Développement

```bash
pnpm dev          # lance l'application avec rechargement à chaud
pnpm test         # suite Vitest du coeur métier
pnpm test:watch   # la même, en continu
pnpm typecheck    # TypeScript strict sur les trois cibles
pnpm format       # Prettier
```

Au premier lancement, un écran explique le fonctionnement de l'application et
demande où ranger les fichiers. En développement, le lancement au démarrage
n'est jamais appliqué au système.

La mesure mémoire (`app.getAppMetrics()`) est disponible dans
**Paramètres → Mémoire**, uniquement en développement.

## Build et distribution

```bash
pnpm build        # compile main, preload et renderer dans apps/desktop/out
pnpm dist         # build + paquet pour le système courant, dans apps/desktop/release
```

Cibles par système, depuis la machine correspondante :

```bash
pnpm --filter @memolog/desktop dist:mac     # .dmg + .zip
pnpm --filter @memolog/desktop dist:win     # installateur NSIS
pnpm --filter @memolog/desktop dist:linux   # AppImage + .deb
```

### Signature sur macOS

Les paquets sont **volontairement non signés** (`mac.identity: null` dans
`electron-builder.yml`). Sans ce réglage, electron-builder cherche un
certificat *Developer ID Application* dans le trousseau et déclenche une
demande d'autorisation : un compte Apple Developer payant serait nécessaire.

Pour un usage personnel, ce n'est pas utile. Au premier lancement d'un `.dmg`
**téléchargé** depuis une autre machine, macOS affichera un avertissement —
clic droit sur l'app puis « Ouvrir », ou :

```bash
xattr -dr com.apple.quarantine /Applications/Memolog.app
```

Avec un certificat installé :

```bash
CSC_NAME="Developer ID Application: Votre Nom (TEAMID)" \
  pnpm --filter @memolog/desktop dist:mac:signed
```

## Architecture

```
packages/core/            TypeScript pur, sans Electron ni Vue
  src/domain/             types et règles métier ; ne sait rien du stockage
  src/domain/ports.ts     interfaces de persistance (le contrat)
  src/services/           cas d'usage, écrits uniquement contre les ports
  src/adapters/fs/        accès disque et garde-fous de chemins
  src/adapters/markdown/  implémentation Markdown des ports
apps/desktop/
  src/main/               fenêtre, raccourcis, barre système, surveillance, IPC
  src/preload/            API typée exposée via contextBridge
  src/renderer/           interface Vue 3
  src/shared/             types et noms de canaux partagés
```

Le découpage en couches est délibéré : **le domaine et les services ne
connaissent que les ports**. Passer les données dans SQLite ou derrière une API
demanderait d'écrire un nouveau jeu d'adaptateurs et de changer un seul appel,
`createMarkdownStorage`, sans toucher aux règles métier ni à l'interface.

`packages/core` sera réutilisé tel quel par le futur CLI `memolog` et le
serveur MCP : c'est pourquoi il ne dépend ni d'Electron, ni de Vue, ni d'un
état global, et pourquoi l'auteur d'une action (`vous`, `claude`, `externe`)
est un paramètre partout où il apparaît.

## Sécurité

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Le renderer n'accède jamais au système de fichiers : tout passe par des
  appels IPC typés, validés côté principal, qui refusent les chemins absolus,
  les `..` et tout ce qui sortirait du dossier choisi.
- Une seule `BrowserWindow`, masquée et jamais détruite.
- Aucune ressource distante : la politique de sécurité du contenu n'autorise
  que ce qui est embarqué dans l'application.

## Où sont les données

| Quoi | Où |
|---|---|
| Conversations | `<dossier>/conversations/<nom>.md` |
| Notes libres | `<dossier>/…` n'importe où ailleurs |
| Journal d'activité | `<dossier>/.memolog/activite/AAAA-MM-JJ.jsonl` |
| Réglages de l'application | Dossier de configuration de l'OS, `settings.json` |
| Cache d'index (jetable) | Dossier de configuration de l'OS, `index.cache.json` |

Changer de dossier depuis les paramètres propose de déplacer le contenu ;
rien n'est jamais écrasé, et l'ancien dossier n'est pas supprimé.
