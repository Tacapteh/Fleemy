const STORAGE_KEY = 'planningInvoiceSeeds';
const MAX_ENTRY_AGE_MS = 1000 * 60 * 60 * 48; // 48 heures

const canUseSessionStorage = () => {
  if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
    return false;
  }

  try {
    const testKey = '__invoice-seed-test__';
    window.sessionStorage.setItem(testKey, '1');
    window.sessionStorage.removeItem(testKey);
    return true;
  } catch (error) {
    console.warn('SessionStorage unavailable for invoice seeds', error);
    return false;
  }
};

const safeParse = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.warn('Impossible de parser les brouillons de facture', error);
  }
  return null;
};

const readSeeds = () => {
  if (!canUseSessionStorage()) {
    return {};
  }

  let parsed = {};

  try {
    const rawValue = window.sessionStorage.getItem(STORAGE_KEY);
    parsed = safeParse(rawValue) || {};
  } catch (error) {
    console.warn('Impossible de lire les brouillons de facture', error);
  }
  const now = Date.now();
  const result = {};

  Object.entries(parsed).forEach(([key, entry]) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const savedAt = typeof entry.savedAt === 'number' ? entry.savedAt : 0;
    if (savedAt && now - savedAt > MAX_ENTRY_AGE_MS) {
      return;
    }
    result[key] = entry;
  });

  if (Object.keys(result).length !== Object.keys(parsed).length) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch (error) {
      console.warn('Impossible de nettoyer les brouillons de facture', error);
    }
  }

  return result;
};

const writeSeeds = (seeds) => {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seeds));
  } catch (error) {
    console.warn('Impossible d\'enregistrer le brouillon de facture', error);
  }
};

export const persistInvoiceSeed = (seed) => {
  if (!seed || !seed.clientId || !canUseSessionStorage()) {
    return false;
  }

  const normalizedId = String(seed.clientId);
  const existing = readSeeds();
  existing[normalizedId] = {
    ...seed,
    clientId: normalizedId,
    savedAt: Date.now(),
  };
  writeSeeds(existing);
  return true;
};

export const consumeInvoiceSeed = (clientId) => {
  if (!clientId || !canUseSessionStorage()) {
    return null;
  }

  const normalizedId = String(clientId);
  const existing = readSeeds();
  const entry = existing[normalizedId] || null;
  if (entry) {
    delete existing[normalizedId];
    writeSeeds(existing);
  }
  return entry;
};

export const peekInvoiceSeed = (clientId) => {
  if (!clientId || !canUseSessionStorage()) {
    return null;
  }
  const normalizedId = String(clientId);
  const existing = readSeeds();
  return existing[normalizedId] || null;
};
