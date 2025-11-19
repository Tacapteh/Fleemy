const DISABLED_STRING_VALUES = new Set(['false', '0', 'off', 'disabled', 'no', 'inactive', 'none']);

/**
 * Détermine si un indicateur "priorityEnabled" est explicitement désactivé.
 * Gère les valeurs booléennes, numériques et chaînes provenant d'anciennes données.
 * @param {unknown} value
 * @returns {boolean}
 */
export const isPriorityToggleDisabled = (value) => {
  if (value === false) {
    return true;
  }
  if (value === 0) {
    return true;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return DISABLED_STRING_VALUES.has(normalized);
  }
  return false;
};

/**
 * Retourne true si la priorité peut être affichée (valeur non vide et interrupteur actif).
 * @param {unknown} priorityValue
 * @param  {...unknown} flags
 * @returns {boolean}
 */
export const isPriorityBadgeVisible = (priorityValue, ...flags) => {
  if (priorityValue == null) {
    return false;
  }
  if (typeof priorityValue === 'string' && priorityValue.trim() === '') {
    return false;
  }
  return !flags.some(isPriorityToggleDisabled);
};
