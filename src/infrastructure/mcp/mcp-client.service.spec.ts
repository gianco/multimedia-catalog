import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ClaudeAiEnrichmentService } from '../../application/services/ai-enrichment.service.js';
import type { ClaudeMessageResponse } from '../../application/services/ai-enrichment.service.js';
import { claudeTextResponse, createClaudeClientMock } from '../../application/testing/mocks.js';
import { MUSICBRAINZ_CONTACT_FALLBACK } from '../config/env.config.js';
import {
  McpClientError,
  McpClientService,
  OPEN_LIBRARY_SERVER_NAME,
  createDefaultMcpServers,
} from './mcp-client.service.js';
import type { McpServerDefinition } from './mcp-client.service.js';

/**
 * Inline MCP server run by a real `node` child process over stdio, so the tests exercise the
 * real transport without network access or `npx`. It exposes `echo`, `fail` and `env`
 * (returns the injected MUSICBRAINZ_CONTACT).
 */
const FAKE_SERVER_SOURCE = `
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'fake', version: '1.0.0' }, { capabilities: { tools: {} } });
const schema = { type: 'object', properties: { text: { type: 'string' } } };
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'echo', description: 'Echoes text', inputSchema: schema },
    { name: 'fail', inputSchema: schema },
    { name: 'env', inputSchema: schema },
    { name: 'editions', inputSchema: schema },
    { name: 'get_book_by_id', inputSchema: schema },
    { name: 'search_books', inputSchema: schema },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  if (name === 'fail') {
    return { isError: true, content: [{ type: 'text', text: 'boom' }] };
  }
  if (name === 'env') {
    return { content: [{ type: 'text', text: process.env.MUSICBRAINZ_CONTACT ?? 'unset' }] };
  }
  if (name === 'get_book_by_id') {
    const edition = {
      title: 'The Hobbit',
      authors: ['J.R.R. Tolkien'],
      publishers: ['Mariner Books'],
      publish_date: '2012',
      number_of_pages: 300,
      isbn_13: ['9780547928227'],
      isbn_10: ['054792822X'],
      oclc: Array.from({ length: 2000 }, (_, index) => String(770000000 + index)),
      olid: Array.from({ length: 2000 }, (_, index) => 'OL' + index + 'M'),
      cover_url: 'https://covers.openlibrary.org/b/id/12003329-M.jpg',
    };
    return { content: [{ type: 'text', text: JSON.stringify(edition) }] };
  }
  if (name === 'search_books') {
    if (args?.isbn === '0000000000') {
      return { content: [{ type: 'text', text: 'No books found matching: isbn=0000000000' }] };
    }
    const results = Array.from({ length: 500 }, (_, index) => ({
      title: 'The Hobbit, volume ' + index,
      authors: ['J.R.R. Tolkien'],
      first_publish_year: 1937,
      edition_count: 482,
      author_keys: Array.from({ length: 50 }, (_, key) => 'OL' + key + 'A'),
      best_edition: { isbn_10: '054792822X', isbn_13: '9780547928227' },
    }));
    return { content: [{ type: 'text', text: JSON.stringify({ num_found: 500, results }) }] };
  }
  if (name === 'editions') {
    const count = Number(args?.count ?? 500);
    const editions = Array.from({ length: count }, (_, index) => ({
      key: '/books/OL' + index + 'M',
      title: 'The Hobbit',
      notes: 'Lorem ipsum dolor sit amet. '.repeat(40),
    }));
    const payload = args?.format === 'text'
      ? 'x'.repeat(100000)
      : JSON.stringify({ num_found: count, editions });
    return { content: [{ type: 'text', text: payload }] };
  }
  return { content: [{ type: 'text', text: 'echo:' + (args?.text ?? '') }] };
});
await server.connect(new StdioServerTransport());
`;

