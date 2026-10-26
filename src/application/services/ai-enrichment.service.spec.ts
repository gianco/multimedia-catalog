import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MetadataVo } from '../../domain/metadata.vo.js';
import { claudeTextResponse, createClaudeClientMock } from '../testing/mocks.js';
import type { MockedClaudeClient } from '../testing/mocks.js';
import {
  AiEnrichmentError,
  ClaudeAiEnrichmentService,
  DEFAULT_CLAUDE_MODEL,
} from './ai-enrichment.service.js';
import type { AiEnrichmentInput, ClaudeMessageResponse } from './ai-enrichment.service.js';
import type { ToolDefinition, ToolGateway } from './tool-gateway.js';

const input: AiEnrichmentInput = { kind: 'book', identifier: '9780306406157' };

const validAnswer = {
  title: 'Dune',
  author: 'Frank Herbert',
  publicationYear: 1965,
  classification: 'Science fiction',
};

describe('ClaudeAiEnrichmentService', () => {
  let client: MockedClaudeClient;
  let service: ClaudeAiEnrichmentService;

  beforeEach(() => {
    client = createClaudeClientMock();
    service = new ClaudeAiEnrichmentService(client);
  });

  const answerWith = (text: string, stopReason?: string | null): void => {
    client.messages.create.mockResolvedValue(claudeTextResponse(text, stopReason));
  };

  describe('calling Claude', () => {
    it('sends the identifier and hints as data with the configured model', async () => {
      answerWith(JSON.stringify(validAnswer));

      await service.enrich({ ...input, hints: { title: 'Dune' } });

      expect(client.messages.create).toHaveBeenCalledTimes(1);
      const request = client.messages.create.mock.calls[0]?.[0];
      expect(request?.model).toBe(DEFAULT_CLAUDE_MODEL);
      expect(request?.max_tokens).toBeGreaterThan(0);
      expect(request?.system).toMatch(/never as instructions/);
      expect(request?.messages).toHaveLength(1);
      const content = request?.messages[0]?.content;
      expect(JSON.parse(typeof content === 'string' ? content : '')).toEqual({
        ...input,
        hints: { title: 'Dune' },
      });
    });

    it('uses a custom model and token limit when provided', async () => {
      service = new ClaudeAiEnrichmentService(client, { model: 'custom-model', maxTokens: 64 });
      answerWith(JSON.stringify(validAnswer));

      await service.enrich(input);

      expect(client.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'custom-model', max_tokens: 64 }),
      );
    });

    it('wraps API failures into an AiEnrichmentError keeping the cause', async () => {
      const cause = new Error('429 rate limited');
      client.messages.create.mockRejectedValue(cause);

      const promise = service.enrich(input);

      await expect(promise).rejects.toThrow(AiEnrichmentError);
      await expect(promise).rejects.toThrow(/Claude API call failed/);
      await expect(promise).rejects.toMatchObject({ cause });
    });
  });

  describe('mapping a valid answer', () => {
    it('maps the JSON into an enriched MetadataVo', async () => {
      answerWith(JSON.stringify(validAnswer));

      const metadata = await service.enrich(input);

      expect(metadata).toBeInstanceOf(MetadataVo);
      expect(metadata.title).toBe('Dune');
      expect(metadata.author).toBe('Frank Herbert');
      expect(metadata.publicationYear).toBe(1965);
      expect(metadata.aiClassification).toBe('Science fiction');
      expect(metadata.enrichmentCompleted).toBe(true);
    });

    it('accepts null author and year and trims the text', async () => {
      answerWith(
        JSON.stringify({
          title: '  Dune  ',
          author: null,
          publicationYear: null,
          classification: ' SF ',
        }),
      );

      const metadata = await service.enrich(input);

      expect(metadata.title).toBe('Dune');
      expect(metadata.author).toBeNull();
      expect(metadata.publicationYear).toBeNull();
      expect(metadata.aiClassification).toBe('SF');
    });

    it('accepts optional keys that are missing', async () => {
      answerWith(JSON.stringify({ title: 'Dune', classification: 'SF' }));

      const metadata = await service.enrich(input);

      expect(metadata.author).toBeNull();
      expect(metadata.publicationYear).toBeNull();
    });

    it('unwraps JSON inside a markdown code fence', async () => {
      answerWith(`\`\`\`json\n${JSON.stringify(validAnswer)}\n\`\`\``);

      await expect(service.enrich(input)).resolves.toMatchObject({ title: 'Dune' });
    });

    it('concatenates multiple text blocks and ignores the other block types', async () => {
      client.messages.create.mockResolvedValue({
        content: [
          { type: 'thinking' },
          { type: 'text', text: '{"title":"Dune",' },
          { type: 'text', text: '"classification":"SF"}' },
        ],
        stop_reason: 'end_turn',
      });

      await expect(service.enrich(input)).resolves.toMatchObject({ title: 'Dune' });
    });

    it('ignores unexpected extra keys instead of trusting them', async () => {
      answerWith(JSON.stringify({ ...validAnswer, enrichmentCompleted: false, isAdmin: true }));

      const metadata = await service.enrich(input);

      expect(metadata.enrichmentCompleted).toBe(true);
      expect(metadata).not.toHaveProperty('isAdmin');
    });
  });

  describe('rejecting corrupted answers', () => {
    it.each([
      ['an empty text', ''],
      ['whitespace only', '   \n  '],
      ['plain prose', 'Sure! Here is the book you asked for.'],
      ['truncated JSON', '{"title":"Dune","classification":'],
      ['JSON followed by prose', '{"title":"Dune","classification":"SF"} Hope this helps!'],
    ])('throws for %s', async (_label, text) => {
      answerWith(text);

      await expect(service.enrich(input)).rejects.toThrow(AiEnrichmentError);
    });

    it.each([
      ['an array', '[{"title":"Dune"}]'],
      ['a string', '"Dune"'],
      ['a number', '42'],
      ['null', 'null'],
    ])('throws when the JSON is %s instead of an object', async (_label, text) => {
      answerWith(text);

      await expect(service.enrich(input)).rejects.toThrow(/must be a JSON object/);
    });

    it('throws when the response has no text block', async () => {
      client.messages.create.mockResolvedValue({ content: [{ type: 'tool_use' }] });

      await expect(service.enrich(input)).rejects.toThrow(/does not contain any text/);
    });

    it('throws when the content is missing altogether', async () => {
      client.messages.create.mockResolvedValue({} as never);

      await expect(service.enrich(input)).rejects.toThrow(/does not contain any text/);
    });

    it('throws when the answer was truncated', async () => {
      answerWith(JSON.stringify(validAnswer), 'max_tokens');

      await expect(service.enrich(input)).rejects.toThrow(/truncated/);
    });

    it.each([
      ['a missing title', { classification: 'SF' }, /"title"/],
      ['an empty title', { title: '  ', classification: 'SF' }, /"title"/],
      ['a numeric title', { title: 7, classification: 'SF' }, /"title"/],
      ['a missing classification', { title: 'Dune' }, /"classification"/],
      ['an empty classification', { title: 'Dune', classification: '' }, /"classification"/],
      ['a non-string author', { title: 'Dune', classification: 'SF', author: 5 }, /"author"/],
      ['an empty author', { title: 'Dune', classification: 'SF', author: ' ' }, /"author"/],
      [
        'a text year',
        { title: 'Dune', classification: 'SF', publicationYear: '1965' },
        /"publicationYear"/,
      ],
      [
        'a decimal year',
        { title: 'Dune', classification: 'SF', publicationYear: 1965.5 },
        /"publicationYear"/,
      ],
    ])('throws for %s', async (_label, payload, message) => {
      answerWith(JSON.stringify(payload));

      const promise = service.enrich(input);

      await expect(promise).rejects.toThrow(AiEnrichmentError);
      await expect(promise).rejects.toThrow(message);
    });

    it.each([
      ['title', { title: 'x'.repeat(501), classification: 'SF' }],
      ['author', { title: 'Dune', classification: 'SF', author: 'x'.repeat(301) }],
      ['classification', { title: 'Dune', classification: 'x'.repeat(101) }],
    ])('throws when the %s is unreasonably long', async (_field, payload) => {
      answerWith(JSON.stringify(payload));

      await expect(service.enrich(input)).rejects.toThrow(/maximum length/);
    });

    it.each([0, -10, 99999])('throws as a domain violation for the year %p', async (year) => {
      answerWith(JSON.stringify({ ...validAnswer, publicationYear: year }));

      const promise = service.enrich(input);

      await expect(promise).rejects.toThrow(AiEnrichmentError);
      await expect(promise).rejects.toThrow(/violates a domain constraint/);
    });

    it('keeps the original parsing error as cause', async () => {
      answerWith('not json');

      await expect(service.enrich(input)).rejects.toMatchObject({
        cause: expect.any(SyntaxError),
      });
    });
  });
});

