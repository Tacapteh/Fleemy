import { auth } from "../firebase";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const SAME_ORIGIN_ALLOWED_SUFFIXES = [".vercel.app", ".fleemy.fr"] as const;
const SAME_ORIGIN_ALLOWED_HOSTS = new Set(["fleemy.fr"]);

const resolveSameOriginOverride = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const { origin, hostname } = window.location;
  if (!origin || !hostname || LOCAL_HOSTNAMES.has(hostname)) {
    return null;
  }

  if (SAME_ORIGIN_ALLOWED_HOSTS.has(hostname)) {
    return origin;
  }

  if (SAME_ORIGIN_ALLOWED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    return origin;
  }

  return null;
};

const resolveBrowserFallback = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const { origin, hostname } = window.location;
  if (!origin || !hostname || LOCAL_HOSTNAMES.has(hostname)) {
    return null;
  }

  return origin;
};

const ENV_API_URL =
  process.env.REACT_APP_API_URL && process.env.REACT_APP_API_URL.trim().length > 0
    ? process.env.REACT_APP_API_URL.trim()
    : null;

const SAME_ORIGIN_OVERRIDE = resolveSameOriginOverride();
const BROWSER_FALLBACK_URL = resolveBrowserFallback();

const DEFAULT_API_URL = "https://fleemy.onrender.com";

const API_BASE_URLS: string[] = [];

const appendBaseUrl = (candidate: string | null) => {
  if (!candidate) {
    return;
  }

  const normalized = candidate.replace(/\/$/, "");
  if (
    API_BASE_URLS.some(
      (baseUrl) => baseUrl.replace(/\/$/, "") === normalized,
    )
  ) {
    return;
  }

  API_BASE_URLS.push(candidate);
};

appendBaseUrl(ENV_API_URL);
appendBaseUrl(DEFAULT_API_URL);
appendBaseUrl(SAME_ORIGIN_OVERRIDE);
appendBaseUrl(BROWSER_FALLBACK_URL);
const RETRY_DELAYS = [0, 250, 500, 1000];
const TRANSIENT_RETRY_DELAYS = [0, 300, 1000];
const TRANSIENT_FINAL_DELAY = 2500;
const TRANSIENT_MAX_ATTEMPTS = TRANSIENT_RETRY_DELAYS.length;

const wait = (delay: number) =>
  new Promise((resolve) => {
    if (delay <= 0) {
      resolve(null);
      return;
    }
    setTimeout(resolve, delay);
  });

export const API_RETRY_DELAYS = [...RETRY_DELAYS];

export const waitForApiRetry = wait;

export function getApiBaseUrls(): string[] {
  return [...API_BASE_URLS];
}

export function buildApiUrlFromBase(path: string, baseApiUrl: string) {
  return buildApiUrl(path, baseApiUrl);
}

function buildApiUrl(path: string, baseApiUrl: string) {
  const baseUrl = baseApiUrl.replace(/\/$/, "");
  const rootUrl = baseUrl.endsWith("/api") ? baseUrl.slice(0, -4) : baseUrl;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedPath === "/") {
    return `${rootUrl}/api`;
  }

  const finalPath = normalizedPath.startsWith("/api")
    ? normalizedPath
    : `/api${normalizedPath}`;

  return `${rootUrl}${finalPath}`;
}

const shouldAttachJsonContentType = (body: BodyInit | null | undefined) => {
  if (body == null) {
    return false;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return false;
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return false;
  }
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return false;
  }
  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
    return false;
  }
  if (
    typeof ArrayBuffer !== "undefined" &&
    typeof DataView !== "undefined" &&
    (body instanceof DataView || ArrayBuffer.isView(body))
  ) {
    return false;
  }

  return true;
};

type ApiError = Error & {
  response?: {
    status: number;
    statusText: string;
    data: unknown;
  };
};

export class ServiceUnavailableError extends Error {
  code?: string;
  response?: ApiError["response"];

