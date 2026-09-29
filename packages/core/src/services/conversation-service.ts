/**
 * Cas d'usage des conversations : créer, écrire, changer l'état.
 *
 * Écrit **uniquement contre les ports** : ce service ne sait pas si les
 * conversations finissent dans des fichiers Markdown, dans SQLite ou
 * derrière une API. C'est ici que vivent les enchaînements — changer un état
 * puis journaliser — et c'est ici que le futur CLI et le serveur MCP
 * entreront, en changeant seulement l'auteur.
 */
import type { ActivityLog, ConversationRepository, NoteIndex } from '../domain/ports.js'
import type {
  ActivityAuthor,
  Conversation,
  ConversationState,
  ConversationSummary,
  WriteResult
} from '../domain/types.js'

export interface ConversationServiceDeps {
  conversations: ConversationRepository
  activity: ActivityLog
  index: NoteIndex
  /** Injectable pour les tests ; par défaut, l'heure courante. */
  clock?: () => Date
}

export interface ActionContext {
  /** Qui agit. Par défaut l'utilisateur dans l'application. */
  author?: ActivityAuthor
  at?: Date
}

export class ConversationService {
  private readonly conversations: ConversationRepository
  private readonly activity: ActivityLog
  private readonly index: NoteIndex
  private readonly clock: () => Date

  constructor(deps: ConversationServiceDeps) {
    this.conversations = deps.conversations
    this.activity = deps.activity
    this.index = deps.index
    this.clock = deps.clock ?? ((): Date => new Date())
  }

  private context(context: ActionContext = {}): { at: Date; author: ActivityAuthor } {
    return { at: context.at ?? this.clock(), author: context.author ?? 'vous' }
  }

  /** Les conversations, telles que l'index les connaît. */
  list(): ConversationSummary[] {
    return this.index.conversations()
  }

  /** Jours de création, du plus récent au plus ancien. */
  days(): string[] {
    return this.index.days()
  }

  read(path: string): Promise<Conversation> {
    return this.conversations.read(path)
  }

  async create(name: string, context: ActionContext = {}): Promise<ConversationSummary> {
    const { at, author } = this.context(context)
    const created = await this.conversations.create(name)

    await this.activity.append(
      author,
      { type: 'conversation.creee', fichier: created.path, nom: created.name },
      at
    )
    return created
  }

  /** Le corps appartient à l'utilisateur : on l'enregistre tel quel. */
  setContent(path: string, content: string, baseMtimeMs?: number): Promise<WriteResult> {
    return this.conversations.setContent(path, content, baseMtimeMs)
  }

  /**
   * Change l'état. C'est le geste de suivi de l'application : il est daté,
   * inscrit dans l'historique du fichier, et journalisé.
   */
  async setState(
    path: string,
    state: ConversationState,
    context: ActionContext = {}
  ): Promise<Conversation> {
    const { at, author } = this.context(context)
    const before = await this.conversations.read(path)
    if (before.state === state) return before

    const after = await this.conversations.setState(path, state, at)
    await this.activity.append(
      author,
      {
        type: 'conversation.etat',
        fichier: path,
        nom: after.name,
        de: before.state,
        vers: state
      },
      at
    )
    return after
  }

  rename(path: string, name: string): Promise<string> {
    return this.conversations.rename(path, name)
  }

  remove(path: string): Promise<void> {
    return this.conversations.remove(path)
  }
}
