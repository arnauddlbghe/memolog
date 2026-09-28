# Memolog

Prise de notes personnelle, locale et rapide. Un raccourci clavier global
affiche la fenêtre par-dessus tout le reste, le même raccourci la masque.

- **100 % local** : pas de compte, pas de serveur, rien n'est envoyé sur
  Internet.
- **Vos fichiers restent vos fichiers** : de simples `.md` dans le dossier de
  votre choix, lisibles et modifiables avec n'importe quel autre éditeur.
- **Rien n'est supprimé définitivement** : toute suppression passe par la
  corbeille du système.

## Ce que fait l'application

| Vue | Contenu |
|---|---|
| **Jour** | Les notes libres de la journée et l'activité (tâches, éditions) fusionnées dans l'ordre chronologique, avec navigation entre les jours. |
| **Notes** | Arborescence des dossiers et éditeur Markdown avec sauvegarde automatique. |
| **Tâches** | Tâches actives filtrables par état et par projet, et onglet « qui dorment » pour celles qu'on a laissées de côté. |
| **Projets** | Tous les projets — sections de `taches.md`, tags du journal, fiches — triés par dernière activité. |
| **Paramètres** | Dossier de rangement, raccourcis, démarrage automatique, thème, archivage. |

L'écran est encadré par deux barres, chacune avec son rôle :

- **en haut, la recherche** : plein texte sur le titre et le contenu,
  tolérante aux fautes et aux accents, résultats à la frappe
  (`Cmd/Ctrl + K`) ;
- **en bas, le composeur** : deux modes. *Tâche* prend un titre, un projet et
  une **description** libre sur plusieurs lignes (`Cmd/Ctrl + T`) ; *Note du
  jour* ajoute une entrée horodatée au journal, ses lignes suivantes
  devenant des sous-puces (`Cmd/Ctrl + N`).

Dans l'éditeur, `/t Relancer l'infra #infra` suivi d'Entrée crée la tâche et
remplace la ligne par une référence `@tNN` ; taper `@` propose les tâches
actives.

Le **format des fichiers** est documenté dans [`docs/format.md`](docs/format.md).
C'est le contrat : il vaut pour l'application comme pour les futures
intégrations (CLI, serveur MCP, hook Claude Code).

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
demande où ranger les notes. En développement, le lancement au démarrage n'est
jamais appliqué au système.

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
  les `..` et tout ce qui sortirait du dossier de notes.
- Une seule `BrowserWindow`, masquée et jamais détruite.
- Aucune ressource distante : la politique de sécurité du contenu n'autorise
  que ce qui est embarqué dans l'application.

## Où sont les données

| Quoi | Où |
|---|---|
| Notes, journal, tâches, fiches projet | Le dossier choisi (par défaut `~/Memolog`) |
| Journal d'activité | `<dossier>/.memolog/activite/AAAA-MM-JJ.jsonl` |
| Compteur d'identifiants de tâches | `<dossier>/.memolog/state.json` |
| Réglages de l'application | Dossier de configuration de l'OS, `settings.json` |
| Cache d'index (jetable) | Dossier de configuration de l'OS, `index.cache.json` |

Changer de dossier depuis les paramètres propose de déplacer le contenu ;
rien n'est jamais écrasé, et l'ancien dossier n'est pas supprimé.
