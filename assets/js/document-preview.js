const GOOGLE_DOCS_VIEWER = 'https://docs.google.com/gview';

export function safeHttpUrl(value) {
  if (!value) return '';

  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch (_) {
    return '';
  }
}

export function buildDocumentPreviewUrl(value) {
  const safeUrl = safeHttpUrl(value);
  if (!safeUrl) return '';

  const googleNativePreview = buildGoogleWorkspacePreviewUrl(safeUrl);
  if (googleNativePreview) return googleNativePreview;

  const url = new URL(safeUrl);
  const pathname = url.pathname.toLowerCase();
  const looksLikePdf = pathname.endsWith('.pdf') || pathname.endsWith('.pdf/');

  // เอกสารอ้างอิงจริงในฐานข้อมูลปัจจุบันเป็น PDF สาธารณะจาก info.dla.go.th
  // ปลายทางดังกล่าวมักบังคับ download ผ่าน Content-Disposition
  // จึงเปิดผ่าน Google Docs Viewer เพื่อให้ผู้ใช้ preview ใน browser ก่อน
  if (looksLikePdf || url.hostname === 'info.dla.go.th') {
    const viewer = new URL(GOOGLE_DOCS_VIEWER);
    viewer.searchParams.set('embedded', 'false');
    viewer.searchParams.set('url', safeUrl);
    return viewer.href;
  }

  return safeUrl;
}

export function documentLinkInfo(value) {
  const originalUrl = safeHttpUrl(value);

  if (!originalUrl) {
    return {
      available: false,
      originalUrl: '',
      previewUrl: '',
      previewMode: 'none'
    };
  }

  const previewUrl = buildDocumentPreviewUrl(originalUrl);
  let previewMode = 'direct-web';

  if (previewUrl.includes('docs.google.com/gview')) {
    previewMode = 'google-viewer';
  } else if (previewUrl.includes('/preview')) {
    previewMode = 'google-native-preview';
  }

  return {
    available: true,
    originalUrl,
    previewUrl,
    previewMode
  };
}

function buildGoogleWorkspacePreviewUrl(value) {
  const url = new URL(value);

  if (url.hostname === 'drive.google.com') {
    const fileMatch = url.pathname.match(/\/file\/d\/([^/]+)/);
    const idFromQuery = url.searchParams.get('id');
    const fileId = fileMatch?.[1] || idFromQuery;

    if (fileId) {
      return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`;
    }
  }

  if (url.hostname === 'docs.google.com') {
    const match = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/);

    if (match) {
      return `https://docs.google.com/${match[1]}/d/${encodeURIComponent(match[2])}/preview`;
    }
  }

  return '';
}
