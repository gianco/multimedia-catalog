import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAiEnrichmentService } from '../../application/services/ai-enrichment.service.js';
import type {
  AiEnrichmentService,
  ClaudeClient,
} from '../../application/services/ai-enrichment.service.js';
import type { ToolGateway } from '../../application/services/tool-gateway.js';
import { UnavailableAiEnrichmentService } from '../../application/services/unavailable-ai-enrichment.service.js';
import { isPlaceholderApiKey } from '../config/env.config.js';
import type { AppConfig } from '../config/env.config.js';

export const PLACEHOLDER_KEY_MESSAGE =
  'ANTHROPIC_API_KEY still has the placeholder value from .env.example. ' +
  'Set a real key in .env to enable AI enrichment.';

/** Builds the Anthropic client for an API key. Replaced by a fake in tests. */
export type ClaudeClientFactory = (apiKey: string) => ClaudeClient;

const createAnthropicClient: ClaudeClientFactory = (apiKey) => new Anthropic({ apiKey });

/**
 * Wires the application-layer `AiEnrichmentService` with the values of the centralized
 * configuration: `ANTHROPIC_API_KEY` goes into the Anthropic client and `CLAUDE_MODEL` is the
 * model of every request.
 *
 * The application layer stays unaware of the environment (the dependency rule forbids it from
 * importing the infrastructure), so this composition happens here, at the boundary.
 *
 * While the key is still the `.env.example` placeholder the service is disabled instead of
 * calling the API with a key that can only fail: manual ingestion keeps working.
 */
export function createAiEnrichmentService(
  config: Pick<AppConfig, 'anthropicApiKey' | 'claudeModel'>,
  createClient: ClaudeClientFactory = createAnthropicClient,
  toolGateway?: ToolGateway,
): AiEnrichmentService {
  if (isPlaceholderApiKey(config.anthropicApiKey)) {
    return new UnavailableAiEnrichmentService(PLACEHOLDER_KEY_MESSAGE);
  }
  return new ClaudeAiEnrichmentService(
    createClient(config.anthropicApiKey),
    { model: config.claudeModel },
    toolGateway,
  );
}