function fakeServer(name: string, env?: Record<string, string>): McpServerDefinition {
  return {
    name,
    params: {
      command: process.execPath,
      args: ['--input-type=module', '-e', FAKE_SERVER_SOURCE],
      stderr: 'ignore',
      ...(env !== undefined && { env }),
    },
  };
}

const brokenServer: McpServerDefinition = {
  name: 'broken',
  params: { command: process.execPath, args: ['-e', 'process.exit(1)'], stderr: 'ignore' },
};

describe('McpClientService', () => {
  let service: McpClientService | undefined;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await service?.close();
    service = undefined;
    jest.restoreAllMocks();
  });

  describe('tool namespacing', () => {
    it('prefixes every tool with its server name, keeping the servers isolated', async () => {
      service = new McpClientService([fakeServer('library'), fakeServer('music')]);

      const tools = await service.getAllTools();

      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'library__echo',
        'library__editions',
        'library__env',
        'library__fail',
        'library__get_book_by_id',
        'library__search_books',
        'music__echo',
        'music__editions',
        'music__env',
        'music__fail',
        'music__get_book_by_id',
        'music__search_books',
      ]);
    });

    it('keeps description and input schema of the original tool', async () => {
      service = new McpClientService([fakeServer('library')]);

      const echo = (await service.getAllTools()).find((tool) => tool.name === 'library__echo');

      expect(echo?.description).toBe('Echoes text');
      expect(echo?.inputSchema.type).toBe('object');
    });

    it('only produces names accepted by Anthropic', async () => {
      service = new McpClientService([fakeServer('mcp-open-library')]);

      const tools = await service.getAllTools();

      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      }
    });

    it('starts the servers only once however many times the tools are requested', async () => {
      service = new McpClientService([fakeServer('library')]);

      const [first, second] = await Promise.all([service.getAllTools(), service.getAllTools()]);

      expect(first).toEqual(second);
      expect(first).toHaveLength(6);
    });
  });

  describe('executeTool', () => {
    it('routes the call to the server owning the namespace', async () => {
      service = new McpClientService([fakeServer('library'), fakeServer('music')]);

      const result = await service.executeTool('music__echo', { text: 'hello' });

      expect(result).toEqual({ content: 'echo:hello', isError: false });
    });

    it('reports a tool-level failure through isError without throwing', async () => {
      service = new McpClientService([fakeServer('library')]);

      const result = await service.executeTool('library__fail', {});

      expect(result).toEqual({ content: 'boom', isError: true });
    });

    it('rejects an unknown tool with an McpClientError', async () => {
      service = new McpClientService([fakeServer('library')]);

      const promise = service.executeTool('library__missing', {});

      await expect(promise).rejects.toThrow(McpClientError);
      await expect(promise).rejects.toThrow(/Unknown tool "library__missing"/);
    });

    it('rejects a name without namespace', async () => {
      service = new McpClientService([fakeServer('library')]);

      await expect(service.executeTool('echo', {})).rejects.toThrow(McpClientError);
    });
  });

  describe('oversized payload protection', () => {
    interface Edition {
      key: string;
      notes: string;
    }
    interface EditionsPayload {
      num_found: number;
      editions: Edition[];
      editionsOmitted: number;
    }

    it('should return parsable JSON with only the first editions when the server answers with hundreds of them', async () => {
      service = new McpClientService([fakeServer('library')]);

      const result = await service.executeTool('library__editions', { count: 500 });

      expect(result.isError).toBe(false);
      expect(result.content.length).toBeLessThanOrEqual(20_000);
      const payload = JSON.parse(result.content) as EditionsPayload;
      expect(payload.num_found).toBe(500);
      expect(payload.editions.map((edition) => edition.key)).toEqual([
        '/books/OL0M',
        '/books/OL1M',
        '/books/OL2M',
      ]);
      expect(payload.editionsOmitted).toBe(497);
    });

    it('should return the same text when the same oversized payload is requested twice', async () => {
      service = new McpClientService([fakeServer('library')]);

      const first = await service.executeTool('library__editions', { count: 500 });
      const second = await service.executeTool('library__editions', { count: 500 });

      expect(second).toEqual(first);
    });

    it('should leave a small multi-edition payload untouched', async () => {
      service = new McpClientService([fakeServer('library')]);

      const result = await service.executeTool('library__editions', { count: 2 });

      const payload = JSON.parse(result.content) as EditionsPayload;
      expect(payload.editions).toHaveLength(2);
      expect(payload.editionsOmitted).toBeUndefined();
    });

    it('should cut a huge non-JSON answer and mark it as truncated', async () => {
      service = new McpClientService([fakeServer('library')]);

      const result = await service.executeTool('library__editions', { format: 'text' });

      expect(result.content).toBe(`${'x'.repeat(20_000)}\n[truncated]`);
    });
  });

  describe('Open Library projection', () => {
    interface Hit {
      title: string;
      authors: string[];
      isbn_10: string[];
      isbn_13: string[];
    }
    interface SearchPayload {
      num_found: number;
      results: Hit[];
      resultsOmitted: number;
    }

    const openLibrary = (): McpServerDefinition => fakeServer(OPEN_LIBRARY_SERVER_NAME);
    const toolName = (tool: string): string => `${OPEN_LIBRARY_SERVER_NAME}__${tool}`;

    it('should keep the title and the ISBNs of the top hits when a search returns hundreds of them', async () => {
      service = new McpClientService([openLibrary()]);

      const result = await service.executeTool(toolName('search_books'), { isbn: '9780547928227' });

      const payload = JSON.parse(result.content) as SearchPayload;
      expect(payload.num_found).toBe(500);
      expect(payload.results).toHaveLength(3);
      expect(payload.resultsOmitted).toBe(497);
      expect(payload.results[0]).toEqual({
        title: 'The Hobbit, volume 0',
        authors: ['J.R.R. Tolkien'],
        first_publish_year: 1937,
        edition_count: 482,
        isbn_10: ['054792822X'],
        isbn_13: ['9780547928227'],
      });
      expect(result.content).not.toContain('author_keys');
    });

    it('should keep the essential edition fields and drop the oversized arrays', async () => {
      service = new McpClientService([openLibrary()]);

      const result = await service.executeTool(toolName('get_book_by_id'), {
        idType: 'isbn',
        idValue: '9780547928227',
      });

      expect(JSON.parse(result.content)).toEqual({
        title: 'The Hobbit',
        authors: ['J.R.R. Tolkien'],
        publish_date: '2012',
        publishers: ['Mariner Books'],
        number_of_pages: 300,
        isbn_10: ['054792822X'],
        isbn_13: ['9780547928227'],
      });
      expect(result.content).not.toContain('oclc');
    });

    it('should pass a plain not-found answer through untouched', async () => {
      service = new McpClientService([openLibrary()]);

      const result = await service.executeTool(toolName('search_books'), { isbn: '0000000000' });

      expect(result.content).toBe('No books found matching: isbn=0000000000');
    });

    it('should apply only the generic truncation to the other servers', async () => {
      service = new McpClientService([fakeServer('library')]);

      const result = await service.executeTool('library__search_books', { isbn: '9780547928227' });

      const payload = JSON.parse(result.content) as { results: Hit[]; resultsOmitted: number };
      expect(payload.results).toHaveLength(3);
      expect(result.content).toContain('author_keys');
    });

    it('should hand Claude a parsable tool result with a non-empty title and no oversized array', async () => {
      service = new McpClientService([openLibrary()]);
      const client = createClaudeClientMock();
      const toolUse: ClaudeMessageResponse = {
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: toolName('search_books'),
            input: { isbn: 'ISBN 978-0-547-92822-7' },
          },
        ],
        stop_reason: 'tool_use',
      };
      client.messages.create.mockResolvedValueOnce(toolUse).mockResolvedValueOnce(
        claudeTextResponse(
          JSON.stringify({
            title: 'The Hobbit',
            author: 'J.R.R. Tolkien',
            publicationYear: 1937,
            classification: 'Fantasy',
          }),
        ),
      );
      const enrichment = new ClaudeAiEnrichmentService(client, {}, service);

      const metadata = await enrichment.enrich({ kind: 'book', identifier: '9780547928227' });

      expect(metadata.title).toBe('The Hobbit');
      const followUp = client.messages.create.mock.calls[1]?.[0].messages;
      const blocks = followUp?.[2]?.content;
      const toolResult = Array.isArray(blocks) ? blocks[0] : undefined;
      expect(toolResult).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' });
      const sent = (toolResult as { content: string }).content;
      const payload = JSON.parse(sent) as SearchPayload;
      expect(payload.results.length).toBeLessThanOrEqual(3);
      expect(payload.results[0]?.title.trim().length).toBeGreaterThan(0);
      expect(payload.resultsOmitted).toBe(497);
      expect(sent.length).toBeLessThan(2_000);
    });
  });

  describe('environment injection', () => {
    it('passes the env block to the spawned server', async () => {
      service = new McpClientService([
        fakeServer('music', { MUSICBRAINZ_CONTACT: 'me@example.com' }),
      ]);

      const result = await service.executeTool('music__env', {});

      expect(result.content).toBe('me@example.com');
    });

    it('still lets the child find node, because the SDK merges its safe default env', async () => {
      service = new McpClientService([
        fakeServer('music', { MUSICBRAINZ_CONTACT: 'x@example.com' }),
      ]);

      await expect(service.getAllTools()).resolves.toHaveLength(6);
    });
  });

  describe('resilience', () => {
    it('skips a server that cannot start and keeps the others working', async () => {
      service = new McpClientService([brokenServer, fakeServer('library')]);

      const tools = await service.getAllTools();

      expect(tools.map((tool) => tool.name)).toContain('library__echo');
      expect(tools.some((tool) => tool.name.startsWith('broken__'))).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('"broken" is unavailable'),
      );
    });

    it('exposes no tool at all when there is no server', async () => {
      service = new McpClientService([]);

      await expect(service.getAllTools()).resolves.toEqual([]);
    });

    it('can be closed more than once', async () => {
      service = new McpClientService([fakeServer('library')]);
      await service.start();

      await service.close();

      await expect(service.close()).resolves.toBeUndefined();
    });
  });
});

