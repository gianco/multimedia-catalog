import { fileURLToPath } from 'node:url';
import { createAiEnrichmentService } from '../ai/create-ai-enrichment-service.js';
import { loadConfig } from '../config/env.config.js';
import type { AppConfig } from '../config/env.config.js';
import { SqliteCatalogItemRepository } from '../database/sqlite-catalog-item-repository.js';
import { McpClientService, createDefaultMcpServers } from '../mcp/mcp-client.service.js';
import { createHandlers } from './create-handlers.js';
import { createApp } from './server.js';

/**
 * Starts the whole application (API + built frontend) with the given configuration.
 * It never reads `process.env` itself: see `loadConfig` for the supported variables.
 */
export function startServer(config: AppConfig = loadConfig()): void {
  const repository = SqliteCatalogItemRepository.fromConfig(config);
  const mcpClient = new McpClientService(createDefaultMcpServers(config));
  const handlers = createHandlers(
    repository,
    createAiEnrichmentService(config, undefined, mcpClient),
  );
  const app = createApp(handlers, {
    staticDirectory: fileURLToPath(new URL('../../../web/dist', import.meta.url)),
  });

  const server = app.listen(config.port, () => {
    console.log(`Catalogo Multimediale listening on http://localhost:${config.port}`);
  });

  const shutdown = (): void => {
    server.close(() => {
      void mcpClient.close().finally(() => {
        repository.close();
        process.exit(0);
      });
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
