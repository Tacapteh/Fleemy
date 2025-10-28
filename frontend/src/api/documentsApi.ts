import { auth } from '../firebase';
import {
  API_RETRY_DELAYS,
  buildApiUrlFromBase,
  getApiBaseUrls,
  waitForApiRetry,
} from '../lib/api';

export type DocumentType = 'quote' | 'invoice';

interface FetchDocumentPdfParams {
  id: string;
  type: DocumentType;
  token?: string;
}

interface EmailDocumentParams {
  id: string;
  type: DocumentType;
  to: string;
  token?: string;
}

type ResponseKind = 'blob' | 'json';

type RequestConfig = {
  path: string;
  body?: Record<string, unknown>;
  token?: string;
  accept?: string;
  responseType: ResponseKind;
};

const JSON_CONTENT_TYPE = 'application/json';
const REQUESTED_WITH_HEADER = 'X-Requested-With';
const REQUESTED_WITH_VALUE = 'XMLHttpRequest';

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch (error) {
      return null;
    }
  }
  try {
    return await response.text();
  } catch (error) {
    return null;
  }
}

const FALLBACK_STATUS_CODES = new Set([401, 403, 404, 405]);

function shouldFallbackToNextBase(status: number, totalBases: number): boolean {
  if (totalBases <= 1) {
    return false;
  }

  if (FALLBACK_STATUS_CODES.has(status)) {
    return true;
  }

  if (status >= 500 && status < 600) {
    return true;
  }

  return false;
}

async function performAuthorizedRequest<T>(config: RequestConfig): Promise<T> {
  const { path, body, token, accept, responseType } = config;
  const baseUrls = getApiBaseUrls();
  let lastNetworkError: Error | null = null;

  const attemptFetch = async (
    baseUrl: string,
    forceRefreshToken: boolean,
  ): Promise<Response> => {
    const url = buildApiUrlFromBase(path, baseUrl);
    const headers = new Headers();
    headers.set(REQUESTED_WITH_HEADER, REQUESTED_WITH_VALUE);

    if (body !== undefined) {
      headers.set('Content-Type', JSON_CONTENT_TYPE);
    }
    if (accept) {
      headers.set('Accept', accept);
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    } else if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken(forceRefreshToken);
      headers.set('Authorization', `Bearer ${idToken}`);
    }

    const requestInit: RequestInit = {
      method: 'POST',
      mode: 'cors',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };

    return fetch(url, requestInit);
  };

  for (const baseUrl of baseUrls) {
    let lastNetworkErrorForBase: Error | null = null;

    for (let attempt = 0; attempt < API_RETRY_DELAYS.length; attempt += 1) {
      const delay = API_RETRY_DELAYS[attempt];
      if (delay > 0) {
        await waitForApiRetry(delay);
      }

      try {
        let response = await attemptFetch(baseUrl, false);

        if (response.status === 401 && auth.currentUser && !token) {
          response = await attemptFetch(baseUrl, true);
        }

        if (!response.ok) {
          const errorBody = await parseResponseBody(response);
          const message =
            (errorBody && typeof errorBody === 'object' && 'detail' in errorBody
              ? String((errorBody as { detail?: unknown }).detail)
              : undefined) ||
            (typeof errorBody === 'string' && errorBody.trim().length > 0
              ? errorBody
              : response.statusText || 'Request failed');

          const error = new Error(message);
          (error as any).response = {
            status: response.status,
            statusText: response.statusText,
            data: errorBody,
          };
          if (shouldFallbackToNextBase(response.status, baseUrls.length)) {
            lastNetworkErrorForBase = error as Error;
            break;
          }
          throw error;
        }

        if (responseType === 'blob') {
          return (await response.blob()) as unknown as T;
        }

        if (response.status === 204) {
          return {} as T;
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          try {
            return (await response.json()) as T;
          } catch (parseError) {
            const error = new Error('Invalid JSON response');
            (error as any).cause = parseError;
            throw error;
          }
        }

        const text = await response.text();
        return (text as unknown) as T;
      } catch (error: any) {
        if (error instanceof TypeError || error?.name === 'TypeError') {
          lastNetworkErrorForBase = error as Error;
          continue;
        }
        throw error;
      }
    }

    if (lastNetworkErrorForBase) {
      lastNetworkError = lastNetworkErrorForBase;
      continue;
    }
  }

  if (lastNetworkError) {
    throw lastNetworkError;
  }

  throw new Error('API unreachable (documents)');
}

export async function fetchDocumentPdf({
  id,
  type,
  token,
}: FetchDocumentPdfParams): Promise<Blob> {
  if (!id) {
    throw new Error('Missing document identifier');
  }

  const normalizedType: DocumentType = type === 'invoice' ? 'invoice' : 'quote';

  return performAuthorizedRequest<Blob>({
    path: `/documents/${encodeURIComponent(String(id))}/pdf`,
    body: { type: normalizedType },
    token,
    accept: 'application/pdf',
    responseType: 'blob',
  });
}

export async function emailDocument({
  id,
  type,
  to,
  token,
}: EmailDocumentParams): Promise<{ ok: boolean; sentTo?: string }> {
  if (!id) {
    throw new Error('Missing document identifier');
  }
  if (!to) {
    throw new Error('Missing recipient email');
  }

  const normalizedType: DocumentType = type === 'invoice' ? 'invoice' : 'quote';

  return performAuthorizedRequest<{ ok: boolean; sentTo?: string }>({
    path: `/documents/${encodeURIComponent(String(id))}/email`,
    body: { type: normalizedType, to },
    token,
    accept: JSON_CONTENT_TYPE,
    responseType: 'json',
  });
}
