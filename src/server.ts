import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Backend } from './backends/types.js';
import type { Config } from './config.js';
import {
  BULK_READ_DESCRIPTION,
  BulkReadInput,
  makeBulkReadHandler,
} from './tools/bulk-read.js';

export function buildServer(cfg: Config, backend: Backend): McpServer {
  const server = new McpServer({
    name: 'sidecar-mcp',
    version: '0.1.0',
  });

  const handle = makeBulkReadHandler(cfg, backend);

  server.tool(
    'bulk_read',
    BULK_READ_DESCRIPTION,
    // zod schema → JSON Schema for the wire format
    BulkReadInput.shape,
    handle as (args: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>,
  );

  return server;
}
