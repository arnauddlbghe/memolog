import type { FileStat, FileSystem } from './fs-port.js'
import { resolveInRoot } from './paths.js'

/**
 * Tout le coeur métier travaille sur un « vault » : une racine sur le disque
 * plus une implémentation du port système de fichiers. Aucun état global,
 * pour qu'un futur CLI puisse en ouvrir plusieurs dans le même processus.
 */
export interface Vault {
  readonly root: string
  readonly fs: FileSystem
}

export function createVault(root: string, fs: FileSystem): Vault {
  return { root, fs }
}

/** Raccourci interne : chemin absolu validé pour une entrée du vault. */
export function abs(vault: Vault, relPath: string): string {
  return resolveInRoot(vault.root, relPath)
}

export async function statRel(vault: Vault, relPath: string): Promise<FileStat | null> {
  return vault.fs.stat(abs(vault, relPath))
}

export async function existsRel(vault: Vault, relPath: string): Promise<boolean> {
  return (await statRel(vault, relPath)) !== null
}
