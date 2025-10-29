import {
  emailDocument,
  fetchDocumentPdf,
  DocumentPdfDownload,
  DocumentType,
} from '../api/documentsApi';

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

function ensurePdfExtension(filename: string): string {
  return filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`;
}

function resolveDownloadFilename(
  apiResult: DocumentPdfDownload,
  fallbackBase: string,
): string {
  const serverFilename = apiResult.filename?.trim();
  if (serverFilename) {
    const withoutPdfExtension = serverFilename.toLowerCase().endsWith('.pdf')
      ? serverFilename.slice(0, -4)
      : serverFilename;
    const sanitized = sanitizeFilename(withoutPdfExtension);
    if (sanitized) {
      return ensurePdfExtension(sanitized);
    }
  }

  return ensurePdfExtension(fallbackBase);
}

export async function downloadDocumentPdf({
  id,
  type,
  filename,
  token,
}: DownloadDocumentParams): Promise<void> {
  const downloadData = await fetchDocumentPdf({ id, type, token });

  if (typeof window === 'undefined') {
    return;
  }

  const baseName = filename && filename.trim().length > 0
    ? sanitizeFilename(filename)
    : sanitizeFilename(`${type}-${id}`);
  const downloadName = resolveDownloadFilename(downloadData, baseName);

  const navigatorWithSave = window.navigator as Navigator & {
    msSaveOrOpenBlob?: (blob: Blob, defaultName?: string) => void;
  };

  if (navigatorWithSave?.msSaveOrOpenBlob) {
    navigatorWithSave.msSaveOrOpenBlob(downloadData.blob, downloadName);
    return;
  }

  const anchor = document.createElement('a');
  const url = window.URL.createObjectURL(downloadData.blob);
  anchor.href = url;
  anchor.download = downloadName;
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
