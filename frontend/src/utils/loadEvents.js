import { getAuth } from "firebase/auth";
import normalizeEvent from "./normalizeEvent";

// In-memory cache keyed by "from:to"
const cache = new Map();

export function clearEventsCache() {
  cache.clear();
}

export async function loadEvents(from, to, teamId, signal) {
  const key = `${from}:${to}`;
  if (cache.has(key)) {
    return cache.get(key);
  }

  const user = getAuth().currentUser;
  const ownerId = user?.uid;
  if (!ownerId) {
    throw new Error("ownerId non défini");
  }

  let token;
  try {
    token = await user.getIdToken();
  } catch (err) {
    throw new Error("[loadEvents] impossible d'obtenir le token");
  }

  let url = `/api/planning/events?from=${from}&to=${to}`;
  if (teamId) {
    url += `&team_id=${teamId}`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json().catch(() => []);
  const events = Array.isArray(data)
    ? data
    : Array.isArray(data?.events)
    ? data.events
    : [];
  const normalized = Array.isArray(events)
    ? events.map(normalizeEvent)
    : [];
  cache.set(key, normalized);
  return normalized;
}
