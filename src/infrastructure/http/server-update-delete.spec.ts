import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import type { Express } from 'express';
import type { AiEnrichmentService } from '../../application/services/ai-enrichment.service.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { SqliteCatalogItemRepository } from '../database/sqlite-catalog-item-repository.js';
import { createHandlers } from './create-handlers.js';
import { createApp } from './server.js';

const MISSING_ID = '3f2b8c1e-9d4a-4b6f-8a1c-2e5d7f9a0b3c';

const manualBook = {
  mode: 'manual',
  kind: 'book',
  identifier: '9780306406157',
  title: 'Dne',
  author: 'F. Herbert',
  publicationYear: 1956,
};

describe('HTTP API - PUT and DELETE /api/items/:id (integration: Express + SQLite in memory)', () => {
  let database: DatabaseSync;
  let ai: { enrich: jest.Mock<AiEnrichmentService['enrich']> };
  let logError: jest.Mock<(error: unknown) => void>;
  let app: Express;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    ai = {
      enrich: jest.fn<AiEnrichmentService['enrich']>().mockResolvedValue(
        new MetadataVo({
          title: 'Dune',
          author: 'Frank Herbert',
          publicationYear: 1965,
          aiClassification: 'Science fiction',
          enrichmentCompleted: true,
        }),
      ),
    };
    logError = jest.fn();
    app = createApp(createHandlers(new SqliteCatalogItemRepository(database), ai), { logError });
  });

  afterEach(() => {
    database.close();
  });

  const create = async (body: object = manualBook): Promise<{ id: string }> =>
    (await request(app).post('/api/items').send(body)).body as { id: string };
  const rowOf = (id: string): Record<string, unknown> | undefined => {
    const row = database.prepare('SELECT * FROM catalog_items WHERE id = ?').get(id);
    return row === undefined ? undefined : { ...row };
  };

  describe('PUT /api/items/:id', () => {
    it('corrects the title, the author and the year and answers with the updated item', async () => {
      const { id } = await create();

      const response = await request(app)
        .put(`/api/items/${id}`)
        .send({ title: 'Dune', author: 'Frank Herbert', publicationYear: 1965 });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual({
        id,
        kind: 'book',
        title: 'Dune',
        author: 'Frank Herbert',
        publicationYear: 1965,
        aiClassification: null,
        enrichmentCompleted: false,
        identifier: '9780306406157',
      });
    });

    it('writes the correction to the database row', async () => {
      const { id } = await create();

      await request(app).put(`/api/items/${id}`).send({ title: 'Dune', publicationYear: 1965 });

      expect(rowOf(id)).toMatchObject({
        title: 'Dune',
        author: 'F. Herbert',
        publication_year: 1965,
      });
    });

    it('makes the correction visible to every read endpoint', async () => {
      const { id } = await create();

      await request(app).put(`/api/items/${id}`).send({ title: 'Dune' });

      expect((await request(app).get(`/api/items/${id}`)).body.title).toBe('Dune');
      expect((await request(app).get('/api/items')).body[0].title).toBe('Dune');
      expect((await request(app).get('/api/items/type/book')).body[0].title).toBe('Dune');
    });

    it('changes only the fields that are sent', async () => {
      const { id } = await create();

      const response = await request(app).put(`/api/items/${id}`).send({ title: 'Dune' });

      expect(response.body).toMatchObject({
        title: 'Dune',
        author: 'F. Herbert',
        publicationYear: 1956,
      });
    });

    it('clears the author and the year when they are sent as null', async () => {
      const { id } = await create();

      const response = await request(app)
        .put(`/api/items/${id}`)
        .send({ author: null, publicationYear: null });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ author: null, publicationYear: null });
      expect(rowOf(id)).toMatchObject({ author: null, publication_year: null });
    });

    it('keeps the AI classification and the enrichment state of an enriched item', async () => {
      const { id } = await create({ mode: 'enrich', kind: 'book', identifier: '9780306406157' });

      const response = await request(app).put(`/api/items/${id}`).send({ title: 'Dune (1st ed.)' });

      expect(response.body).toMatchObject({
        title: 'Dune (1st ed.)',
        aiClassification: 'Science fiction',
        enrichmentCompleted: true,
      });
    });

    it('does not call the AI', async () => {
      const { id } = await create();

      await request(app).put(`/api/items/${id}`).send({ title: 'Dune' });

      expect(ai.enrich).not.toHaveBeenCalled();
    });

    it('does not change the other items', async () => {
      const first = await create();
      const second = await create({ ...manualBook, title: 'Emma', identifier: '9780131103627' });

      await request(app).put(`/api/items/${first.id}`).send({ title: 'Dune' });

      expect((await request(app).get(`/api/items/${second.id}`)).body.title).toBe('Emma');
    });

    it('answers 404 for an unknown id and creates nothing', async () => {
      const response = await request(app).put(`/api/items/${MISSING_ID}`).send({ title: 'Dune' });

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: 'not_found',
        message: `Item "${MISSING_ID}" not found.`,
      });
      expect((await request(app).get('/api/items')).body).toEqual([]);
    });
  });

  describe('PUT /api/items/:id - invalid requests', () => {
    it.each([
      ['an empty object', {}, /at least one of/],
      ['an array', [{ title: 'Dune' }], /JSON object/],
      ['a numeric title', { title: 42 }, /"title" must be a string/],
      ['a text year', { publicationYear: '1965' }, /"publicationYear"/],
      ['a decimal year', { publicationYear: 1965.5 }, /"publicationYear"/],
      ['the identifier', { identifier: '9780131103627' }, /"identifier" cannot be updated/],
      ['the kind', { kind: 'cd' }, /"kind" cannot be updated/],
      ['the id', { id: MISSING_ID }, /"id" cannot be updated/],
      ['the AI classification', { aiClassification: 'Rock' }, /"aiClassification" cannot be/],
      ['the enrichment flag', { enrichmentCompleted: true }, /"enrichmentCompleted" cannot be/],
    ])('answers 400 for %s and changes nothing', async (_label, body, message) => {
      const { id } = await create();
      const before = rowOf(id);

      const response = await request(app).put(`/api/items/${id}`).send(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('invalid_request');
      expect(response.body.error.message).toMatch(message);
      expect(rowOf(id)).toEqual(before);
    });

    it('answers 400 for malformed JSON', async () => {
      const { id } = await create();

      const response = await request(app)
        .put(`/api/items/${id}`)
        .set('Content-Type', 'application/json')
        .send('{"title": ');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('invalid_json');
    });

    it('answers 400 when no body is sent', async () => {
      const { id } = await create();

      const response = await request(app).put(`/api/items/${id}`);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('invalid_request');
    });

    it.each([
      ['an empty title', { title: '   ' }, /title/],
      ['an empty author', { author: '' }, /author/],
      ['a year equal to zero', { publicationYear: 0 }, /publication year/],
      ['a year in the far future', { publicationYear: 99999 }, /publication year/],
    ])('answers 422 with the domain message for %s', async (_label, body, message) => {
      const { id } = await create();
      const before = rowOf(id);

      const response = await request(app).put(`/api/items/${id}`).send(body);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('domain_violation');
      expect(response.body.error.message).toMatch(message);
      expect(rowOf(id)).toEqual(before);
    });

    it('rejects a title equal to the path of a local file with 422', async () => {
      const { id } = await create({
        mode: 'manual',
        kind: 'video-file',
        identifier: '/home/user/matrix.mkv',
        title: 'Matrix',
      });

      const response = await request(app)
        .put(`/api/items/${id}`)
        .send({ title: '/home/user/matrix.mkv' });

      expect(response.status).toBe(422);
      expect(response.body.error.message).toMatch(/must not coincide with the title/);
      expect(rowOf(id)).toMatchObject({ title: 'Matrix' });
    });

    it('treats an SQL-looking title as plain text', async () => {
      const { id } = await create();

      const response = await request(app)
        .put(`/api/items/${id}`)
        .send({ title: "x'); DROP TABLE catalog_items; --" });

      expect(response.status).toBe(200);
      expect(response.body.title).toBe("x'); DROP TABLE catalog_items; --");
      expect((await request(app).get('/api/items')).body).toHaveLength(1);
    });

    it('answers 500 without leaking internal details on unexpected failures', async () => {
      const secret = 'SQLITE_IOERR: /var/data/secret.db';
      const handlers = createHandlers(new SqliteCatalogItemRepository(database), ai);
      const brokenApp = createApp(
        { ...handlers, updateItemMetadata: { execute: () => Promise.reject(new Error(secret)) } },
        { logError },
      );

      const response = await request(brokenApp)
        .put(`/api/items/${MISSING_ID}`)
        .send({ title: 'x' });

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('secret.db');
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: secret }));
    });
  });

  describe('DELETE /api/items/:id', () => {
    it('answers 204 with an empty body and removes the row from the database', async () => {
      const { id } = await create();

      const response = await request(app).delete(`/api/items/${id}`);

      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(rowOf(id)).toBeUndefined();
    });

    it('makes the item unreachable from every read endpoint', async () => {
      const { id } = await create();

      await request(app).delete(`/api/items/${id}`);

      expect((await request(app).get(`/api/items/${id}`)).status).toBe(404);
      expect((await request(app).get('/api/items')).body).toEqual([]);
      expect((await request(app).get('/api/items/type/book')).body).toEqual([]);
    });

    it('deletes only the requested item', async () => {
      const first = await create();
      const second = await create({ ...manualBook, title: 'Emma', identifier: '9780131103627' });

      await request(app).delete(`/api/items/${first.id}`);

      const remaining = (await request(app).get('/api/items')).body as Array<{ id: string }>;
      expect(remaining.map((item) => item.id)).toEqual([second.id]);
    });

    it('answers 404 for an unknown id and keeps the other items', async () => {
      await create();

      const response = await request(app).delete(`/api/items/${MISSING_ID}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: 'not_found',
        message: `Item "${MISSING_ID}" not found.`,
      });
      expect((await request(app).get('/api/items')).body).toHaveLength(1);
    });

    it('answers 404 when the same item is deleted twice', async () => {
      const { id } = await create();
      await request(app).delete(`/api/items/${id}`);

      const response = await request(app).delete(`/api/items/${id}`);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });

    it('answers 404 to a later update of the deleted item and does not recreate it', async () => {
      const { id } = await create();
      await request(app).delete(`/api/items/${id}`);

      const response = await request(app).put(`/api/items/${id}`).send({ title: 'Ghost' });

      expect(response.status).toBe(404);
      expect(rowOf(id)).toBeUndefined();
    });

    it('treats SQL-looking ids as plain data and deletes nothing', async () => {
      await create();

      const response = await request(app).delete(`/api/items/${encodeURIComponent("' OR '1'='1")}`);

      expect(response.status).toBe(404);
      expect((await request(app).get('/api/items')).body).toHaveLength(1);
    });

    it('answers 500 without leaking internal details on unexpected failures', async () => {
      const secret = 'SQLITE_BUSY: /var/data/secret.db';
      const handlers = createHandlers(new SqliteCatalogItemRepository(database), ai);
      const brokenApp = createApp(
        { ...handlers, deleteItem: { execute: () => Promise.reject(new Error(secret)) } },
        { logError },
      );

      const response = await request(brokenApp).delete(`/api/items/${MISSING_ID}`);

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('secret.db');
      expect(logError).toHaveBeenCalledTimes(1);
    });
  });
});
