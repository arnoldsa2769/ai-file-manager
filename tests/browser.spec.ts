import { test, expect, type APIRequestContext } from '@playwright/test';
const token = 'browser-test-operator-token-at-least-24';
async function accessFixture(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${token}` };
  const base = 'http://127.0.0.1:17310/v1/workspaces';
  const workspace = await (
    await request.post(base, { headers, data: { name: 'Permission inspection' } })
  ).json();
  const root = `${base}/${workspace.id}`;
  const identity = await (
    await request.post(`${root}/agents`, {
      headers,
      data: { name: 'Scoped writer', domain: 'Drafts', provider: 'External' },
    })
  ).json();
  await request.post(`${root}/grants`, {
    headers,
    data: {
      agentId: identity.agent.id,
      scope: '/drafts',
      actions: ['read', 'write'],
      effect: 'allow',
    },
  });
  const deny = await (
    await request.post(`${root}/grants`, {
      headers,
      data: {
        agentId: identity.agent.id,
        scope: '/drafts/private',
        actions: ['read'],
        effect: 'deny',
      },
    })
  ).json();
  return { workspace, identity, deny };
}
test('permission inspector explains effective read prerequisites and explicit denies', async ({
  page,
  request,
}) => {
  const { workspace, identity, deny } = await accessFixture(request);
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  await page.getByLabel('Inspect agent', { exact: true }).selectOption(identity.agent.id);
  await page.getByLabel('Inspect virtual path', { exact: true }).fill('/drafts/private/a.md');
  await page.getByRole('button', { name: 'Check access', exact: true }).click();
  const results = page.getByRole('region', { name: 'Access check results', exact: true });
  await expect(results.getByRole('row').filter({ hasText: 'Propose edits' })).toContainText(
    'Denied',
  );
  await results.getByText('Explain read', { exact: true }).click();
  await expect(results).toContainText('Explicit deny');
  await expect(results).toContainText(deny.id);
  await page.getByLabel('Inspect virtual path', { exact: true }).fill('/drafts/open.md');
  await expect(results).not.toBeVisible();
  await page.getByRole('button', { name: 'Check access', exact: true }).click();
  await expect(results.getByRole('row').filter({ hasText: 'Propose edits' })).toContainText(
    'Allowed',
  );
  await page.screenshot({
    path: 'test-results/access-inspector-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'test-results/access-inspector-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
});
test('permission preview retries failures and discards late results after inputs change', async ({
  page,
  request,
}) => {
  const { workspace } = await accessFixture(request);
  let recover = false;
  let release!: () => void;
  let reached!: () => void;
  const delayed = new Promise<void>((r) => {
    release = r;
  });
  const requested = new Promise<void>((r) => {
    reached = r;
  });
  await page.route('**/access/check', async (route) => {
    if (!recover)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAVAILABLE', message: 'Permission preview temporarily unavailable.' },
        }),
      });
    else if (route.request().postDataJSON().checks[0].path === '/drafts/slow.md') {
      const response = await route.fetch();
      reached();
      await delayed;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  await page.getByLabel('Inspect virtual path', { exact: true }).fill('/drafts/private/a.md');
  await page.getByRole('button', { name: 'Check access', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Permission preview temporarily unavailable.',
  );
  recover = true;
  await page.getByRole('button', { name: 'Retry access check', exact: true }).click();
  const results = page.getByRole('region', { name: 'Access check results', exact: true });
  await expect(results).toContainText('/drafts/private/a.md');
  await page.getByLabel('Inspect virtual path', { exact: true }).fill('/drafts/slow.md');
  await page.getByRole('button', { name: 'Check access', exact: true }).click();
  await requested;
  await page.getByLabel('Inspect virtual path', { exact: true }).fill('/drafts/new.md');
  await page.getByRole('button', { name: 'Check access', exact: true }).click();
  await expect(results).toContainText('/drafts/new.md');
  const late = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith('/access/check') &&
      r.request().postDataJSON().checks[0].path === '/drafts/slow.md',
  );
  release();
  await (await late).finished();
  await expect(results).toContainText('/drafts/new.md');
  await expect(results).not.toContainText('/drafts/slow.md');
});
test('permission inspector clears a selected identity when refresh removes its loaded option', async ({
  page,
  request,
}) => {
  const { workspace, identity } = await accessFixture(request);
  const headers = { Authorization: `Bearer ${token}` };
  for (let index = 0; index < 26; index++) {
    await request.post(`http://127.0.0.1:17310/v1/workspaces/${workspace.id}/agents`, {
      headers,
      data: { name: `New agent ${index}`, domain: 'Other', provider: 'External' },
    });
  }
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  await page.getByRole('button', { name: 'Load more agents', exact: true }).click();
  const selector = page.getByLabel('Inspect agent', { exact: true });
  await selector.selectOption(identity.agent.id);
  await page.getByRole('button', { name: 'Check access', exact: true }).click();
  const results = page.getByRole('region', { name: 'Access check results', exact: true });
  await expect(results).toBeVisible();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(selector).not.toHaveValue(identity.agent.id);
  await expect(results).not.toBeVisible();
  const selected = await selector.inputValue();
  const checked = page.waitForRequest((r) => new URL(r.url()).pathname.endsWith('/access/check'));
  await page.getByRole('button', { name: 'Check access', exact: true }).click();
  expect((await checked).postDataJSON().agentId).toBe(selected);
  await expect(results).toBeVisible();
});

