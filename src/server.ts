import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Backend } from './backends/types.js';
import type { Config } from './config.js';
import {
  BULK_READ_DESCRIPTION,
  BulkReadInput,
  makeBulkReadHandler,
} from './tools/bulk-read.js';
import pkg from '../package.json' with { type: 'json' };

export function buildServer(cfg: Config, backend: Backend): McpServer {
  const server = new McpServer({
    name: 'sidecar-mcp',
    version: pkg.version,
  });

  const handle = makeBulkReadHandler(cfg, backend);

  server.tool(
    'bulk_read',
    BULK_READ_DESCRIPTION,
    // zod schema → JSON Schema for the wire format
    BulkReadInput.shape,
    // SDK passes (args, extra) — extra.signal is forwarded to the backend
    // so client-side cancellation actually kills the in-flight request.
    handle,
  );

  return server;
}
