import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { StdioServerParameters } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
  ToolDefinition,
  ToolExecutionResult,
  ToolGateway,
} from '../../application/services/tool-gateway.js';
import { MUSICBRAINZ_CONTACT_FALLBACK } from '../config/env.config.js';
import type { AppConfig } from '../config/env.config.js';

export const TOOL_NAMESPACE_SEPARATOR = '__';

/** Anthropic only accepts tool names matching this pattern, up to 64 characters. */
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const CONNECT_TIMEOUT_MS = 60_000; // the first `npx -y` may have to download the package
const CALL_TIMEOUT_MS = 30_000;
const MAX_RESULT_LENGTH = 20_000;

export class McpClientError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export interface McpServerDefinition {
  readonly name: string;
  readonly params: StdioServerParameters;
}

/** The two MCP servers of the catalog. */
export function createDefaultMcpServers(
  config: Pick<AppConfig, 'musicbrainzContact'>,
): readonly McpServerDefinition[] {
  if (config.musicbrainzContact === MUSICBRAINZ_CONTACT_FALLBACK) {
    console.warn('MUSICBRAINZ_CONTACT is not set: MusicBrainz may throttle or block requests.');
  }
  return [
    {
      name: 'mcp-open-library',
      params: { command: 'npx', args: ['-y', 'mcp-open-library'] },
    },
    {
      name: 'musicbrainz-mcp-server',
      params: {
        command: 'npx',
        args: ['-y', '@cyanheads/musicbrainz-mcp-server@latest'],
        env: {
          MCP_TRANSPORT_TYPE: 'stdio',
          MCP_LOG_LEVEL: 'info',
          MUSICBRAINZ_CONTACT: config.musicbrainzContact,
        },
      },
    },
  ];
}

interface ConnectedServer {
  readonly name: string;
  readonly client: Client;
}

interface RegisteredTool {
  readonly server: ConnectedServer;
  /** Name known by the MCP server (without namespace). */
  readonly toolName: string;
  readonly definition: ToolDefinition;
}

function isTextBlock(block: unknown): block is { type: 'text'; text: string } {
  return (
    typeof block === 'object' &&
    block !== null &&
    (block as { type?: unknown }).type === 'text' &&
    typeof (block as { text?: unknown }).text === 'string'
  );
}

function toText(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }
  const text = content
    .map((block: unknown) => (isTextBlock(block) ? block.text : JSON.stringify(block)))
    .join('\n');
  return text.length > MAX_RESULT_LENGTH
    ? `${text.slice(0, MAX_RESULT_LENGTH)}\n[truncated]`
    : text;
}

/**
 * Spawns the MCP servers over stdio and exposes all their tools as one flat list, namespaced
 * `serverName__toolName` so that tools of different servers can never collide.
 *
 * Connection is lazy and idempotent. A server that fails to start is logged and skipped: the
 * others keep working.
 */
export class McpClientService implements ToolGateway {
  private readonly connected: ConnectedServer[] = [];
  private readonly registry = new Map<string, RegisteredTool>();
  private starting: Promise<void> | undefined;

  constructor(private readonly servers: readonly McpServerDefinition[]) {}

  start(): Promise<void> {
    this.starting ??= this.connectAll();
    return this.starting;
  }

  async getAllTools(): Promise<readonly ToolDefinition[]> {
    await this.start();
    return [...this.registry.values()].map((entry) => entry.definition);
  }

  /**
   * Routes the call by the namespaced name (looked up in the registry, not by splitting the
   * string, so server names containing `__` stay unambiguous).
   *
   * @throws McpClientError for an unknown tool or a transport/protocol failure
   */
  async executeTool(
    namespacedName: string,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    await this.start();
    const entry = this.registry.get(namespacedName);
    if (entry === undefined) {
      throw new McpClientError(`Unknown tool "${namespacedName}".`);
    }
    try {
      const result = await entry.server.client.callTool(
        { name: entry.toolName, arguments: args },
        undefined,
        { timeout: CALL_TIMEOUT_MS },
      );
      const content: unknown = 'content' in result ? result.content : [];
      return { content: toText(content), isError: result.isError === true };
    } catch (error) {
      throw new McpClientError(`Tool "${namespacedName}" could not be executed.`, {
        cause: error,
      });
    }
  }

  /** Stops every spawned server process. Safe to call more than once. */
  async close(): Promise<void> {
    const servers = this.connected.splice(0);
    this.registry.clear();
    this.starting = undefined;
    await Promise.allSettled(servers.map((server) => server.client.close()));
  }

  private async connectAll(): Promise<void> {
    const outcomes = await Promise.allSettled(this.servers.map((server) => this.connect(server)));
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'rejected') {
        const reason = outcome.reason instanceof Error ? outcome.reason.message : 'unknown error';
        console.error(`MCP server "${this.servers[index]?.name}" is unavailable: ${reason}`);
      }
    });
  }

  private async connect(definition: McpServerDefinition): Promise<void> {
    const client = new Client({ name: 'multimedia-catalog', version: '0.1.0' });
    try {
      await client.connect(new StdioClientTransport(definition.params), {
        timeout: CONNECT_TIMEOUT_MS,
      });
      const tools = await this.listAllTools(client);
      const server: ConnectedServer = { name: definition.name, client };
      this.connected.push(server);
      for (const tool of tools) {
        this.register(server, tool);
      }
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  }

  private async listAllTools(client: Client): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor === undefined ? undefined : { cursor });
      for (const tool of page.tools) {
        tools.push({
          name: tool.name,
          ...(tool.description !== undefined && { description: tool.description }),
          inputSchema: tool.inputSchema,
        });
      }
      cursor = page.nextCursor;
    } while (cursor !== undefined);
    return tools;
  }

  private register(server: ConnectedServer, tool: ToolDefinition): void {
    const namespaced = `${server.name}${TOOL_NAMESPACE_SEPARATOR}${tool.name}`;
    if (!TOOL_NAME_PATTERN.test(namespaced) || this.registry.has(namespaced)) {
      console.warn(`MCP tool "${namespaced}" skipped: invalid or duplicate name.`);
      return;
    }
    this.registry.set(namespaced, {
      server,
      toolName: tool.name,
      definition: { ...tool, name: namespaced },
    });
  }
}
