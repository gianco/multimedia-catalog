import type { CatalogItemKind } from '../../domain/catalog-item.abstract.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { CommandHandler } from '../cqrs.interface.js';
import { createCatalogItem, parseIdentity } from '../factories/catalog-item.factory.js';

/** Full manual input: every value is provided by the user, no AI is involved. */
export interface CreateItemManuallyCommand {
  readonly kind: CatalogItemKind;
  /** ISBN, barcode or absolute path, depending on the kind. */
  readonly identifier: string;
  readonly title: string;
  readonly author?: string | null;
  readonly publicationYear?: number | null;
  readonly aiClassification?: string | null;
  readonly enrichmentCompleted?: boolean;
}

/**
 * Persists an item exactly as typed by the user.
 * Unlike the other commands it needs no `AiEnrichmentService`, so it is not injected.
 */
export class CreateItemManuallyCommandHandler implements CommandHandler<
  CreateItemManuallyCommand,
  string
> {
  constructor(private readonly repository: CatalogItemRepository) {}

  /**
   * @returns the id of the new item
   * @throws DomainError when the identifier or any metadata is invalid (nothing is saved)
   */
  async execute(command: CreateItemManuallyCommand): Promise<string> {
    const identity = parseIdentity(command.kind, command.identifier);
    const metadata = new MetadataVo({
      title: command.title,
      author: command.author,
      publicationYear: command.publicationYear,
      aiClassification: command.aiClassification,
      enrichmentCompleted: command.enrichmentCompleted,
    });
    const item = createCatalogItem(command.kind, identity, metadata);

    await this.repository.save(item);
    return item.id;
  }
}
