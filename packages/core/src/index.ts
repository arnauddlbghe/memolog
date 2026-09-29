/**
 * Surface publique de @memolog/core.
 *
 * L'organisation reflète l'architecture :
 *
 * - `domain/`   : types et règles métier purs, sans notion de stockage ;
 * - `domain/ports.ts` : les interfaces de persistance ;
 * - `services/` : les cas d'usage, écrits uniquement contre les ports ;
 * - `adapters/` : les implémentations — aujourd'hui des fichiers Markdown.
 *
 * Rien ici ne dépend d'Electron ni de Vue : le futur CLI `memolog` et le
 * serveur MCP réutiliseront ce paquet tel quel.
 */

// Domaine
export * from './domain/errors.js'
export * from './domain/types.js'
export * from './domain/dates.js'
export * from './domain/states.js'
export * from './domain/activity.js'
export * from './domain/ports.js'

// Services
export * from './services/conversation-service.js'

// Adaptateurs : système de fichiers
export * from './adapters/fs/fs-port.js'
export * from './adapters/fs/paths.js'
export * from './adapters/fs/vault.js'

// Adaptateurs : stockage Markdown
export * from './adapters/markdown/storage.js'
export * from './adapters/markdown/frontmatter.js'
export * from './adapters/markdown/notes.js'
export * from './adapters/markdown/note-repository.js'
export { listDir, walkNotes, summarizeVault, isVisibleEntry } from './adapters/markdown/tree.js'
export * from './adapters/markdown/conversation-file.js'
export * from './adapters/markdown/conversation-repository.js'
export * from './adapters/markdown/activity-jsonl.js'
export * from './adapters/markdown/search.js'
export * from './adapters/markdown/note-index.js'
