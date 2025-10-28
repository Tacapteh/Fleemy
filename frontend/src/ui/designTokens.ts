/**
 * Fleemy Design System v1
 * Tokens de design centralisés pour une harmonie visuelle
 */

// ═══════════════════════════════════════════════════════════
// SURFACE - Base commune pour toutes les cartes
// ═══════════════════════════════════════════════════════════

export const radius = {
  card: 'rounded-xl',
  button: 'rounded-md',
  badge: 'rounded-full',
  chip: 'rounded-md',
} as const;

export const surface = {
  // Fond sombre translucide commun
  base: 'bg-slate-900/40 dark:bg-slate-900/60',
  // Bordure claire translucide
  border: 'border border-slate-200/20 dark:border-slate-700/30',
  // Surface complète (combinaison)
  card: 'bg-slate-900/40 dark:bg-slate-900/60 border border-slate-200/20 dark:border-slate-700/30',
} as const;

// ═══════════════════════════════════════════════════════════
// TYPOGRAPHY - Couleurs de texte cohérentes
// ═══════════════════════════════════════════════════════════

export const text = {
  primary: 'text-slate-100 dark:text-slate-100',
  secondary: 'text-slate-300 dark:text-slate-400',
  tertiary: 'text-slate-400 dark:text-slate-500',
  muted: 'text-slate-500 dark:text-slate-600',
} as const;

// ═══════════════════════════════════════════════════════════
// ACCENT VARIANTS - Teintes légères pour différencier les sections
// ═══════════════════════════════════════════════════════════

type AccentVariant = {
  // Teinte très légère pour le header
  headerBg: string;
  // Couleur de l'icône dans le header
  iconColor: string;
  // Couleur du texte du titre
  titleColor: string;
  // Couleur du texte secondaire
  subtitleColor: string;
  // Bordure optionnelle accentuée
  borderAccent?: string;
};

export const accentVariants: Record<'default' | 'money' | 'warning' | 'note' | 'planning' | 'success', AccentVariant> = {
  default: {
    headerBg: 'bg-slate-500/5',
    iconColor: 'text-slate-300',
    titleColor: 'text-slate-100',
    subtitleColor: 'text-slate-300',
  },
  money: {
    headerBg: 'bg-emerald-500/5',
    iconColor: 'text-emerald-400',
    titleColor: 'text-emerald-100',
    subtitleColor: 'text-emerald-300',
    borderAccent: 'border-emerald-500/20',
  },
  warning: {
    headerBg: 'bg-red-500/5',
    iconColor: 'text-red-400',
    titleColor: 'text-red-100',
    subtitleColor: 'text-red-300',
    borderAccent: 'border-red-500/20',
  },
  note: {
    headerBg: 'bg-amber-500/5',
    iconColor: 'text-amber-400',
    titleColor: 'text-amber-100',
    subtitleColor: 'text-amber-300',
    borderAccent: 'border-amber-500/20',
  },
  planning: {
    headerBg: 'bg-blue-500/5',
    iconColor: 'text-blue-400',
    titleColor: 'text-blue-100',
    subtitleColor: 'text-blue-300',
    borderAccent: 'border-blue-500/20',
  },
  success: {
    headerBg: 'bg-green-500/5',
    iconColor: 'text-green-400',
    titleColor: 'text-green-100',
    subtitleColor: 'text-green-300',
    borderAccent: 'border-green-500/20',
  },
};

// ═══════════════════════════════════════════════════════════
// STATUS CHIPS - Tokens pour les statuts de tâches
// ═══════════════════════════════════════════════════════════

type StatusChipTokens = {
  bg: string;
  text: string;
  border: string;
  icon: string;
};

export const statusChips: Record<'todo' | 'doing' | 'done', StatusChipTokens> = {
  todo: {
    bg: 'bg-slate-500/10 dark:bg-slate-500/20',
    text: 'text-slate-300 dark:text-slate-200',
    border: 'border-slate-500/30 dark:border-slate-500/40',
    icon: 'text-slate-400 dark:text-slate-300',
  },
  doing: {
    bg: 'bg-amber-500/10 dark:bg-amber-500/20',
    text: 'text-amber-300 dark:text-amber-200',
    border: 'border-amber-500/30 dark:border-amber-500/40',
    icon: 'text-amber-300',
  },
  done: {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
    text: 'text-emerald-400 dark:text-emerald-300',
    border: 'border-emerald-500/30 dark:border-emerald-500/40',
    icon: 'text-emerald-400',
  },
};

// ═══════════════════════════════════════════════════════════
// PRIORITY CHIPS - Tokens pour les priorités (1/2/3)
// ═══════════════════════════════════════════════════════════

type PriorityTokens = {
  bg: string;
  text: string;
  ring: string;
  label: string;
  number: number;
};

export const priorityChips: Record<'high' | 'medium' | 'low', PriorityTokens> = {
  high: {
    bg: 'bg-red-500',
    text: 'text-white',
    ring: 'ring-white/70',
    label: 'Importante',
    number: 1,
  },
  medium: {
    bg: 'bg-amber-500',
    text: 'text-white',
    ring: 'ring-white/70',
    label: 'Moyenne',
    number: 2,
  },
  low: {
    bg: 'bg-slate-400',
    text: 'text-white',
    ring: 'ring-white/70',
    label: 'Faible',
    number: 3,
  },
};

// ═══════════════════════════════════════════════════════════
// ICON TOKENS - Tailles et couleurs par défaut des icônes
// ═══════════════════════════════════════════════════════════

export const icon = {
  size: {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-8 w-8',
  },
  color: {
    default: 'text-slate-300',
    primary: 'text-slate-100',
    secondary: 'text-slate-400',
    muted: 'text-slate-500',
  },
  stroke: {
    default: 2,
    thin: 1.5,
    thick: 2.5,
  },
} as const;

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

export const getAccentVariant = (variant: keyof typeof accentVariants = 'default') => {
  return accentVariants[variant];
};

export const getStatusChip = (status: keyof typeof statusChips) => {
  return statusChips[status];
};

export const getPriorityChip = (priority: keyof typeof priorityChips) => {
  return priorityChips[priority];
};
