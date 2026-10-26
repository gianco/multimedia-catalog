import { DomainError } from '../../domain/domain.error.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { CommandHandler } from '../cqrs.interface.js';
import {
  createCatalogItem,
  isCodeIdentifiedKind,
  parseIdentity,
} from '../factories/catalog-item.factory.js';
import type { CodeIdentifiedKind } from '../factories/catalog-item.factory.js';
import type { AiEnrichmentHints, AiEnrichmentService } from '../services/ai-enrichment.service.js';

/** Creates a book, vinyl or CD starting only from its ISBN/barcode. */
export interface EnrichAndCreateItemCommand {
  readonly kind: CodeIdentifiedKind;
  /** ISBN for books, barcode for vinyls and CDs. */
  readonly identifier: string;
  /** Optional details already known, to help the AI disambiguate. */
  readonly hints?: AiEnrichmentHints;
}

export class EnrichAndCreateItemCommandHandler implements CommandHandler<
  EnrichAndCreateItemCommand,
  string
> {
  constructor(
    private readonly repository: CatalogItemRepository,
    private readonly aiEnrichmentService: AiEnrichmentService,
  ) {}

  /**
   * @returns the id of the new item
   * @throws DomainError when the kind or identifier is invalid (the AI is not called)
   * @throws AiEnrichmentError when the AI fails or answers with corrupted data (nothing is saved)
   */
  async execute(command: EnrichAndCreateItemCommand): Promise<string> {
    if (!isCodeIdentifiedKind(command.kind)) {
      throw new DomainError(
        `Kind "${String(command.kind)}" cannot be created from an ISBN or barcode.`,
      );
    }

    // Validate first: a malformed code must never cost an AI call.
    const identity = parseIdentity(command.kind, command.identifier);

    const metadata = await this.aiEnrichmentService.enrich({
      kind: command.kind,
      identifier: identity.value,
      ...(command.hints !== undefined && { hints: command.hints }),
    });

    const item = createCatalogItem(command.kind, identity, metadata);
    await this.repository.save(item);
    return item.id;
  }
}
