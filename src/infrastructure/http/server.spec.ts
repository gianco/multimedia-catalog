import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import type { Express } from 'express';
import { AiEnrichmentError } from '../../application/services/ai-enrichment.service.js';
import type { AiEnrichmentService } from '../../application/services/ai-enrichment.service.js';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { SqliteCatalogItemRepository } from '../database/sqlite-catalog-item-repository.js';
import { createHandlers } from './create-handlers.js';
import { createApp } from './server.js';

const enrichedMetadata = new MetadataVo({
  title: 'Dune',
  author: 'Frank Herbert',
  publicationYear: 1965,
  aiClassification: 'Science fiction',
  enrichmentCompleted: true,
});

const manualBook = {
  mode: 'manual',
  kind: 'book',
  identifier: '978-0-306-40615-7',
  title: 'Dune',
  author: 'Frank Herbert',
  publicationYear: 1965,
};

describe('HTTP API (integration: Express + SQLite in memory + mocked AI)', () => {
  let database: DatabaseSync;
  let ai: { enrich: jest.Mock<AiEnrichmentService['enrich']> };
  let logError: jest.Mock<(error: unknown) => void>;
  let app: Express;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    ai = { enrich: jest.fn<AiEnrichmentService['enrich']>().mockResolvedValue(enrichedMetadata) };
    logError = jest.fn();
    app = createApp(createHandlers(new SqliteCatalogItemRepository(database), ai), { logError });
  });

  afterEach(() => {
    database.close();
  });

  const create = (body: unknown) =>
    request(app)
      .post('/api/items')
      .send(body as object);
  const expectCatalogEmpty = async (): Promise<void> => {
    await expect(request(app).get('/api/items')).resolves.toMatchObject({ body: [] });
  };

  describe('POST /api/items - success', () => {
    it('creates an item from manual input and answers 201 with a Location header', async () => {
      const response = await create(manualBook);

      expect(response.status).toBe(201);
      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        kind: 'book',
        title: 'Dune',
        author: 'Frank Herbert',
        publicationYear: 1965,
        aiClassification: null,
        enrichmentCompleted: false,
        identifier: '9780306406157',
      });
      expect(response.headers['location']).toBe(`/api/items/${response.body.id}`);
      expect(ai.enrich).not.toHaveBeenCalled();
    });

    it('persists the created item so that it can be read back', async () => {
      const created = await create(manualBook);

      const response = await request(app).get(`/api/items/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(created.body);
    });

    it('creates an enriched book from an ISBN through the AI service', async () => {
      const response = await create({ mode: 'enrich', kind: 'book', identifier: '9780306406157' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        kind: 'book',
        title: 'Dune',
        aiClassification: 'Science fiction',
        enrichmentCompleted: true,
        identifier: '9780306406157',
      });
      expect(ai.enrich).toHaveBeenCalledWith({ kind: 'book', identifier: '9780306406157' });
    });

    it('creates an enriched vinyl from a barcode', async () => {
      const response = await create({ mode: 'enrich', kind: 'vinyl', identifier: '036000291452' });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ kind: 'vinyl', identifier: '036000291452' });
    });

    it('creates an item from a local file path, using the file name as AI hint', async () => {
      const path = '/home/user/Music/Queen - Bohemian_Rhapsody.flac';

      const response = await create({ mode: 'scan', kind: 'audio-file', absolutePath: path });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ kind: 'audio-file', identifier: path });
      expect(ai.enrich).toHaveBeenCalledWith(
        expect.objectContaining({ hints: { title: 'Bohemian Rhapsody', author: 'Queen' } }),
      );
    });
  });

  describe('POST /api/items - 400 invalid request', () => {
    it.each([
      ['a missing mode', { kind: 'book', identifier: '9780306406157' }, /"mode"/],
      ['an unknown mode', { mode: 'magic', kind: 'book' }, /"mode"/],
      ['a manual item with an unknown kind', { ...manualBook, kind: 'magazine' }, /"kind"/],
      ['a manual item without title', { ...manualBook, title: undefined }, /"title"/],
      ['a non-string title', { ...manualBook, title: 42 }, /"title"/],
      ['a decimal year', { ...manualBook, publicationYear: 1965.5 }, /"publicationYear"/],
      ['a text year', { ...manualBook, publicationYear: '1965' }, /"publicationYear"/],
      ['an enrich request for a file kind', { mode: 'enrich', kind: 'video-file' }, /book, vinyl/],
      ['an enrich request without identifier', { mode: 'enrich', kind: 'book' }, /"identifier"/],
      ['a scan request for a book', { mode: 'scan', kind: 'book' }, /video-file, audio-file/],
      ['a scan request without path', { mode: 'scan', kind: 'audio-file' }, /"absolutePath"/],
      ['an array body', [manualBook], /JSON object/],
    ])('answers 400 for %s', async (_label, body, message) => {
      const response = await create(body);

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('invalid_request');
      expect(response.body.error.message).toMatch(message);
      await expectCatalogEmpty();
    });

    it('answers 400 for malformed JSON', async () => {
      const response = await request(app)
        .post('/api/items')
        .set('Content-Type', 'application/json')
        .send('{"mode": ');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('invalid_json');
    });

    it('answers 400 when no body is sent', async () => {
      const response = await request(app).post('/api/items');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('invalid_request');
    });

    it('answers 413 when the body is too large', async () => {
      const response = await create({ ...manualBook, title: 'x'.repeat(200_000) });

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('payload_too_large');
    });
  });

  describe('POST /api/items - domain and AI failures', () => {
    it.each([
      ['an invalid ISBN', { ...manualBook, identifier: '1234567890' }, /ISBN/],
      ['an empty title', { ...manualBook, title: '   ' }, /title/],
      ['an invalid year', { ...manualBook, publicationYear: 0 }, /publication year/],
      [
        'a relative path',
        { mode: 'scan', kind: 'audio-file', absolutePath: 'music/a.flac' },
        /must start with "\//,
      ],
    ])('answers 422 with the domain message for %s', async (_label, body, message) => {
      const response = await create(body);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('domain_violation');
      expect(response.body.error.message).toMatch(message);
      await expectCatalogEmpty();
    });

    it('does not call the AI when the identifier is invalid', async () => {
      await create({ mode: 'enrich', kind: 'book', identifier: '123' });

      expect(ai.enrich).not.toHaveBeenCalled();
    });

    it('answers 502 and saves nothing when the AI fails', async () => {
      ai.enrich.mockRejectedValue(new AiEnrichmentError('The AI answer is not valid JSON.'));

      const response = await create({ mode: 'enrich', kind: 'book', identifier: '9780306406157' });

      expect(response.status).toBe(502);
      expect(response.body.error).toEqual({
        code: 'ai_enrichment_failed',
        message: 'The AI answer is not valid JSON.',
      });
      expect(logError).toHaveBeenCalledTimes(1);
      await expectCatalogEmpty();
    });

    it('answers 500 without leaking internal details on unexpected failures', async () => {
      const secret = 'SQLITE_CORRUPT: /var/data/secret.db';
      const handlers = createHandlers(new SqliteCatalogItemRepository(database), ai);
      const brokenApp = createApp(
        { ...handlers, createItemManually: { execute: () => Promise.reject(new Error(secret)) } },
        { logError },
      );

      const response = await request(brokenApp).post('/api/items').send(manualBook);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: { code: 'internal_error', message: 'Internal server error.' },
      });
      expect(JSON.stringify(response.body)).not.toContain('secret.db');
      expect(logError).toHaveBeenCalledWith(expect.objectContaining({ message: secret }));
    });
  });

  describe('GET /api/items', () => {
    it('returns an empty array for an empty catalog', async () => {
      const response = await request(app).get('/api/items');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('returns every item, in insertion order, with its own kind', async () => {
      await create(manualBook);
      await create({ mode: 'manual', kind: 'cd', identifier: '4006381333931', title: 'Nevermind' });
      await create({
        mode: 'manual',
        kind: 'video-file',
        identifier: '/home/user/matrix.mkv',
        title: 'Matrix',
      });

      const response = await request(app).get('/api/items');

      expect(response.status).toBe(200);
      expect(response.body.map((item: { kind: string }) => item.kind)).toEqual([
        'book',
        'cd',
        'video-file',
      ]);
      expect(response.body.map((item: { title: string }) => item.title)).toEqual([
        'Dune',
        'Nevermind',
        'Matrix',
      ]);
    });
  });

  describe('GET /api/items/type/:type', () => {
    beforeEach(async () => {
      await create(manualBook);
      await create({ ...manualBook, title: 'Emma', identifier: '9780131103627' });
      await create({ mode: 'manual', kind: 'cd', identifier: '4006381333931', title: 'Nevermind' });
    });

    it('returns only the items of the requested type', async () => {
      const response = await request(app).get('/api/items/type/book');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body.every((item: { kind: string }) => item.kind === 'book')).toBe(true);
    });

    it('returns an empty array for a supported type without items', async () => {
      const response = await request(app).get('/api/items/type/vinyl');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it.each(['magazine', 'toString', '__proto__'])(
      'answers 400 for the unknown type %s',
      async (type) => {
        const response = await request(app).get(`/api/items/type/${type}`);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('invalid_request');
        expect(response.body.error.message).toMatch(/Supported types: book, vinyl, cd/);
      },
    );

    it('is not shadowed by the :id route', async () => {
      const response = await request(app).get('/api/items/type/cd');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
    });
  });

  describe('GET /api/items/:id', () => {
    it('returns the detail of an item', async () => {
      const created = await create({ ...manualBook, aiClassification: 'Science fiction' });

      const response = await request(app).get(`/api/items/${created.body.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: created.body.id,
        kind: 'book',
        title: 'Dune',
        aiClassification: 'Science fiction',
      });
    });

    it('answers 404 with a JSON error for an unknown id', async () => {
      const response = await request(app).get('/api/items/does-not-exist');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });

    it('treats SQL-looking ids as plain data', async () => {
      await create(manualBook);

      const response = await request(app).get(`/api/items/${encodeURIComponent("' OR '1'='1")}`);

      expect(response.status).toBe(404);
    });
  });

  describe('configuration safety', () => {
    it('runs on the fake test environment, never on the real .env file', () => {
      expect(process.env['ANTHROPIC_API_KEY']).toBe('test-anthropic-api-key');
      expect(process.env['DATABASE_FILE']).toBe(':memory:');
    });
  });

  describe('other routes', () => {
    it('answers the health check', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: 'ok' });
    });

    it('answers 404 JSON for unknown API endpoints', async () => {
      const response = await request(app).get('/api/unknown');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });

    it('answers 404 JSON for methods that item resources do not support', async () => {
      const response = await request(app).patch('/api/items/some-id').send({ title: 'x' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('not_found');
    });

    it('does not advertise the framework', async () => {
      const response = await request(app).get('/api/health');

      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });
});
