import type { CatalogItem } from '../../domain/catalog-item.abstract.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { QueryHandler } from '../cqrs.interface.js';

export interface GetItemByIdQuery {
  readonly id: string;
}

/** Returns a single item, or `null` when it does not exist. */
export class GetItemByIdQueryHandler implements QueryHandler<GetItemByIdQuery, CatalogItem | null> {
  constructor(private readonly repository: CatalogItemRepository) {}

  async execute(query: GetItemByIdQuery): Promise<CatalogItem | null> {
    return this.repository.findById(query.id);
  }
}
