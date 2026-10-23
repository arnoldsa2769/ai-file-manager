#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WorkspaceClient } from '../../sdk/src/index.js';
import { createMcpServer } from './server.js';
if (!process.env.AFM_TOKEN || !process.env.AFM_WORKSPACE)
  throw new Error('Set AFM_TOKEN and AFM_WORKSPACE before starting the MCP bridge.');
const client = new WorkspaceClient({
  baseUrl: process.env.AFM_URL ?? 'http://127.0.0.1:7310',
  token: process.env.AFM_TOKEN,
});
await createMcpServer(client, process.env.AFM_WORKSPACE).connect(new StdioServerTransport());
