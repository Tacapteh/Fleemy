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

    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt += 1) {
      const delay = RETRY_DELAYS[attempt];
      if (delay > 0) {
        await wait(delay);
      }

      try {
        let response = await attemptFetch(false, url);

        if (response.status === 401 && auth.currentUser) {
          response = await attemptFetch(true, url);
        }

        const contentType = response.headers.get("content-type") || "";
        const isJson = contentType.includes("application/json");
        let data: unknown = null;

        if (isJson) {
          try {
            data = await response.json();
          } catch (parseError) {
            data = null;
          }
        } else {
          data = await response.text();
        }

        if (!response.ok) {
          if (!suppressErrorLog) {
            console.error(
              "apiFetch error",
              { method, url, status: response.status },
              data,
            );
          }
          const message =
            (typeof data === "object" && data && (data as any).detail) ||
            (typeof data === "string" && data) ||
            response.statusText ||
            "Request failed";
          const error = new Error(message) as ApiError;
          error.response = {
            status: response.status,
            statusText: response.statusText,
            data,
          };
          if (!isLastBase && shouldFallbackToNextBase(response.status)) {
            shouldTryNextBase = true;
            lastFallbackError = error;
            break;
          }
          throw error;
        }

        return data;
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
