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
  subject?: string;
  body?: string;
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
  subject,
  body,
  token,
}: SendDocumentParams): Promise<{ ok: boolean; sentTo?: string }> {
  return emailDocument({ id, type, to, subject, body, token });
}

const EURO_FORMATTER = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const DOCUMENT_LABEL: Record<DocumentType, string> = {
  quote: 'devis',
  invoice: 'facture',
};

export const EMAIL_TEMPLATE_TOKENS: Record<string, string> = {
  '{{documentNumber}}': 'Numéro du document',
  '{{documentType}}': 'Type de document (devis / facture)',
  '{{documentTitle}}': 'Titre du document',
  '{{clientName}}': 'Nom du client',
  '{{total}}': 'Montant total TTC',
  '{{reference}}': "Texte de référence (ex : Échéance : 01/01/2025)",
  '{{referenceDate}}': 'Date de validité / échéance',
  '{{today}}': "Date du jour",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceTokens(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((acc, [token, replacement]) => {
    const regex = new RegExp(escapeRegExp(token), 'g');
    return acc.replace(regex, replacement);
  }, template);
}

function toString(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return String(value);
}

function formatCurrency(value: unknown): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return '';
  }
  return EURO_FORMATTER.format(numeric);
}

function parseDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    if (Number.isFinite(parsed.getTime())) {
      return parsed;
    }
  }

  return null;
}

function formatReference(document: Record<string, any>, type: DocumentType): {
  referenceText: string;
  referenceDate: string;
} {
  const field = type === 'quote' ? 'valid_until' : 'due_date';
  const label = type === 'quote' ? "Valable jusqu'au" : 'Échéance';
  const parsed = parseDate(document?.[field]);
  if (!parsed) {
    return { referenceText: '', referenceDate: '' };
  }
  const formatted = DATE_FORMATTER.format(parsed);
  return {
    referenceText: `${label} : ${formatted}`,
    referenceDate: formatted,
  };
}

function resolveDocumentNumber(
  document: Record<string, any>,
  type: DocumentType,
  fallback: string,
): string {
  const preferredKey = type === 'quote' ? 'quote_number' : 'invoice_number';
  const candidate =
    document?.[preferredKey] ?? document?.number ?? document?.id ?? fallback;
  const asString = toString(candidate).trim();
  return asString || fallback;
}

function normalizeLines(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function buildDocumentEmailContent({
  document,
  type,
  subjectTemplate,
  bodyTemplate,
}: {
  document?: Record<string, any> | null;
  type: DocumentType;
  subjectTemplate?: string | null;
  bodyTemplate?: string | null;
}): { subject: string; body: string } {
  const safeDocument = document || {};
  const documentLabel = DOCUMENT_LABEL[type];
  const documentId = toString(safeDocument?.id || 'document');
  const documentNumber = resolveDocumentNumber(safeDocument, type, documentId);
  const clientName = toString(
    safeDocument?.client_name || safeDocument?.clientName || 'client',
  ).trim();
  const total = formatCurrency(safeDocument?.total);
  const { referenceText, referenceDate } = formatReference(safeDocument, type);
  const title = toString(safeDocument?.title).trim();
  const today = DATE_FORMATTER.format(new Date());

  const fallbackSubject = `Votre ${documentLabel} ${documentNumber}`;
  const fallbackBodyLines = [
    'Bonjour,',
    '',
    `Veuillez trouver ci-joint ${documentLabel} ${documentNumber} destiné à ${clientName || 'votre client'}.`,
  ];

  if (referenceText) {
    fallbackBodyLines.push(referenceText);
  }

  fallbackBodyLines.push(
    `Montant total : ${total || '—'}.`,
    '',
    "N'hésitez pas à nous contacter si vous avez des questions.",
    '',
    'Belle journée,',
    "L'équipe Fleemy",
  );

  const fallbackBody = fallbackBodyLines.join('\n');

  const tokens: Record<string, string> = {
    '{{documentNumber}}': documentNumber,
    '{{documentType}}': documentLabel,
    '{{documentTitle}}': title,
    '{{clientName}}': clientName || 'client',
    '{{total}}': total,
    '{{reference}}': referenceText,
    '{{referenceDate}}': referenceDate,
    '{{today}}': today,
  };

  const resolvedSubjectTemplate =
    (subjectTemplate && subjectTemplate.trim()) || fallbackSubject;
  const resolvedBodyTemplate =
    (bodyTemplate && bodyTemplate.trim()) || fallbackBody;

  const subjectWithTokens = replaceTokens(resolvedSubjectTemplate, tokens);
  const bodyWithTokens = replaceTokens(
    normalizeLines(resolvedBodyTemplate),
    tokens,
  );

  const finalSubject = subjectWithTokens.replace(/\s{2,}/g, ' ').trim();
  const finalBody = bodyWithTokens.trim() ? bodyWithTokens : fallbackBody;

  return {
    subject: finalSubject || fallbackSubject,
    body: finalBody,
  };
}