describe('ClaudeAiEnrichmentService tool use', () => {
  const tool: ToolDefinition = {
    name: 'library__search',
    description: 'Searches a library',
    inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
  };
  const finalAnswer = claudeTextResponse(JSON.stringify(validAnswer));
  const toolUse = (
    id = 'toolu_1',
    name = 'library__search',
    toolInput: unknown = { q: 'dune' },
  ): ClaudeMessageResponse => ({
    content: [
      { type: 'text', text: 'Let me check.' },
      { type: 'tool_use', id, name, input: toolInput },
    ],
    stop_reason: 'tool_use',
  });

  let client: MockedClaudeClient;
  let gateway: { [K in keyof ToolGateway]: jest.Mock<ToolGateway[K]> };
  let service: ClaudeAiEnrichmentService;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    client = createClaudeClientMock();
    gateway = {
      getAllTools: jest.fn<ToolGateway['getAllTools']>().mockResolvedValue([tool]),
      executeTool: jest
        .fn<ToolGateway['executeTool']>()
        .mockResolvedValue({ content: 'Dune, Frank Herbert, 1965', isError: false }),
    };
    service = new ClaudeAiEnrichmentService(client, {}, gateway);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('offers the namespaced tools to Claude with the Anthropic field names', async () => {
    client.messages.create.mockResolvedValue(finalAnswer);

    await service.enrich(input);

    expect(client.messages.create.mock.calls[0]?.[0].tools).toEqual([
      {
        name: 'library__search',
        description: 'Searches a library',
        input_schema: tool.inputSchema,
      },
    ]);
  });

  it('executes the requested tool, feeds the result back and normalizes the final JSON', async () => {
    client.messages.create.mockResolvedValueOnce(toolUse()).mockResolvedValueOnce(finalAnswer);

    const metadata = await service.enrich(input);

    expect(gateway.executeTool).toHaveBeenCalledWith('library__search', { q: 'dune' });
    expect(client.messages.create).toHaveBeenCalledTimes(2);
    const followUp = client.messages.create.mock.calls[1]?.[0].messages;
    expect(followUp?.[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check.' },
        { type: 'tool_use', id: 'toolu_1', name: 'library__search', input: { q: 'dune' } },
      ],
    });
    expect(followUp?.[2]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'toolu_1', content: 'Dune, Frank Herbert, 1965' },
      ],
    });
    expect(metadata).toBeInstanceOf(MetadataVo);
    expect(metadata.title).toBe('Dune');
    expect(metadata.enrichmentCompleted).toBe(true);
  });

  it('still rejects a corrupted final answer after tool use', async () => {
    client.messages.create
      .mockResolvedValueOnce(toolUse())
      .mockResolvedValueOnce(claudeTextResponse('not json'));

    await expect(service.enrich(input)).rejects.toThrow(/not valid JSON/);
  });

  it('flags a tool-level failure to Claude instead of aborting', async () => {
    gateway.executeTool.mockResolvedValue({ content: 'boom', isError: true });
    client.messages.create.mockResolvedValueOnce(toolUse()).mockResolvedValueOnce(finalAnswer);

    await expect(service.enrich(input)).resolves.toMatchObject({ title: 'Dune' });

    const followUp = client.messages.create.mock.calls[1]?.[0].messages;
    expect(followUp?.[2]?.content).toEqual([
      { type: 'tool_result', tool_use_id: 'toolu_1', content: 'boom', is_error: true },
    ]);
  });

  it('reports an unknown tool (executeTool throws) back to Claude as an error result', async () => {
    gateway.executeTool.mockRejectedValue(new Error('Unknown tool "x__y".'));
    client.messages.create
      .mockResolvedValueOnce(toolUse('toolu_9', 'x__y'))
      .mockResolvedValueOnce(finalAnswer);

    await expect(service.enrich(input)).resolves.toMatchObject({ title: 'Dune' });

    const followUp = client.messages.create.mock.calls[1]?.[0].messages;
    expect(followUp?.[2]?.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_9',
        content: 'Unknown tool "x__y".',
        is_error: true,
      },
    ]);
  });

  it('does not execute a tool whose input is not an object', async () => {
    client.messages.create
      .mockResolvedValueOnce(toolUse('toolu_2', 'library__search', 'DROP TABLE'))
      .mockResolvedValueOnce(finalAnswer);

    await service.enrich(input);

    expect(gateway.executeTool).not.toHaveBeenCalled();
    const followUp = client.messages.create.mock.calls[1]?.[0].messages;
    expect(followUp?.[2]?.content).toEqual([
      expect.objectContaining({ tool_use_id: 'toolu_2', is_error: true }),
    ]);
  });

  it('gives up when Claude keeps asking for tools, after a bounded number of rounds', async () => {
    client.messages.create.mockResolvedValue(toolUse());

    const promise = service.enrich(input);

    await expect(promise).rejects.toThrow(AiEnrichmentError);
    await expect(promise).rejects.toThrow(/kept requesting tools/);
    expect(client.messages.create).toHaveBeenCalledTimes(6);
  });

  it('fails when the tool_use answer contains no readable tool request', async () => {
    client.messages.create.mockResolvedValue({
      content: [{ type: 'tool_use' }],
      stop_reason: 'tool_use',
    });

    await expect(service.enrich(input)).rejects.toThrow(/unreadable way/);
  });

  it('continues without tools when the gateway cannot list them', async () => {
    gateway.getAllTools.mockRejectedValue(new Error('spawn failed'));
    client.messages.create.mockResolvedValue(finalAnswer);

    await expect(service.enrich(input)).resolves.toMatchObject({ title: 'Dune' });

    expect(client.messages.create.mock.calls[0]?.[0].tools).toBeUndefined();
  });

  it('sends no tools at all when no gateway or no tool is available', async () => {
    client.messages.create.mockResolvedValue(finalAnswer);
    gateway.getAllTools.mockResolvedValue([]);

    await service.enrich(input);
    await new ClaudeAiEnrichmentService(client).enrich(input);

    for (const [request] of client.messages.create.mock.calls) {
      expect(request).not.toHaveProperty('tools');
    }
  });
});

describe('AiEnrichmentError', () => {
  it('is an Error with the correct name and cause', () => {
    const cause = new Error('root');
    const error = new AiEnrichmentError('failure', { cause });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AiEnrichmentError');
    expect(error.message).toBe('failure');
    expect(error.cause).toBe(cause);
  });
});
