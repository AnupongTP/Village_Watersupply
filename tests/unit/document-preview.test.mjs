import test from 'node:test';
import assert from 'node:assert/strict';
import {
  safeHttpUrl,
  buildDocumentPreviewUrl,
  documentLinkInfo
} from '../../assets/js/document-preview.js';

test('rejects unsafe document URL schemes', () => {
  assert.equal(safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(safeHttpUrl('data:text/html,hello'), '');
});

test('normalizes DLA public PDFs to web preview viewer', () => {
  const source = 'http://info.dla.go.th/download/WaterSupply/20230724/example.pdf';
  const preview = buildDocumentPreviewUrl(source);
  const url = new URL(preview);

  assert.equal(url.hostname, 'docs.google.com');
  assert.equal(url.pathname, '/gview');
  assert.equal(url.searchParams.get('url'), source);
});

test('normalizes Google Drive file links to preview mode', () => {
  const preview = buildDocumentPreviewUrl('https://drive.google.com/file/d/abcDEF123/view?usp=sharing');
  assert.equal(preview, 'https://drive.google.com/file/d/abcDEF123/preview');
});

test('normalizes Google Workspace links to preview mode', () => {
  const preview = buildDocumentPreviewUrl('https://docs.google.com/document/d/abcDEF123/edit');
  assert.equal(preview, 'https://docs.google.com/document/d/abcDEF123/preview');
});

test('documentLinkInfo reports availability without exposing unsafe URL', () => {
  assert.deepEqual(documentLinkInfo('javascript:alert(1)'), {
    available: false,
    originalUrl: '',
    previewUrl: '',
    previewMode: 'none'
  });
});
