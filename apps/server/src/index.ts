import { resolve } from 'node:path';
import { WorkspaceService } from '../../../packages/core/src/service.js';
import { createApp } from './app.js';
const adminToken = process.env.AFM_ADMIN_TOKEN ?? '';
if (adminToken.length < 24)
  throw new Error('Missing secure AFM_ADMIN_TOKEN. Run npm run setup first.');
const port = Number(process.env.AFM_PORT ?? 7310);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('AFM_PORT must be a valid TCP port.');
const service = new WorkspaceService(resolve(process.env.AFM_DATA_DIR ?? 'data', 'workspace.db'));
const app = await createApp({
  service,
  adminToken,
  allowedOrigin: process.env.AFM_DEV_ORIGIN ?? 'http://127.0.0.1:5173',
  publicOrigin: `http://127.0.0.1:${port}`,
  webRoot: resolve('apps/web/dist'),
});
for (const signal of ['SIGTERM', 'SIGINT'] as const)
  process.once(signal, async () => {
    await app.close();
    service.close();
    process.exit(0);
  });
await app.listen({ host: '127.0.0.1', port });
console.log(`AI File Manager is listening at http://127.0.0.1:${port}`);
