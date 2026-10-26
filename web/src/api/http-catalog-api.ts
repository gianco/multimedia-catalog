import { ApiError } from './catalog-api.model';
import type { CatalogApi, CreateItemRequest, Item, UpdateItemRequest } from './catalog-api.model';
import type { ItemKind } from '../model/item-kinds.model';

type FetchFunction = typeof fetch;

interface ErrorBody {
  readonly error?: { readonly code?: unknown; readonly message?: unknown };
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorBody;
    const code = typeof body.error?.code === 'string' ? body.error.code : 'unknown_error';
    const message =
      typeof body.error?.message === 'string'
        ? body.error.message
        : `The request failed with status ${response.status}.`;
    return new ApiError(response.status, code, message);
  } catch {
    return new ApiError(
      response.status,
      'unknown_error',
      `The request failed (${response.status}).`,
    );
  }
}

/** `CatalogApi` implemented on top of the REST endpoints of the backend. */
export class HttpCatalogApi implements CatalogApi {
  constructor(
    private readonly baseUrl: string = '',
    private readonly fetchFunction: FetchFunction = (...args) => fetch(...args),
  ) {}

  listItems(): Promise<Item[]> {
    return this.request<Item[]>('/api/items');
  }

  listItemsByType(kind: ItemKind): Promise<Item[]> {
    return this.request<Item[]>(`/api/items/type/${encodeURIComponent(kind)}`);
  }

  getItem(id: string): Promise<Item> {
    return this.request<Item>(`/api/items/${encodeURIComponent(id)}`);
  }

  createItem(request: CreateItemRequest): Promise<Item> {
    return this.request<Item>('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  }

  updateItem(id: string, request: UpdateItemRequest): Promise<Item> {
    return this.request<Item>(`/api/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  }

  async deleteItem(id: string): Promise<void> {
    await this.request<void>(`/api/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFunction(`${this.baseUrl}${path}`, init);
    } catch {
      throw new ApiError(
        0,
        'network_error',
        'The server cannot be reached. Check your connection.',
      );
    }
    if (!response.ok) {
      throw await toApiError(response);
    }
    // 204 No Content (DELETE) has no body to parse.
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
