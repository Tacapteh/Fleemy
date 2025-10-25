import { auth } from "../firebase";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

const resolveSameOriginOverride = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const { origin, hostname } = window.location;
  if (!origin || !hostname || LOCAL_HOSTNAMES.has(hostname)) {
    return null;
  }

  if (hostname.endsWith(".vercel.app")) {
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

const API_URL = ENV_API_URL || "https://fleemy.onrender.com";
const RETRY_DELAYS = [0, 250, 500, 1000];

const wait = (delay: number) =>
  new Promise((resolve) => {
    if (delay <= 0) {
      resolve(null);
      return;
    }
    setTimeout(resolve, delay);
  });

function buildApiUrl(path: string) {
  const baseUrl = API_URL.replace(/\/$/, "");
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

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const method = (options.method || "GET").toUpperCase();
  const url = buildApiUrl(path);
  const headersInit = options.headers as HeadersInit | undefined;
  const baseOptions: RequestInit = {
    ...options,
    method,
  };

  let lastNetworkError: Error | null = null;

  const attemptFetch = async (forceRefreshToken: boolean) => {
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

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt += 1) {
    const delay = RETRY_DELAYS[attempt];
    if (delay > 0) {
      await wait(delay);
    }

    try {
      let response = await attemptFetch(false);

      if (response.status === 401 && auth.currentUser) {
        response = await attemptFetch(true);
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
        console.error("apiFetch error", { method, url, status: response.status }, data);
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
        throw error;
      }

      return data;
    } catch (error: any) {
      if (error instanceof TypeError || error?.name === "TypeError") {
        lastNetworkError = error as Error;
        console.error("apiFetch network error", {
          method,
          url,
          attempt: attempt + 1,
        }, error);
        continue;
      }
      throw error;
    }
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
