import { emailDocument, fetchDocumentPdf, DocumentType } from '../api/documentsApi';

type DownloadDocumentParams = {
  id: string;
  type: DocumentType;
  filename?: string;
  token?: string;
};

type SendDocumentParams = {
  id: string;
  type: DocumentType;
  to: string;
  token?: string;
};

const FILENAME_SANITIZE_REGEX = /[^a-z0-9-_]+/gi;

function sanitizeFilename(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.replace(FILENAME_SANITIZE_REGEX, '-');
  const compact = normalized.replace(/-{2,}/g, '-');
  return compact.replace(/^-+|-+$/g, '') || 'document';
}

export async function downloadDocumentPdf({
  id,
  type,
  filename,
  token,
}: DownloadDocumentParams): Promise<void> {
  const blob = await fetchDocumentPdf({ id, type, token });

  if (typeof window === 'undefined') {
    return;
  }

  const anchor = document.createElement('a');
  const url = window.URL.createObjectURL(blob);
  const baseName = filename && filename.trim().length > 0
    ? sanitizeFilename(filename)
    : sanitizeFilename(`${type}-${id}`);

  anchor.href = url;
  anchor.download = `${baseName}.pdf`;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  window.URL.revokeObjectURL(url);
}

export async function sendDocumentByEmail({
  id,
  type,
  to,
  token,
}: SendDocumentParams): Promise<{ ok: boolean; sentTo?: string }> {
  return emailDocument({ id, type, to, token });
}
