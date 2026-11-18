import { test, expect } from '@playwright/test';
import { openDashboard, openMapPopupForSystem } from './helpers.js';

const SYSTEM_WITH_DOCUMENT = 'PY-W-000001';

test('map popup exposes shared detail action and excludes private transfer_document_url on Public', async ({ page }) => {
  await openDashboard(page);
  const popup = await openMapPopupForSystem(page, SYSTEM_WITH_DOCUMENT);

  const detailButton = popup.locator(`[data-open-system="${SYSTEM_WITH_DOCUMENT}"]`);
  const navigateLink = popup.locator('a[href*="google.com/maps"]');
  const appleLink = popup.locator('a[href*="maps.apple.com"]');
  await expect(detailButton).toBeVisible();
  await expect(navigateLink).toBeVisible();
  await expect(appleLink).toBeVisible();

  await detailButton.click();
  const modal = page.locator('#referenceDetail');
  await expect(modal).toBeVisible();
  await expect(modal).toContainText('ระบบประปาตัวอย่าง 1');
  await expect(modal.locator('a[data-document-preview]')).toHaveCount(0);

  // When a non-public/raw record includes transfer_document_url, system-detail renders a preview-first link without download
  const previewCard = await page.evaluate(async () => {
    const { buildSystemDetailHtml } = await import('/assets/js/system-detail.js');
    const html = buildSystemDetailHtml(
      {
        system_id: 'PY-W-000001',
        system_name: 'ระบบทดสอบเอกสาร',
        establishment_type: 'TRANSFERRED',
        transfer_document_status: 'AVAILABLE',
        transfer_document_url: 'http://info.dla.go.th/download/WaterSupply/test.pdf'
      },
      { village_name: 'บ้านทดสอบ', district: 'จุน', local_authority: 'เทศบาลตำบลจุน' }
    );
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    const link = wrap.querySelector('a[data-document-preview]');
    return {
      href: link?.getAttribute('href') || '',
      download: link?.getAttribute('download')
    };
  });
  expect(previewCard.href).toContain('https://docs.google.com/gview');
  expect(previewCard.download).toBeNull();
});

test('popup navigation link carries Google Maps destination coordinates and safe rel', async ({ page }) => {
  await openDashboard(page);
  const popup = await openMapPopupForSystem(page, SYSTEM_WITH_DOCUMENT);
  const navigateLink = popup.locator('a[href*="google.com/maps"]');
  const href = await navigateLink.getAttribute('href');
  expect(href).toContain('https://www.google.com/maps?q=19.32,100.17');
  expect(await navigateLink.getAttribute('target')).toBe('_blank');
  expect(await navigateLink.getAttribute('rel')).toContain('noopener');
});
