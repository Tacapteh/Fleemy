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
const TEMPORARY_RETRY_DELAYS = [0, 300, 1000];
const TEMPORARY_FINAL_BACKOFF = 2500;
const TEMPORARY_STATUS_CODES = new Set([502, 503, 504]);
const NON_JSON_RESPONSE_PLACEHOLDER = "[non-json response omitted]";

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
    options: { code?: string; response?: ApiError["response"]; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "ServiceUnavailableError";
    this.code = options.code;
    this.response = options.response;
    if (options.cause !== undefined) {
      (this as any).cause = options.cause;
    }
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

    type TemporaryReason = "status" | "non-json" | "memberships-unavailable";
    type FetchAttemptResult = {
      response: Response;
      data: unknown;
      isJson: boolean;
      temporaryReason?: TemporaryReason;
    };

    const executeFetchAttempt = async (): Promise<FetchAttemptResult> => {
      let response = await attemptFetch(false, url);

      if (response.status === 401 && auth.currentUser) {
        response = await attemptFetch(true, url);
      }

      const status = response.status;
      const contentType = response.headers.get("content-type") || "";
      const isJson = contentType.includes("application/json");

      if (TEMPORARY_STATUS_CODES.has(status)) {
        return {
          response,
          data: null,
          isJson,
          temporaryReason: "status",
        };
      }

      if (!isJson) {
        return {
          response,
          data: NON_JSON_RESPONSE_PLACEHOLDER,
          isJson: false,
          temporaryReason: "non-json",
        };
      }

      let data: unknown = null;
      try {
        data = await response.json();
      } catch (parseError) {
        data = null;
      }

      if (
        data &&
        typeof data === "object" &&
        (data as any).success === false &&
        (data as any).code === "MEMBERSHIPS_UNAVAILABLE"
      ) {
        return {
          response,
          data,
          isJson: true,
          temporaryReason: "memberships-unavailable",
        };
      }

      return { response, data, isJson: true };
    };

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt += 1) {
      const delay = RETRY_DELAYS[attempt];
      if (delay > 0) {
        await wait(delay);
      }

      try {
        let lastTemporaryResult: FetchAttemptResult | null = null;

        for (let tempAttempt = 0; tempAttempt < TEMPORARY_RETRY_DELAYS.length; tempAttempt += 1) {
          const retryDelay = TEMPORARY_RETRY_DELAYS[tempAttempt];
          if (retryDelay > 0) {
            await wait(retryDelay);
          }

          const result = await executeFetchAttempt();
          lastTemporaryResult = result;

          if (result.temporaryReason === "memberships-unavailable") {
            if (tempAttempt === TEMPORARY_RETRY_DELAYS.length - 1) {
              const response = result.response;
              const responseInfo = {
                status: response.status,
                statusText: response.statusText,
                data: result.data,
              };
              throw new ServiceUnavailableError("Memberships temporarily unavailable", {
                code: "MEMBERSHIPS_UNAVAILABLE",
                response: responseInfo,
              });
            }
            continue;
          }

          if (
            result.temporaryReason === "status" ||
            result.temporaryReason === "non-json"
          ) {
            if (tempAttempt === TEMPORARY_RETRY_DELAYS.length - 1) {
              if (TEMPORARY_FINAL_BACKOFF > 0) {
                await wait(TEMPORARY_FINAL_BACKOFF);
              }
              break;
            }
            continue;
          }

          const response = result.response;
          const data = result.data;

          if (!response.ok) {
            const detail =
              (typeof data === "object" && data && (data as any).detail) ||
              undefined;
            if (!suppressErrorLog) {
              console.error(
                "apiFetch error",
                { method, url, status: response.status, detail },
                data,
              );
            }
            const message = detail || response.statusText || "Request failed";
            const error = new Error(message) as ApiError;
            error.response = {
              status: response.status,
              statusText: response.statusText,
              data,
            };
            (error as any).detail = detail;
            if (!isLastBase && shouldFallbackToNextBase(response.status)) {
              shouldTryNextBase = true;
              lastFallbackError = error;
              break;
            }
            throw error;
          }

          return data;
        }

        if (shouldTryNextBase) {
          break;
        }

        if (lastTemporaryResult && lastTemporaryResult.temporaryReason) {
          const response = lastTemporaryResult.response;
          const data = lastTemporaryResult.data;
          const detail =
            (typeof data === "object" && data && (data as any).detail) ||
            undefined;
          if (!suppressErrorLog) {
            console.error(
              "apiFetch error",
              { method, url, status: response.status, detail },
              data,
            );
          }
          let message = detail || response.statusText || "Request failed";
          if (
            typeof data === "string" &&
            data === NON_JSON_RESPONSE_PLACEHOLDER
          ) {
            message = "Service temporarily unavailable";
          }
          const error = new Error(message) as ApiError;
          error.response = {
            status: response.status,
            statusText: response.statusText,
            data,
          };
          (error as any).detail = detail;
          if (!isLastBase && shouldFallbackToNextBase(response.status)) {
            shouldTryNextBase = true;
            lastFallbackError = error;
            break;
          }
          throw error;
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
