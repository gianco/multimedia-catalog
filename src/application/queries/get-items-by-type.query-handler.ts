import type { CatalogItem } from '../../domain/catalog-item.abstract.js';
import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { QueryHandler } from '../cqrs.interface.js';

export interface GetItemsByTypeQuery {
  /** Item kind: `book`, `vinyl`, `cd`, `video-file` or `audio-file`. */
  readonly type: string;
}

/** Returns the items of a single kind. */
export class GetItemsByTypeQueryHandler implements QueryHandler<
  GetItemsByTypeQuery,
  CatalogItem[]
> {
  constructor(private readonly repository: CatalogItemRepository) {}

  async execute(query: GetItemsByTypeQuery): Promise<CatalogItem[]> {
    return this.repository.findByType(query.type);
  }
}
