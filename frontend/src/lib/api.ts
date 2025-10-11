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

export async function apiFetch(path: string, options: RequestInit = {}) {
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
  if (!res.ok) {
    throw new Error(res.statusText);
  }
  return res.json();
}

export async function translateHtml(html: string, target: string) {
  return apiFetch("/translate", {
    method: "POST",
    body: JSON.stringify({ html, target }),
  });
}
