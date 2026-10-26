import type { CatalogItem } from '../../domain/catalog-item.abstract.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { QueryHandler } from '../cqrs.interface.js';

export type GetAllItemsQuery = Record<string, never>;

/** Returns every item of the catalog. */
export class GetAllItemsQueryHandler implements QueryHandler<GetAllItemsQuery, CatalogItem[]> {
  constructor(private readonly repository: CatalogItemRepository) {}

  /** The query carries no parameters, so the handler can be invoked as `execute()`. */
  async execute(): Promise<CatalogItem[]> {
    return this.repository.findAll();
  }
}
