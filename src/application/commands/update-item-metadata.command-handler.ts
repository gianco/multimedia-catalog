import type { CatalogItem } from '../../domain/catalog-item.abstract.js';
import { ItemNotFoundError } from '../../domain/item-not-found.error.js';
import type { MetadataCorrections } from '../../domain/metadata.vo.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { CommandHandler } from '../cqrs.interface.js';

/**
 * Manual correction of an item. Only the properties that are present are changed:
 * a missing one keeps its value, `null` clears the author or the publication year.
 */
export type UpdatedMetadataPayload = MetadataCorrections;

export interface UpdateItemMetadataCommand {
  readonly id: string;
  readonly updatedMetadataPayload: UpdatedMetadataPayload;
}

/**
 * Corrects the title, author/artist or publication year of an existing item.
 * It never touches the identifier, the AI classification or the enrichment state.
 */
export class UpdateItemMetadataCommandHandler implements CommandHandler<
  UpdateItemMetadataCommand,
  CatalogItem
> {
  constructor(private readonly repository: CatalogItemRepository) {}

  /**
   * @returns the item as it has been stored after the correction
   * @throws ItemNotFoundError when no item has the given id
   * @throws DomainError when the corrected values are not valid (nothing is written)
   */
  async execute(command: UpdateItemMetadataCommand): Promise<CatalogItem> {
    const item = await this.repository.findById(command.id);
    if (item === null) {
      throw new ItemNotFoundError(command.id);
    }

    item.correctMetadata(command.updatedMetadataPayload);

    await this.repository.update(item);
    return item;
  }
}
