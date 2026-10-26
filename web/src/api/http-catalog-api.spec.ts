/**
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';
import { ApiError } from './catalog-api.model';
import { HttpCatalogApi } from './http-catalog-api';

type FetchMock = jest.Mock<typeof fetch>;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const setup = (response: Response | Error) => {
  const fetchMock: FetchMock = jest.fn<typeof fetch>();
  if (response instanceof Error) {
    fetchMock.mockRejectedValue(response);
  } else {
    fetchMock.mockResolvedValue(response);
  }
  return { fetchMock, api: new HttpCatalogApi('http://api.test', fetchMock) };
};

describe('HttpCatalogApi', () => {
  it('lists every item', async () => {
    const { api, fetchMock } = setup(jsonResponse([{ id: '1' }]));

    await expect(api.listItems()).resolves.toEqual([{ id: '1' }]);

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/items', undefined);
  });

  it('lists the items of a type', async () => {
    const { api, fetchMock } = setup(jsonResponse([]));

    await api.listItemsByType('video-file');

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/items/type/video-file', undefined);
  });

  it('gets one item, encoding its id', async () => {
    const { api, fetchMock } = setup(jsonResponse({ id: 'a/b' }));

    await api.getItem('a/b');

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/items/a%2Fb', undefined);
  });

  it('posts a creation request as JSON', async () => {
    const { api, fetchMock } = setup(jsonResponse({ id: '1' }, 201));
    const request = { mode: 'enrich', kind: 'book', identifier: '9780306406157' } as const;

    await expect(api.createItem(request)).resolves.toEqual({ id: '1' });

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  });

  it('puts a correction as JSON to the item URL', async () => {
    const { api, fetchMock } = setup(jsonResponse({ id: 'a/b', title: 'Dune' }));
    const request = { title: 'Dune', author: null, publicationYear: 1965 };

    await expect(api.updateItem('a/b', request)).resolves.toEqual({ id: 'a/b', title: 'Dune' });

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/items/a%2Fb', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  });

  it('deletes an item and resolves without parsing the empty 204 body', async () => {
    const { api, fetchMock } = setup(new Response(null, { status: 204 }));

    await expect(api.deleteItem('a/b')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/items/a%2Fb', { method: 'DELETE' });
  });

  it('turns a failed deletion into an ApiError', async () => {
    const { api } = setup(
      jsonResponse({ error: { code: 'not_found', message: 'Item "x" not found.' } }, 404),
    );

    await expect(api.deleteItem('x')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Item "x" not found.',
    });
  });

  it('turns a failed update into an ApiError with the domain message', async () => {
    const { api } = setup(
      jsonResponse(
        { error: { code: 'domain_violation', message: 'Metadata: invalid title.' } },
        422,
      ),
    );

    await expect(api.updateItem('x', { title: ' ' })).rejects.toMatchObject({
      status: 422,
      code: 'domain_violation',
    });
  });

  it('turns an error response into an ApiError with the backend code and message', async () => {
    const { api } = setup(
      jsonResponse({ error: { code: 'domain_violation', message: 'Invalid ISBN.' } }, 422),
    );

    const failure = await api.getItem('x').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 422,
      code: 'domain_violation',
      message: 'Invalid ISBN.',
    });
  });

  it('falls back to a generic ApiError when the error body is not JSON', async () => {
    const { api } = setup(new Response('<html>Bad gateway</html>', { status: 502 }));

    await expect(api.listItems()).rejects.toMatchObject({
      status: 502,
      code: 'unknown_error',
      message: 'The request failed (502).',
    });
  });

  it('reports an unreachable server as a network error', async () => {
    const { api } = setup(new TypeError('fetch failed'));

    await expect(api.listItems()).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
      message: expect.stringMatching(/cannot be reached/),
    });
  });
});
