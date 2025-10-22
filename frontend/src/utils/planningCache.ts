const STORAGE_PREFIX = 'planning-cache:';
const DEFAULT_TTL = 2 * 60 * 1000; // 2 minutes
const SERIALIZED_TYPE_KEY = '__serializedType';
const SERIALIZED_DATE_TYPE = 'Date';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<any>>();
let cachedStorage: Storage | null = null;
let storageUnavailable = false;

function storageKey(key: string): string {
  return `${STORAGE_PREFIX}${key}`;
}

function getStorage(): Storage | null {
  if (storageUnavailable) {
    return null;
  }

  if (cachedStorage) {
    return cachedStorage;
  }

  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    storageUnavailable = true;
    return null;
  }

  try {
    const storage = window.sessionStorage;
    const testKey = `${STORAGE_PREFIX}__test__`;
    storage.setItem(testKey, '1');
    storage.removeItem(testKey);
    cachedStorage = storage;
    return cachedStorage;
  } catch (error) {
    storageUnavailable = true;
    return null;
  }
}

function serializeEntry(entry: CacheEntry<any>): string {
  return JSON.stringify(entry, (_key, value) => {
    if (value instanceof Date) {
      return {
        [SERIALIZED_TYPE_KEY]: SERIALIZED_DATE_TYPE,
        value: value.toISOString(),
      };
    }
    return value;
  });
}

function deserializeEntry<T>(raw: string): CacheEntry<T> | null {
  try {
    const parsed = JSON.parse(raw, (_key, value) => {
      if (
        value &&
        typeof value === 'object' &&
        value[SERIALIZED_TYPE_KEY] === SERIALIZED_DATE_TYPE &&
        typeof value.value === 'string'
      ) {
        const date = new Date(value.value);
        if (!Number.isNaN(date.getTime())) {
          return date;
        }
        return null;
      }
      return value;
    });

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    const expiresAt = (parsed as CacheEntry<T>).expiresAt;
    if (typeof expiresAt !== 'number') {
      return null;
    }

    return parsed as CacheEntry<T>;
  } catch (error) {
    return null;
  }
}

export function getCachedPlanningData<T = unknown>(key: string): T | null {
  const now = Date.now();
  const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (memoryEntry) {
    if (memoryEntry.expiresAt > now) {
      return memoryEntry.value;
    }
    memoryCache.delete(key);
  }

  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(storageKey(key));
  if (!raw) {
    return null;
  }

  const entry = deserializeEntry<T>(raw);
  if (!entry) {
    storage.removeItem(storageKey(key));
    return null;
  }

  if (entry.expiresAt <= now) {
    storage.removeItem(storageKey(key));
    return null;
  }

  memoryCache.set(key, entry);
  return entry.value;
}

export function setCachedPlanningData<T = unknown>(key: string, value: T, ttl = DEFAULT_TTL): void {
  const expiresAt = Date.now() + Math.max(ttl, 0);
  const entry: CacheEntry<T> = { value, expiresAt };
  memoryCache.set(key, entry);

  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(storageKey(key), serializeEntry(entry));
  } catch (error) {
    // Si le stockage échoue (quota, navigation privée, etc.), on ignore silencieusement
  }
}

export function removeCachedPlanningData(key: string): void {
  memoryCache.delete(key);
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(storageKey(key));
  } catch (error) {
    // Ignorer les erreurs de suppression
  }
}
