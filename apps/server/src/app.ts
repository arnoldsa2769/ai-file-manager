import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { z, ZodError } from 'zod';
import { WorkspaceService } from '../../../packages/core/src/service.js';
import { validateIdempotencyKey } from '../../../packages/core/src/idempotency.js';
import { DomainError, operator, type Principal } from '../../../packages/core/src/types.js';
import type { Collection, PageOptions } from '../../../packages/core/src/types.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal;
  }
}
const label = (max: number) => z.string().trim().min(1).max(max);
const operationSchema = z
  .object({ path: z.string(), baseRevision: z.string().nullable(), content: z.string().nullable() })
  .strict();
const proposalSchema = z
  .object({ title: label(200), operations: z.array(operationSchema).min(1).max(20) })
  .strict();
const params = (value: unknown) => value as { workspaceId: string; id: string };
const pathQuery = z
  .object({ path: z.string(), includeDeleted: z.enum(['true', 'false']).optional() })
  .strict();
export interface AppOptions {
  service: WorkspaceService;
  adminToken: string;
  allowedOrigin?: string;
  publicOrigin?: string;
  webRoot?: string;
}
export async function createApp(options: AppOptions) {
  if (options.adminToken.length < 24)
    throw new Error('AFM_ADMIN_TOKEN must contain at least 24 characters. Run npm run setup.');
  const app = Fastify({ logger: false, bodyLimit: 1048576, requestTimeout: 15000 });
  const origins = [
    options.allowedOrigin,
    options.publicOrigin ?? 'http://127.0.0.1:7310',
    'http://localhost:7310',
  ].filter((v): v is string => Boolean(v));
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (request.headers.origin && !origins.includes(request.headers.origin))
      throw new DomainError('ORIGIN_DENIED', 'This browser origin is not permitted.', 403);
  });
  await app.register(cors, {
    origin: origins,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError)
      return reply.status(400).send({
        error: {
          code: 'INVALID_INPUT',
          message: 'Request does not match the documented schema.',
        },
      });
    if (error instanceof DomainError)
      return reply
        .status(error.status)
        .send({ error: { code: error.code, message: error.message } });
    const statusCode =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    const status = statusCode >= 400 && statusCode < 500 ? statusCode : 500;
    return reply.status(status).send({
      error: {
        code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
        message:
          status === 500
            ? 'An unexpected server error occurred.'
            : 'The request could not be processed.',
      },
    });
  });
  app.get('/health', async () => ({ status: 'ok', version: '0.1.0' }));
  await app.register(
    async (api) => {
      api.addHook('onRequest', async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        const match = /^Bearer (\S+)$/.exec(request.headers.authorization ?? '');
        if (!match) throw new DomainError('UNAUTHENTICATED', 'A bearer token is required.', 401);
        const provided = match[1]!;
        const digest = (value: string) => createHash('sha256').update(value).digest();
        const principal = timingSafeEqual(digest(provided), digest(options.adminToken))
          ? operator
          : options.service.authenticateAgent(provided);
        if (!principal)
          throw new DomainError('UNAUTHENTICATED', 'The token is invalid or revoked.', 401);
        request.principal = principal;
        if (request.headers['idempotency-key'] !== undefined) {
          validateIdempotencyKey(request.headers['idempotency-key']);
          if (
            request.method !== 'POST' ||
            !/^\/v1\/workspaces\/[^/]+\/changes(?:\/[^/]+\/apply)?$/.test(
              request.url.split('?')[0]!,
            )
          )
            throw new DomainError(
              'INVALID_INPUT',
              'Idempotency-Key is supported only for proposal creation and change application.',
            );
        }
      });
      const s = options.service;
      api.post('/workspaces/:workspaceId/access/check', async (r) => {
        const input = z
          .object({
            agentId: z.string().min(1).max(200).optional(),
            checks: z
              .array(
                z
                  .object({
                    path: z.string(),
                    action: z.enum(['read', 'write', 'delete', 'review']),
                  })
                  .strict(),
              )
              .min(1)
              .max(20),
          })
          .strict()
          .parse(r.body);
        return s.checkAccess(
          r.principal,
          params(r.params).workspaceId,
          input.checks,
          input.agentId,
        );
      });
      api.get('/workspaces/:workspaceId/summary', async (r) =>
        s.summary(r.principal, params(r.params).workspaceId),
      );
      const collections: Collection[] = [
        'documents',
        'changes',
        'history',
        'agents',
        'grants',
        'tasks',
        'activity',
      ];
      for (const collection of collections) {
        const schema = z
          .object({
            limit: z
              .string()
              .regex(/^[0-9]+$/)
              .transform(Number)
              .pipe(z.number().int().min(1).max(100))
              .optional(),
            cursor: z.string().min(1).max(1024).optional(),
            ...(collection === 'documents'
              ? {
                  query: z.string().max(512).optional(),
                  includeDeleted: z
                    .enum(['true', 'false'])
                    .transform((v) => v === 'true')
                    .optional(),
                }
              : {}),
            ...(collection === 'changes'
              ? { status: z.enum(['pending', 'approved', 'applied', 'rejected']).optional() }
              : {}),
            ...(collection === 'history' ? { path: z.string() } : {}),
          })
          .strict();
        api.get(`/workspaces/:workspaceId/${collection}/page`, async (r) =>
          s.page(
            r.principal,
            params(r.params).workspaceId,
            collection,
            schema.parse(r.query) as PageOptions,
          ),
        );
      }
      api.get('/me', async (r) => r.principal);
      api.get('/workspaces', async (r) => s.listWorkspaces(r.principal));
      api.post('/workspaces', async (r, reply) =>
        reply.code(201).send(
          s.createWorkspace(
            r.principal,
            z
              .object({ name: label(100) })
              .strict()
              .parse(r.body).name,
          ),
        ),
      );
      api.get('/workspaces/:workspaceId/overview', async (r) =>
        s.overview(r.principal, params(r.params).workspaceId),
      );
      api.post('/workspaces/:workspaceId/agents', async (r, reply) =>
        reply.code(201).send(
          s.createAgent(
            r.principal,
            params(r.params).workspaceId,
            z
              .object({ name: label(100), domain: label(100), provider: label(100) })
              .strict()
              .parse(r.body),
          ),
        ),
      );
      api.post('/workspaces/:workspaceId/agents/:id/revoke', async (r) => {
        const p = params(r.params);
        s.revokeAgent(r.principal, p.workspaceId, p.id);
        return { ok: true };
      });
      api.post('/workspaces/:workspaceId/grants', async (r, reply) =>
        reply.code(201).send(
          s.createGrant(
            r.principal,
            params(r.params).workspaceId,
            z
              .object({
                agentId: z.string(),
                scope: z.string(),
                actions: z.array(z.enum(['read', 'write', 'delete', 'review'])).min(1),
                effect: z.enum(['allow', 'deny']),
                expiresAt: z.string().datetime().nullable().optional(),
              })
              .strict()
              .parse(r.body),
          ),
        ),
      );
      api.post('/workspaces/:workspaceId/grants/:id/revoke', async (r) => {
        const p = params(r.params);
        s.revokeGrant(r.principal, p.workspaceId, p.id);
        return { ok: true };
      });
      api.get('/workspaces/:workspaceId/documents', async (r) =>
        s.listDocuments(r.principal, params(r.params).workspaceId),
      );
      api.get('/workspaces/:workspaceId/document', async (r) => {
        const q = pathQuery.parse(r.query);
        return s.readDocument(
          r.principal,
          params(r.params).workspaceId,
          q.path,
          q.includeDeleted === 'true',
        );
      });
      api.get('/workspaces/:workspaceId/history', async (r) => {
        const q = z.object({ path: z.string() }).strict().parse(r.query);
        return s.history(r.principal, params(r.params).workspaceId, q.path);
      });
      api.get('/workspaces/:workspaceId/revision', async (r) => {
        const q = z
          .object({ path: z.string(), revisionId: z.string().min(1).max(200) })
          .strict()
          .parse(r.query);
        return s.revision(r.principal, params(r.params).workspaceId, q.path, q.revisionId);
      });
      api.get('/workspaces/:workspaceId/changes', async (r) =>
        s.listChanges(r.principal, params(r.params).workspaceId),
      );
      api.post('/workspaces/:workspaceId/changes', async (r, reply) =>
        reply
          .code(201)
          .send(
            s.propose(
              r.principal,
              params(r.params).workspaceId,
              proposalSchema.parse(r.body),
              r.headers['idempotency-key'] as string | undefined,
            ),
          ),
      );
      api.get('/workspaces/:workspaceId/changes/:id', async (r) => {
        const p = params(r.params);
        return s.getChange(r.principal, p.workspaceId, p.id);
      });
      for (const action of ['approve', 'reject', 'apply'] as const)
        api.post(`/workspaces/:workspaceId/changes/:id/${action}`, async (r) => {
          const p = params(r.params);
          if (action === 'apply') {
            const key = r.headers['idempotency-key'] as string | undefined;
            if (key !== undefined)
              z.object({})
                .strict()
                .parse(r.body ?? {});
            return s.apply(r.principal, p.workspaceId, p.id, key);
          }
          return s[action](r.principal, p.workspaceId, p.id);
        });
      api.get('/workspaces/:workspaceId/changes/:id/reviews', async (r) => {
        const p = params(r.params);
        return s.listReviews(r.principal, p.workspaceId, p.id);
      });
      api.post('/workspaces/:workspaceId/changes/:id/reviews', async (r, reply) => {
        const p = params(r.params);
        return reply.code(201).send(
          s.addReview(
            r.principal,
            p.workspaceId,
            p.id,
            z
              .object({ body: label(4000) })
              .strict()
              .parse(r.body).body,
          ),
        );
      });
      api.get('/workspaces/:workspaceId/tasks', async (r) =>
        s.listTasks(r.principal, params(r.params).workspaceId),
      );
      api.post('/workspaces/:workspaceId/tasks', async (r, reply) =>
        reply.code(201).send(
          s.createTask(
            r.principal,
            params(r.params).workspaceId,
            z
              .object({ title: label(200), instructions: label(8000), assigneeId: z.string() })
              .strict()
              .parse(r.body),
          ),
        ),
      );
      api.patch('/workspaces/:workspaceId/tasks/:id', async (r) => {
        const p = params(r.params);
        return s.updateTask(
          r.principal,
          p.workspaceId,
          p.id,
          z
            .object({
              assigneeId: z.string().optional(),
              status: z.enum(['open', 'in_progress', 'done']).optional(),
            })
            .strict()
            .refine((v) => Object.keys(v).length > 0)
            .parse(r.body),
        );
      });
    },
    { prefix: '/v1' },
  );
  if (options.webRoot && existsSync(options.webRoot)) {
    await app.register(staticFiles, { root: options.webRoot, index: ['index.html'], list: false });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/v1')
        ? reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'API route not found.' } })
        : reply.sendFile('index.html'),
    );
  }
  return app;
}
