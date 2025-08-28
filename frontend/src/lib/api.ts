import { auth } from "../firebase";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

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
  const res = await fetch(`${API_URL.replace(/\/$/, "")}${path}`, {
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
