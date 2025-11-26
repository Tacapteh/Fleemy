const CLIPBOARD_KEY = 'fleemy.taskClipboard';

const safeParse = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Impossible de lire le presse-papiers des tâches', error);
    return null;
  }
};

export const readTaskClipboard = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  const rawValue = window.localStorage.getItem(CLIPBOARD_KEY);
  return safeParse(rawValue);
};

export const writeTaskClipboard = (item) => {
  if (typeof window === 'undefined' || !item) {
    return;
  }
  try {
    window.localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(item));
  } catch (error) {
    console.error('Impossible de sauvegarder le presse-papiers des tâches', error);
  }
};
