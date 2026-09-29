/**
 * Le domaine seul : types et règles, sans aucune dépendance au système de
 * fichiers ni à Node.
 *
 * C'est ce point d'entrée qu'utilisent les consommateurs qui ne doivent pas
 * toucher au stockage — au premier rang desquels le renderer d'Electron, qui
 * n'a accès à rien d'autre que l'IPC.
 */
export * from './errors.js'
export * from './types.js'
export * from './dates.js'
export * from './states.js'
export * from './activity.js'
export * from './ports.js'