async function pagedFixture(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${token}` };
  const base = 'http://127.0.0.1:17310/v1/workspaces';
  const workspace = await (
    await request.post(base, { headers, data: { name: 'Paged workspace' } })
  ).json();
  const root = `${base}/${workspace.id}`;
  for (let start = 0; start < 30; start += 15) {
    const change = await (
      await request.post(`${root}/changes`, {
        headers,
        data: {
          title: `Seed documents ${start}`,
          operations: Array.from({ length: 15 }, (_, n) => ({
            path: `/docs/file-${String(start + n).padStart(2, '0')}.md`,
            baseRevision: null,
            content: `LAZY_BODY_${start + n}\n${'x'.repeat(8192)}`,
          })),
        },
      })
    ).json();
    await request.post(`${root}/changes/${change.id}/approve`, { headers, data: {} });
    await request.post(`${root}/changes/${change.id}/apply`, { headers, data: {} });
  }
  return { workspace, root, headers };
}

test('console loads metadata pages, searches across unloaded documents, and fetches selected bodies only', async ({
  page,
  request,
}, testInfo) => {
  const { workspace, root, headers } = await pagedFixture(request);
  const legacyBytes = (await (await request.get(`${root}/overview`, { headers })).body()).length;
  const forbidden: string[] = [];
  const bodies: Promise<Buffer>[] = [];
  const details: string[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.endsWith('/overview') || /\/(documents|changes|history|tasks)$/.test(path))
      forbidden.push(path);
    if (path.endsWith('/document')) details.push(path);
  });
  page.on('response', (r) => {
    if (
      r.url().includes(`/workspaces/${workspace.id}/`) &&
      (new URL(r.url()).pathname.endsWith('/page') ||
        new URL(r.url()).pathname.endsWith('/summary'))
    )
      bodies.push(r.body());
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('button', { name: '/docs/file-29.md', exact: true })).toBeVisible();
  expect(forbidden).toEqual([]);
  expect(details).toEqual([]);
  await expect(
    page.getByRole('button', { name: '/docs/file-00.md', exact: true }),
  ).not.toBeVisible();
  await page.getByRole('button', { name: 'Load more documents', exact: true }).click();
  await expect(page.getByRole('button', { name: '/docs/file-00.md', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '/docs/file-00.md', exact: true }).click();
  await expect(page.locator('.document-content')).toContainText('LAZY_BODY_0');
  await page.getByLabel('Search documents').fill('file-01');
  await expect(page.getByRole('button', { name: '/docs/file-01.md', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: '/docs/file-29.md', exact: true }),
  ).not.toBeVisible();
  const metadata = await Promise.all(bodies);
  expect(metadata.every((b) => !b.toString().includes('LAZY_BODY_'))).toBe(true);
  const metadataBytes = metadata.reduce((sum, b) => sum + b.length, 0);
  expect(metadataBytes).toBeLessThan(legacyBytes / 3);
  await testInfo.attach('metadata-transfer.json', {
    body: JSON.stringify({ legacyOverviewBytes: legacyBytes, metadataBytes }),
    contentType: 'application/json',
  });
});

test('document detail failures can retry and late detail responses cannot replace a new selection', async ({
  page,
  request,
}) => {
  const { workspace } = await pagedFixture(request);
  let recover = false;
  await page.route('**/document?path=%2Fdocs%2Ffile-29.md*', async (route) => {
    if (!recover)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAVAILABLE', message: 'Document temporarily unavailable.' },
        }),
      });
    else await route.continue();
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: '/docs/file-29.md', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Document temporarily unavailable.');
  recover = true;
  await page.getByRole('button', { name: 'Retry document', exact: true }).click();
  await expect(page.locator('.document-content')).toContainText('LAZY_BODY_29');
  let release!: () => void;
  let reached!: () => void;
  const delayed = new Promise<void>((r) => {
    release = r;
  });
  const requested = new Promise<void>((r) => {
    reached = r;
  });
  await page.route('**/document?path=%2Fdocs%2Ffile-28.md*', async (route) => {
    const response = await route.fetch();
    reached();
    await delayed;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: '/docs/file-28.md', exact: true }).click();
  await requested;
  await page.getByRole('button', { name: '/docs/file-27.md', exact: true }).click();
  await expect(page.locator('.document-content')).toContainText('LAZY_BODY_27');
  const late = page.waitForResponse(
    (r) => new URL(r.url()).searchParams.get('path') === '/docs/file-28.md',
  );
  release();
  await (await late).finished();
  await expect(page.locator('.document-content')).toContainText('LAZY_BODY_27');
  await expect(page.locator('.document-content')).not.toContainText('LAZY_BODY_28');
});

test('change status filtering reaches proposals outside the loaded page and paginated failures can retry', async ({
  page,
  request,
}) => {
  const { workspace, root, headers } = await pagedFixture(request);
  for (let n = 0; n < 27; n++)
    await request.post(`${root}/changes`, {
      headers,
      data: {
        title: `Pending page ${n}`,
        operations: [{ path: `/new-${n}.md`, baseRevision: null, content: `Pending content ${n}` }],
      },
    });
  let failPage = true;
  await page.route(`**/workspaces/${workspace.id}/changes/page?*`, async (route) => {
    if (failPage)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAVAILABLE', message: 'Change listing temporarily unavailable.' },
        }),
      });
    else await route.continue();
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Change sets', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Change listing temporarily unavailable.');
  failPage = false;
  await page.getByRole('button', { name: 'Retry change sets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pending page 26', exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Load more change sets', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pending page 0', exact: false })).toBeVisible();
  await page.getByRole('combobox', { name: 'Change status', exact: true }).selectOption('applied');
  await expect(page.getByRole('button', { name: 'Seed documents 0', exact: false })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pending page 26', exact: false }),
  ).not.toBeVisible();
});

test('late load-more responses cannot append into a fresh traversal after a search round trip', async ({
  page,
  request,
}) => {
  const { workspace } = await pagedFixture(request);
  let release!: () => void;
  let reached!: () => void;
  const delayed = new Promise<void>((r) => {
    release = r;
  });
  const requested = new Promise<void>((r) => {
    reached = r;
  });
  await page.route(`**/workspaces/${workspace.id}/documents/page?*`, async (route) => {
    if (new URL(route.request().url()).searchParams.has('cursor')) {
      const response = await route.fetch();
      reached();
      await delayed;
      await route.fulfill({ response });
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'Load more documents', exact: true }).click();
  await requested;
  await page.getByLabel('Search documents').fill('file-29');
  await expect(
    page.getByRole('button', { name: '/docs/file-28.md', exact: true }),
  ).not.toBeVisible();
  await page.getByLabel('Search documents').fill('');
  await expect(page.getByRole('button', { name: '/docs/file-28.md', exact: true })).toBeVisible();
  const late = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith('/documents/page') &&
      new URL(r.url()).searchParams.has('cursor'),
  );
  release();
  await (await late).finished();
  await expect(
    page.getByRole('button', { name: '/docs/file-00.md', exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Load more documents', exact: true }),
  ).toBeEnabled();
});
test('overview never attributes an unloaded agent proposal to the operator', async ({
  page,
  request,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  const base = 'http://127.0.0.1:17310/v1/workspaces';
  const workspace = await (
    await request.post(base, { headers, data: { name: 'Partial identity attribution' } })
  ).json();
  const root = `${base}/${workspace.id}`;
  const author = await (
    await request.post(`${root}/agents`, {
      headers,
      data: { name: 'Original author', domain: 'Drafts', provider: 'External' },
    })
  ).json();
  await request.post(`${root}/grants`, {
    headers,
    data: { agentId: author.agent.id, scope: '/', actions: ['read', 'write'], effect: 'allow' },
  });
  for (let n = 0; n < 25; n++)
    await request.post(`${root}/agents`, {
      headers,
      data: { name: `Later identity ${n}`, domain: 'Drafts', provider: 'External' },
    });
  await request.post(`${root}/changes`, {
    headers: { Authorization: `Bearer ${author.token}` },
    data: {
      title: 'Attributed agent proposal',
      operations: [{ path: '/authored.md', baseRevision: null, content: 'Agent-authored content' }],
    },
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  const row = page.getByRole('button', { name: /Attributed agent proposal/ });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText('Operator');
  await expect(row).toContainText(author.agent.id.slice(0, 8));
});

async function reviewFixture(request: APIRequestContext) {
  const headers = { Authorization: `Bearer ${token}` };
  const base = 'http://127.0.0.1:17310/v1/workspaces';
  const workspace = await (
    await request.post(base, { headers, data: { name: 'Exact revision review' } })
  ).json();
  const root = `${base}/${workspace.id}`;
  async function propose(
    title: string,
    path: string,
    baseRevision: string | null,
    content: string,
  ) {
    return (
      await request.post(`${root}/changes`, {
        headers,
        data: { title, operations: [{ path, baseRevision, content }] },
      })
    ).json();
  }
  async function publish(
    title: string,
    path: string,
    baseRevision: string | null,
    content: string,
  ) {
    const change = await propose(title, path, baseRevision, content);
    expect(
      (await request.post(`${root}/changes/${change.id}/approve`, { headers, data: {} })).ok(),
    ).toBe(true);
    expect(
      (await request.post(`${root}/changes/${change.id}/apply`, { headers, data: {} })).ok(),
    ).toBe(true);
    return (
      await request.get(`${root}/document?path=${encodeURIComponent(path)}`, { headers })
    ).json();
  }
  const original = await publish('Original A', '/drafts/a.md', null, 'Exact historical A');
  const other = await publish('Original B', '/drafts/b.md', null, 'Independent historical B');
  const first = await propose(
    'Review historical A',
    '/drafts/a.md',
    original.currentRevision,
    'Proposed A',
  );
  const second = await propose(
    'Review historical B',
    '/drafts/b.md',
    other.currentRevision,
    'Proposed B',
  );
  let head = original.currentRevision;
  for (let index = 0; index < 8; index++) {
    const current = await publish(
      `Advance A ${index}`,
      '/drafts/a.md',
      head,
      `Unrelated later revision ${index}\n${'x'.repeat(4096)}`,
    );
    head = current.currentRevision;
  }
  return { workspace, root, headers, first, second, original, propose };
}
test('operator reviews and applies an agent change then inspects history on desktop and mobile', async ({
  page,
  request,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  const base = 'http://127.0.0.1:17310/v1/workspaces';
  const w = await (
    await request.post(base, { headers, data: { name: 'Browser integration workspace' } })
  ).json();
  const identity = await (
    await request.post(`${base}/${w.id}/agents`, {
      headers,
      data: { name: 'Browser writer', domain: 'Drafts', provider: 'External' },
    })
  ).json();
  await request.post(`${base}/${w.id}/grants`, {
    headers,
    data: {
      agentId: identity.agent.id,
      scope: '/drafts',
      actions: ['read', 'write'],
      effect: 'allow',
    },
  });
  await request.post(`${base}/${w.id}/changes`, {
    headers: { Authorization: `Bearer ${identity.token}` },
    data: {
      title: 'Browser draft proposal',
      operations: [
        { path: '/drafts/browser.md', baseRevision: null, content: 'A real persisted draft.' },
      ],
    },
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Workspace overview' })).toBeVisible();
  await page.getByRole('button', { name: 'Change sets', exact: true }).click();
  await page.getByRole('button', { name: 'Browser draft proposal' }).click();
  await expect(page.getByText('A real persisted draft.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve change', exact: true }).click();
  await page.getByRole('button', { name: 'Apply change', exact: true }).click();
  await expect(page.getByText('Change applied successfully.')).toBeVisible();
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: '/drafts/browser.md', exact: true }).click();
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: 'test-results/workspace-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agent identities' })).toBeVisible();
  await expect(page.getByText('Browser writer', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: 'test-results/workspace-mobile.png',
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Operator token')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('afm.operator'))).toBe(null);
});
test('late history responses cannot expose another document restore action', async ({
  page,
  request,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  const base = 'http://127.0.0.1:17310/v1/workspaces';
  const w = await (
    await request.post(base, { headers, data: { name: 'History isolation workspace' } })
  ).json();
  const change = await (
    await request.post(`${base}/${w.id}/changes`, {
      headers,
      data: {
        title: 'Two distinct documents',
        operations: [
          { path: '/a.md', baseRevision: null, content: 'Private A history' },
          { path: '/b.md', baseRevision: null, content: 'Independent B content' },
        ],
      },
    })
  ).json();
  await request.post(`${base}/${w.id}/changes/${change.id}/approve`, { headers, data: {} });
  await request.post(`${base}/${w.id}/changes/${change.id}/apply`, { headers, data: {} });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(w.id);
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: '/a.md', exact: true }).click();
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached!: () => void;
  const requested = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route('**/history/page?path=%2Fa.md*', async (route) => {
    const response = await route.fetch();
    reached();
    await delayed;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Version history', exact: true }).click();
  await requested;
  await page.getByRole('button', { name: '/b.md', exact: true }).click();
  release();
  await expect(page.getByText('Working...')).not.toBeVisible();
  await expect(page.getByText('Independent B content', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Version history', exact: true }),
  ).not.toBeVisible();
  await expect(page.getByText('Private A history', { exact: true })).not.toBeVisible();
});
test('rejected proposals and grants explain failures inside the active dialog', async ({
  page,
  request,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  const base = 'http://127.0.0.1:17310/v1/workspaces';
  const w = await (
    await request.post(base, { headers, data: { name: 'Dialog recovery workspace' } })
  ).json();
  await request.post(`${base}/${w.id}/agents`, {
    headers,
    data: { name: 'Dialog agent', domain: 'Research', provider: 'External' },
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(w.id);
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'New document proposal' });
  await editor.getByLabel('Virtual path').fill('/a/../b');
  await editor.getByLabel('Document content').fill('Preserve this draft after validation fails.');
  await editor.getByRole('button', { name: 'Submit proposal' }).click();
  await expect(editor.getByRole('alert')).toContainText('traversal');
  await expect(editor.getByLabel('Document content')).toHaveValue(
    'Preserve this draft after validation fails.',
  );
  await editor.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  await page.getByRole('button', { name: 'Add grant', exact: true }).click();
  const grant = page.getByRole('dialog', { name: 'Add scoped grant' });
  await grant.getByRole('checkbox', { name: 'read', exact: true }).uncheck();
  await grant.getByRole('button', { name: 'Save grant' }).click();
  await expect(grant.getByRole('alert')).toContainText('schema');
  await grant.getByRole('checkbox', { name: 'read', exact: true }).check();
  await grant.getByRole('button', { name: 'Save grant' }).click();
  await expect(grant).not.toBeVisible();
  await expect(page.getByText('Scoped grant created.', { exact: true })).toBeVisible();
});

test('change review loads only exact historical snapshots instead of complete history', async ({
  page,
  request,
}, testInfo) => {
  const { workspace, root, headers } = await reviewFixture(request);
  const fullHistory = await (
    await request.get(`${root}/history?path=%2Fdrafts%2Fa.md`, { headers })
  ).body();
  const historyRequests: string[] = [];
  const revisionBodies: Promise<Buffer>[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.endsWith('/history')) historyRequests.push(r.url());
  });
  page.on('response', (r) => {
    if (new URL(r.url()).pathname.endsWith('/revision')) revisionBodies.push(r.body());
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Change sets', exact: true }).click();
  await page.getByRole('button', { name: 'Review historical A', exact: false }).click();
  await expect(page.getByText('Exact historical A', { exact: true })).toBeVisible();
  await expect(page.getByText('Proposed A', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve change', exact: true })).toBeEnabled();
  expect(historyRequests).toHaveLength(0);
  const bodies = await Promise.all(revisionBodies);
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.length).toBeLessThanOrEqual(2); // Development StrictMode may repeat the initial effect.
  const exactBytes = bodies.reduce((total, body) => total + body.length, 0);
  expect(exactBytes).toBeLessThan(fullHistory.length / 10);
  await testInfo.attach('revision-transfer.json', {
    body: JSON.stringify({ historyBytes: fullHistory.length, exactRevisionBytes: exactBytes }),
    contentType: 'application/json',
  });
  await page.screenshot({
    path: 'test-results/exact-revision-review.png',
    fullPage: true,
    animations: 'disabled',
  });
});

test('late exact snapshots cannot replace another selected proposal', async ({ page, request }) => {
  const { workspace } = await reviewFixture(request);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reached!: () => void;
  const requested = new Promise<void>((resolve) => {
    reached = resolve;
  });
  await page.route('**/revision?path=%2Fdrafts%2Fa.md&revisionId=*', async (route) => {
    const response = await route.fetch();
    reached();
    await delayed;
    await route.fulfill({ response });
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Change sets', exact: true }).click();
  await page.getByRole('button', { name: 'Review historical A', exact: false }).click();
  await requested;
  await expect(page.getByRole('button', { name: 'Approve change', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Review historical B', exact: false }).click();
  await expect(page.getByText('Independent historical B', { exact: true })).toBeVisible();
  const lateResponse = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname.endsWith('/revision') &&
      new URL(r.url()).searchParams.get('path') === '/drafts/a.md',
  );
  release();
  await (await lateResponse).finished();
  await expect(page.getByText('Independent historical B', { exact: true })).toBeVisible();
  await expect(page.getByText('Exact historical A', { exact: true })).not.toBeVisible();
  await expect(page.getByText('Proposed B', { exact: true })).toBeVisible();
});

test('unavailable base revisions fail closed and allow snapshot retries', async ({
  page,
  request,
}) => {
  const { workspace, root, headers, first } = await reviewFixture(request);
  let recover = false;
  await page.route('**/revision?path=%2Fdrafts%2Fa.md&revisionId=*', async (route) => {
    if (!recover)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'TEMPORARY_FAILURE', message: 'Snapshot temporarily unavailable.' },
        }),
      });
    else await route.continue();
  });
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Change sets', exact: true }).click();
  await page.getByRole('button', { name: 'Review historical A', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('Snapshot temporarily unavailable.');
  await expect(page.getByRole('button', { name: 'Approve change', exact: true })).toBeDisabled();
  await expect(page.getByText('Loading exact revision snapshots...')).not.toBeVisible();
  expect(
    (await (await request.get(`${root}/changes/${first.id}`, { headers })).json()).status,
  ).toBe('pending');
  recover = true;
  await page.getByRole('button', { name: 'Retry snapshots', exact: true }).click();
  await expect(page.getByText('Exact historical A', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve change', exact: true })).toBeEnabled();
});

test('padded opaque base IDs never enable approval through revision normalization', async ({
  page,
  request,
}) => {
  const { workspace, original, propose } = await reviewFixture(request);
  await propose(
    'Padded base ID',
    '/drafts/a.md',
    ` ${original.currentRevision} `,
    'Must stay unapproved',
  );
  await page.goto('/');
  await page.getByLabel('Operator token').fill(token);
  await page.getByRole('button', { name: 'Connect workspace' }).click();
  await page.getByLabel('Active workspace').selectOption(workspace.id);
  await page.getByRole('button', { name: 'Change sets', exact: true }).click();
  await page.getByRole('button', { name: 'Padded base ID', exact: false }).click();
  await expect(page.getByRole('alert')).toContainText('surrounding whitespace');
  await expect(page.getByRole('button', { name: 'Approve change', exact: true })).toBeDisabled();
  await expect(page.getByText('Exact historical A', { exact: true })).not.toBeVisible();
});