  constructor(
    message: string,
    options: { code?: string; response?: ApiError["response"] } = {},
  ) {
    super(message);
    this.name = "ServiceUnavailable";
    this.code = options.code;
    if (options.response) {
      this.response = options.response;
    }
    Object.setPrototypeOf(this, ServiceUnavailableError.prototype);
  }
}

const ensureAuthHeaders = async (
  headers: Headers,
  forceRefresh: boolean,
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) {
    return;
  }

  try {
    const token = await user.getIdToken(forceRefresh);
    headers.set("Authorization", `Bearer ${token}`);
  } catch (tokenError) {
    if (!forceRefresh && auth.currentUser) {
      const refreshedToken = await auth.currentUser.getIdToken(true);
      headers.set("Authorization", `Bearer ${refreshedToken}`);
      return;
    }
    throw tokenError;
  }
};

type ApiFetchOptions = RequestInit & {
  suppressErrorLog?: boolean;
};

const shouldFallbackToNextBase = (status: number) => {
  return (
    status === 404 ||
    status === 405 ||
    status === 501 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
};

const NO_BODY_STATUS = new Set([204, 205, 304]);

const parseApiResponse = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  const expectsJson = contentType.includes("application/json");
  const status = response.status;
  const noBody = NO_BODY_STATUS.has(status);
  let rawBody = "";

  if (!noBody) {
    try {
      rawBody = await response.text();
    } catch (error) {
      rawBody = "";
    }
  }

  const preview = rawBody.trimStart().slice(0, 32).toLowerCase();
  const isHtml = Boolean(
    rawBody &&
      (preview.startsWith("<!doctype") ||
        preview.startsWith("<html") ||
        preview.startsWith("<body")),
  );

  if (expectsJson && !isHtml) {
    if (!rawBody) {
      return {
        data: null,
        rawBody,
        parsedJson: true,
        isHtml,
        contentType,
      };
    }
    try {
      return {
        data: JSON.parse(rawBody),
        rawBody,
        parsedJson: true,
        isHtml,
        contentType,
      };
    } catch (parseError) {
      return {
        data: null,
        rawBody,
        parsedJson: false,
        isHtml,
        contentType,
      };
    }
  }

  return {
    data: rawBody,
    rawBody,
    parsedJson: false,
    isHtml,
    contentType,
  };
};

const isMembershipsUnavailablePayload = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  const code = (payload as any).code;
  const success = (payload as any).success;
  return success === false && code === "MEMBERSHIPS_UNAVAILABLE";
};

