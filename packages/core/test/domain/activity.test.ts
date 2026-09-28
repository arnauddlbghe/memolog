import { describe, expect, it } from 'vitest'

import { EditBurstTracker, diffLines } from '../../src/domain/activity.js'

describe('diffLines', () => {
  it('ne voit rien quand rien ne change', () => {
    expect(diffLines('a\nb\n', 'a\nb\n')).toBeNull()
  })

  it('situe la première ligne modifiée et en donne le contenu', () => {
    const diff = diffLines('a\nb\nc\n', 'a\nB modifié\nc\n')
    expect(diff).toEqual({ firstLine: 2, lastLine: 2, excerpt: 'B modifié' })
  })

  it('compte les lignes ajoutées', () => {
    const diff = diffLines('a\nc\n', 'a\nb1\nb2\nc\n')
    expect(diff).toMatchObject({ firstLine: 2, lastLine: 3, excerpt: 'b1' })
  })

  it('décrit une suppression par le contenu retiré', () => {
    const diff = diffLines('a\nà supprimer\nc\n', 'a\nc\n')
    expect(diff).toMatchObject({ firstLine: 2, excerpt: 'à supprimer' })
  })

  it('tronque un extrait trop long', () => {
    const long = 'x'.repeat(500)
    expect(diffLines('a\n', `${long}\n`)?.excerpt).toHaveLength(200)
  })
})

describe('EditBurstTracker', () => {
  const t = (minutes: number): Date => new Date(2026, 8, 28, 10, minutes)

  it('regroupe les éditions successives d un même fichier', () => {
    const tracker = new EditBurstTracker(10 * 60 * 1000)
    tracker.touch('journal/2026-09-28.md', 'vous', { firstLine: 5, lastLine: 5, excerpt: 'a' }, t(0))
    tracker.touch('journal/2026-09-28.md', 'vous', { firstLine: 7, lastLine: 8, excerpt: 'b' }, t(2))

    const [burst] = tracker.pending()
    expect(tracker.size).toBe(1)
    // Lignes 5, 7 et 8 : trois lignes distinctes touchées.
    expect(burst).toMatchObject({ ligne: 5, lignes: 3, extrait: 'a' })
  })

  it('sépare les rafales par auteur', () => {
    const tracker = new EditBurstTracker()
    tracker.touch('note.md', 'vous', { firstLine: 1, lastLine: 1, excerpt: 'a' }, t(0))
    tracker.touch('note.md', 'externe', { firstLine: 1, lastLine: 1, excerpt: 'a' }, t(0))
    expect(tracker.size).toBe(2)
  })

  it('retient l extrait de la première ligne, même vue après coup', () => {
    const tracker = new EditBurstTracker()
    tracker.touch('note.md', 'vous', { firstLine: 9, lastLine: 9, excerpt: 'tard' }, t(0))
    tracker.touch('note.md', 'vous', { firstLine: 2, lastLine: 2, excerpt: 'tôt' }, t(1))
    expect(tracker.pending()[0]).toMatchObject({ ligne: 2, extrait: 'tôt' })
  })

  it('ne ferme la rafale qu après la fenêtre d inactivité', () => {
    const tracker = new EditBurstTracker(10 * 60 * 1000)
    tracker.touch('note.md', 'vous', { firstLine: 1, lastLine: 1, excerpt: 'a' }, t(0))

    expect(tracker.collectExpired(t(5))).toHaveLength(0)
    expect(tracker.collectExpired(t(10))).toHaveLength(1)
    expect(tracker.size).toBe(0)
  })

  it('vide tout à la demande, pour la fermeture de l application', () => {
    const tracker = new EditBurstTracker()
    tracker.touch('a.md', 'vous', { firstLine: 1, lastLine: 1, excerpt: '' }, t(0))
    tracker.touch('b.md', 'vous', { firstLine: 1, lastLine: 1, excerpt: '' }, t(0))
    expect(tracker.flushAll()).toHaveLength(2)
    expect(tracker.size).toBe(0)
  })
})
