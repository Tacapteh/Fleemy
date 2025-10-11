import { auth } from "../firebase";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

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

type ApiError = Error & {
  response?: {
    status: number;
    statusText: string;
    data: unknown;
  };
};

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<any> {
  const method = (options.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as any),
  };
  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers["Authorization"] = `Bearer ${token}`;
  }
  const url = buildApiUrl(path);
  const res = await fetch(url, {
    ...options,
    method,
    headers,
  });

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  let data: unknown = null;

  if (isJson) {
    try {
      data = await res.json();
    } catch (error) {
      data = null;
    }
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const message =
      (typeof data === "object" && data && (data as any).detail) ||
      res.statusText ||
      "Request failed";
    const error = new Error(message) as ApiError;
    error.response = {
      status: res.status,
      statusText: res.statusText,
      data,
    };
    throw error;
  }

  return data;
}

export async function translateHtml(html: string, target: string) {
  return apiFetch("/translate", {
    method: "POST",
    body: JSON.stringify({ html, target }),
  });
}