export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<any> {
  const { suppressErrorLog = false, ...requestOptions } = options;
  const method = (requestOptions.method || "GET").toUpperCase();
  const headersInit = requestOptions.headers as HeadersInit | undefined;
  const baseOptions: RequestInit = {
    ...requestOptions,
    method,
  };

  const attemptFetch = async (forceRefreshToken: boolean, url: string) => {
    const headers = new Headers(headersInit || undefined);
    headers.set("X-Requested-With", "XMLHttpRequest");

    if (shouldAttachJsonContentType(baseOptions.body) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    await ensureAuthHeaders(headers, forceRefreshToken);

    return fetch(url, {
      ...baseOptions,
      headers,
      mode: "cors",
    });
  };

  let lastNetworkError: Error | null = null;
  let lastFallbackError: Error | null = null;

  for (let baseIndex = 0; baseIndex < API_BASE_URLS.length; baseIndex += 1) {
    const baseApiUrl = API_BASE_URLS[baseIndex];
    const isLastBase = baseIndex === API_BASE_URLS.length - 1;
    const url = buildApiUrl(path, baseApiUrl);
    let lastNetworkErrorForBase: Error | null = null;
    let shouldTryNextBase = false;

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt += 1) {
      const delay = RETRY_DELAYS[attempt];
      if (delay > 0) {
        await wait(delay);
      }

      try {
        for (
          let transientAttempt = 0;
          transientAttempt < TRANSIENT_MAX_ATTEMPTS;
          transientAttempt += 1
        ) {
          const transientDelay =
            TRANSIENT_RETRY_DELAYS[transientAttempt] ?? 0;
          if (transientDelay > 0) {
            await wait(transientDelay);
          }

          let response = await attemptFetch(false, url);

          if (response.status === 401 && auth.currentUser) {
            response = await attemptFetch(true, url);
          }

          const parsed = await parseApiResponse(response);
          const status = response.status;
          const statusText = response.statusText;
          const shouldRetryStatus =
            status === 502 || status === 503 || status === 504;
          const membershipUnavailable =
            parsed.parsedJson && isMembershipsUnavailablePayload(parsed.data);
          const shouldRetryTemporary =
            shouldRetryStatus || parsed.isHtml || membershipUnavailable;

          if (shouldRetryTemporary) {
            if (transientAttempt === TRANSIENT_MAX_ATTEMPTS - 1) {
              if (TRANSIENT_FINAL_DELAY > 0) {
                await wait(TRANSIENT_FINAL_DELAY);
              }
              const logPayload = membershipUnavailable
                ? parsed.data
                : parsed.isHtml
                  ? "[html-response]"
                  : parsed.data;
              const error = new ServiceUnavailableError(
                membershipUnavailable
                  ? "Memberships temporarily unavailable"
                  : "Service temporarily unavailable",
                {
                  code: membershipUnavailable
                    ? "MEMBERSHIPS_UNAVAILABLE"
                    : undefined,
                  response: {
                    status,
                    statusText,
                    data: membershipUnavailable ? parsed.data : null,
                  },
                },
              );
              if (!suppressErrorLog) {
                console.error(
                  "apiFetch error",
                  { method, url, status },
                  logPayload,
                );
              }
              if (!isLastBase && shouldFallbackToNextBase(status)) {
                shouldTryNextBase = true;
                lastFallbackError = error;
              } else {
                throw error;
              }
              break;
            }
            continue;
          }

          if (!response.ok) {
            const logPayload = parsed.isHtml
              ? "[html-response]"
              : parsed.parsedJson
                ? parsed.data
                : parsed.rawBody;
            if (!suppressErrorLog) {
              console.error(
                "apiFetch error",
                { method, url, status },
                logPayload,
              );
            }
            const message =
              (typeof parsed.data === "object" &&
                parsed.data &&
                (parsed.data as any).detail) ||
              (typeof parsed.data === "string" && parsed.data) ||
              statusText ||
              "Request failed";
            const error = new Error(message) as ApiError;
            error.response = {
              status,
              statusText,
              data: parsed.isHtml
                ? null
                : parsed.parsedJson
                  ? parsed.data
                  : parsed.rawBody,
            };
            if (!isLastBase && shouldFallbackToNextBase(status)) {
              shouldTryNextBase = true;
              lastFallbackError = error;
              break;
            }
            throw error;
          }

          return parsed.data;
        }

        if (shouldTryNextBase) {
          break;
        }
      } catch (error: any) {
        if (error instanceof TypeError || error?.name === "TypeError") {
          lastNetworkErrorForBase = error as Error;
          if (!suppressErrorLog) {
            console.error(
              "apiFetch network error",
              {
                method,
                url,
                attempt: attempt + 1,
              },
              error,
            );
          }
          continue;
        }
        throw error;
      }
    }

    if (shouldTryNextBase) {
      continue;
    }

    if (lastNetworkErrorForBase) {
      lastNetworkError = lastNetworkErrorForBase;
      continue;
    }
  }

  if (lastFallbackError) {
    throw lastFallbackError;
  }

  const unreachableError = new Error("API unreachable (CORS or network)") as ApiError;
  if (lastNetworkError) {
    (unreachableError as any).cause = lastNetworkError;
  }
  throw unreachableError;
}

export async function translateHtml(html: string, target: string) {
  return apiFetch("/translate", {
    method: "POST",
    body: JSON.stringify({ html, target }),
  });
}
