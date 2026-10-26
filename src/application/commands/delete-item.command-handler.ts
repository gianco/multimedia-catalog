import type { CatalogItemRepository } from '../../domain/repository/catalog-item-repository.interface.js';
import type { CommandHandler } from '../cqrs.interface.js';

export interface DeleteItemCommand {
  readonly id: string;
}

/** Removes a single item from the catalog. */
export class DeleteItemCommandHandler implements CommandHandler<DeleteItemCommand> {
  constructor(private readonly repository: CatalogItemRepository) {}

  /** @throws ItemNotFoundError when no item has the given id */
  async execute(command: DeleteItemCommand): Promise<void> {
    await this.repository.delete(command.id);
  }
}
