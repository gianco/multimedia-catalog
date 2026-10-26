import { jest } from '@jest/globals';
import { ApiError } from '../api/catalog-api.model';
import type { CatalogApi, CreateItemRequest, Item } from '../api/catalog-api.model';

export type MockedCatalogApi = {
  [K in keyof CatalogApi]: jest.Mock<CatalogApi[K]>;
};

/** Test double of the backend: no network, every call is a Jest mock. */
export function createApiMock(items: readonly Item[] = []): MockedCatalogApi {
  return {
    listItems: jest.fn<CatalogApi['listItems']>().mockResolvedValue([...items]),
    listItemsByType: jest
      .fn<CatalogApi['listItemsByType']>()
      .mockImplementation(async (kind) => items.filter((item) => item.kind === kind)),
    getItem: jest.fn<CatalogApi['getItem']>().mockImplementation(async (id) => {
      const found = items.find((item) => item.id === id);
      if (found === undefined) {
        throw new ApiError(404, 'not_found', `Item "${id}" not found.`);
      }
      return found;
    }),
    createItem: jest
      .fn<CatalogApi['createItem']>()
      .mockImplementation(async (request) => itemFromRequest(request)),
    updateItem: jest.fn<CatalogApi['updateItem']>().mockImplementation(async (id, request) => {
      const found = items.find((item) => item.id === id);
      if (found === undefined) {
        throw new ApiError(404, 'not_found', `Item "${id}" not found.`);
      }
      return { ...found, ...request };
    }),
    deleteItem: jest.fn<CatalogApi['deleteItem']>().mockResolvedValue(undefined),
  };
}

export function buildItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    kind: 'book',
    title: 'Dune',
    author: 'Frank Herbert',
    publicationYear: 1965,
    aiClassification: 'Science fiction',
    enrichmentCompleted: true,
    identifier: '9780306406157',
    ...overrides,
  };
}

function itemFromRequest(request: CreateItemRequest): Item {
  if (request.mode === 'manual') {
    return buildItem({
      kind: request.kind,
      title: request.title,
      identifier: request.identifier,
      author: request.author ?? null,
      publicationYear: request.publicationYear ?? null,
      aiClassification: null,
      enrichmentCompleted: false,
    });
  }
  return buildItem({
    kind: request.kind,
    title: 'Enriched title',
    identifier: request.mode === 'enrich' ? request.identifier : request.absolutePath,
  });
}

/** A promise that stays pending until `resolve` is called: lets tests observe loading states. */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
