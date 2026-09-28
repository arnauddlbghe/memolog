/**
 * `.memolog/state.json` : le peu d'état qui appartient aux **données** et non
 * à l'application. Aujourd'hui, uniquement le compteur d'identifiants de
 * tâches, qui doit suivre le dossier s'il est déplacé ou sauvegardé.
 */
import { joinRel } from '../fs/paths.js'
import type { RelPath } from '../../domain/types.js'
import { abs, type Vault } from '../fs/vault.js'

export const MEMOLOG_DIR = '.memolog'
export const STATE_FILE: RelPath = joinRel(MEMOLOG_DIR, 'state.json')

export interface VaultState {
  /** Prochain identifiant de tâche à attribuer. Jamais décrémenté. */
  nextTaskId: number
}

const DEFAULT_STATE: VaultState = { nextTaskId: 1 }

export async function readVaultState(vault: Vault): Promise<VaultState> {
  try {
    const raw = await vault.fs.readFile(abs(vault, STATE_FILE))
    const parsed = JSON.parse(raw) as Partial<VaultState>
    const next = Number(parsed.nextTaskId)
    return { nextTaskId: Number.isFinite(next) && next > 0 ? Math.floor(next) : 1 }
  } catch {
    return { ...DEFAULT_STATE }
  }
}

export async function writeVaultState(vault: Vault, state: VaultState): Promise<void> {
  await vault.fs.mkdir(abs(vault, MEMOLOG_DIR))
  await vault.fs.writeFile(abs(vault, STATE_FILE), `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * Le compteur est un plancher, pas une vérité absolue : si le fichier d'état
 * a disparu, on repart au-dessus du plus grand identifiant déjà écrit dans
 * les fichiers de tâches, pour ne jamais réutiliser un identifiant.
 */
export function raiseFloor(state: VaultState, highestSeenId: number): VaultState {
  return state.nextTaskId > highestSeenId ? state : { nextTaskId: highestSeenId + 1 }
}
