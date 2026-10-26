import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MUSICBRAINZ_CONTACT_FALLBACK } from '../config/env.config.js';
import { McpClientError, McpClientService, createDefaultMcpServers } from './mcp-client.service.js';
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
        'library__env',
        'library__fail',
        'music__echo',
        'music__env',
        'music__fail',
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
      expect(first).toHaveLength(3);
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

      await expect(service.getAllTools()).resolves.toHaveLength(3);
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
