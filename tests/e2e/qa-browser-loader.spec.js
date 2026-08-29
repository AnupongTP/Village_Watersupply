import { test, expect } from '@playwright/test';

test('temporary QA candidate loader reaches verified source state', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror:' + err.message));

  await page.goto('/qa-browser-harness-candidate/?ci=' + Date.now(), { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => page.evaluate(() => ({
    verified: window.__QA_CANDIDATE_SOURCE_VERIFIED || null,
    loadError: window.__QA_CANDIDATE_LOAD_ERROR || '',
    status: document.getElementById('status')?.textContent || '',
    loginRendered: Boolean(document.getElementById('loginForm')),
    ready: document.readyState
  })), {
    timeout: 20_000,
    intervals: [100, 250, 500, 1000]
  }).toMatchObject({
    verified: {
      html: '265545664ed8b374809072077f36a17fb57de304715b7678657ab8e4595ca7f4',
      js: 'de2b7a3f6fd86dde45b7fde39f849fbb4f692c9b72e9669fb7996c9f2b953357',
      css: 'b0650ddcd3ab11adf3e2c4b84f333e7a9bbc67395e79b4a55cc98bee699c501a'
    },
    loadError: '',
    loginRendered: true
  });

  const snapshot = await page.evaluate(() => ({
    verified: window.__QA_CANDIDATE_SOURCE_VERIFIED || null,
    loadError: window.__QA_CANDIDATE_LOAD_ERROR || '',
    status: document.getElementById('status')?.textContent || '',
    loginRendered: Boolean(document.getElementById('loginForm')),
    ready: document.readyState
  }));
  console.log('QA_LOADER_SNAPSHOT=' + JSON.stringify(snapshot));
  console.log('QA_LOADER_CONSOLE_ERRORS=' + JSON.stringify(consoleErrors));
  expect(snapshot.loadError).toBe('');
  expect(consoleErrors).toEqual([]);
});

test('temporary QA browser harness verifies logout only after triggering logout and has fail-safe cleanup', async ({ page }) => {
  await page.goto('/qa-browser-harness/?ci=' + Date.now(), { waitUntil: 'domcontentloaded' });
  const source = await page.locator('script').last().textContent();

  const logoutClick = source.indexOf("d.getElementById('logoutButton').click()");
  const logoutObservedCheck = source.indexOf("candidate auth.logout observed over real browser fetch");
  const requiredActionCheck = source.indexOf('const requiredMissing=REQUIRED_ACTIONS.filter');
  const cleanupCall = source.indexOf('const cleanupSafe=await cleanupCandidateSession();');
  const evidenceCall = source.indexOf('const evidence=await writeEvidence');

  expect(source).toContain("const REQUIRED_ACTIONS = ['auth.login','data.bootstrap','data.dashboard','data.waterSystem'];");
  expect(logoutClick).toBeGreaterThan(0);
  expect(logoutObservedCheck).toBeGreaterThan(logoutClick);
  expect(requiredActionCheck).toBeGreaterThan(logoutObservedCheck);
  expect(source).toContain('async function cleanupCandidateSession(){');
  expect(cleanupCall).toBeGreaterThan(0);
  expect(evidenceCall).toBeGreaterThan(cleanupCall);
});
