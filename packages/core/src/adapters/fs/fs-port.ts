/**
 * Port système de fichiers.
 *
 * Aucun module du coeur n'importe `node:fs` : tout passe par cette interface.
 * C'est ce qui rend la logique testable en mémoire et réutilisable ailleurs
 * (CLI, serveur MCP) sans dépendre de l'environnement d'Electron.
 * Tous les chemins reçus ici sont **absolus** et déjà validés par `paths.ts`.
 */
export interface FileStat {
  mtimeMs: number
  size: number
  kind: 'file' | 'dir'
}

export interface DirEntry {
  name: string
  kind: 'file' | 'dir'
}

export interface FileSystem {
  /** Contenu UTF-8. Rejette avec une MemologError `not-found` si absent. */
  readFile(absPath: string): Promise<string>
  /** Écriture atomique attendue (fichier temporaire puis renommage). */
  writeFile(absPath: string, content: string): Promise<void>
  /** `null` si le chemin n'existe pas. */
  stat(absPath: string): Promise<FileStat | null>
  readDir(absPath: string): Promise<DirEntry[]>
  /** Crée le dossier et ses parents ; ne fait rien s'il existe déjà. */
  mkdir(absPath: string): Promise<void>
  /** Renomme ou déplace. Doit échouer si la destination existe déjà. */
  rename(fromAbs: string, toAbs: string): Promise<void>
  /** Envoie à la corbeille du système. Jamais de suppression définitive. */
  trash(absPath: string): Promise<void>
}