describe('createDefaultMcpServers', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('declares the two catalog servers with the expected commands', () => {
    const [openLibrary, musicBrainz] = createDefaultMcpServers({
      musicbrainzContact: 'me@example.com',
    });

    expect(openLibrary).toEqual({
      name: 'mcp-open-library',
      params: { command: 'npx', args: ['-y', 'mcp-open-library'] },
    });
    expect(musicBrainz?.name).toBe('musicbrainz-mcp-server');
    expect(musicBrainz?.params.command).toBe('npx');
    expect(musicBrainz?.params.args).toEqual(['-y', '@cyanheads/musicbrainz-mcp-server@latest']);
  });

  it('injects the configured contact into the MusicBrainz server only', () => {
    const [openLibrary, musicBrainz] = createDefaultMcpServers({
      musicbrainzContact: 'me@example.com',
    });

    expect(musicBrainz?.params.env).toEqual({
      MCP_TRANSPORT_TYPE: 'stdio',
      MCP_LOG_LEVEL: 'info',
      MUSICBRAINZ_CONTACT: 'me@example.com',
    });
    expect(openLibrary?.params.env).toBeUndefined();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns when only the placeholder contact is available', () => {
    createDefaultMcpServers({ musicbrainzContact: MUSICBRAINZ_CONTACT_FALLBACK });

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('MUSICBRAINZ_CONTACT'));
  });
});
