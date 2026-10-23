import { test, expect } from '@playwright/test';
const token = 'browser-test-operator-token-at-least-24';
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
  await page.route('**/history?path=%2Fa.md', async (route) => {
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
