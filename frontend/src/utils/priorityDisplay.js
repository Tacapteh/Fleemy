const PRIORITY_MAP = {
  high: {
    labelNumber: '1',
    ariaLabel: 'Priorité importante',
    bgClass: 'bg-red-500',
  },
  medium: {
    labelNumber: '2',
    ariaLabel: 'Priorité moyenne',
    bgClass: 'bg-amber-400',
  },
  low: {
    labelNumber: '3',
    ariaLabel: 'Priorité faible',
    bgClass: 'bg-slate-500',
  },
};

export function getPriorityDisplay(priority) {
  if (typeof priority !== 'string') {
    return PRIORITY_MAP.medium;
  }

  const normalized = priority.trim().toLowerCase();

  if (Object.prototype.hasOwnProperty.call(PRIORITY_MAP, normalized)) {
    return PRIORITY_MAP[normalized];
  }

  return PRIORITY_MAP.medium;
}
