// Couleurs pastels modernes avec contrastes AA validés
export const PASTEL_COLORS = {
  'pastel-blue': {
    bg: '#dbeafe',
    text: '#1e40af',
    name: 'Bleu pastel'
  },
  'pastel-green': {
    bg: '#d1fae5',
    text: '#065f46',
    name: 'Vert pastel'
  },
  'pastel-purple': {
    bg: '#e9d5ff',
    text: '#6b21a8',
    name: 'Violet pastel'
  },
  'pastel-pink': {
    bg: '#fce7f3',
    text: '#be185d',
    name: 'Rose pastel'
  },
  'pastel-yellow': {
    bg: '#fef3c7',
    text: '#92400e',
    name: 'Jaune pastel'
  },
  'pastel-orange': {
    bg: '#fed7aa',
    text: '#c2410c',
    name: 'Orange pastel'
  },
  'pastel-red': {
    bg: '#fecaca',
    text: '#dc2626',
    name: 'Rouge pastel'
  },
  'pastel-cyan': {
    bg: '#cffafe',
    text: '#0e7490',
    name: 'Cyan pastel'
  },
  'pastel-indigo': {
    bg: '#e0e7ff',
    text: '#3730a3',
    name: 'Indigo pastel'
  },
  'pastel-lime': {
    bg: '#ecfccb',
    text: '#365314',
    name: 'Citron vert pastel'
  },
  'pastel-emerald': {
    bg: '#d1fae5',
    text: '#047857',
    name: 'Émeraude pastel'
  },
  'pastel-teal': {
    bg: '#ccfbf1',
    text: '#0f5132',
    name: 'Sarcelle pastel'
  },
  'pastel-sky': {
    bg: '#e0f2fe',
    text: '#0c4a6e',
    name: 'Ciel pastel'
  },
  'pastel-violet': {
    bg: '#f3e8ff',
    text: '#581c87',
    name: 'Violet intense pastel'
  },
  'pastel-fuchsia': {
    bg: '#fae8ff',
    text: '#a21caf',
    name: 'Fuchsia pastel'
  },
  'pastel-rose': {
    bg: '#fff1f2',
    text: '#be123c',
    name: 'Rose intense pastel'
  }
};

// Couleur par défaut
export const DEFAULT_TASK_COLOR = 'pastel-blue';

// Fonction pour obtenir les styles d'une couleur
export const getTaskColor = (colorKey) => {
  const color = PASTEL_COLORS[colorKey] || PASTEL_COLORS[DEFAULT_TASK_COLOR];
  return {
    backgroundColor: color.bg,
    color: color.text,
    borderColor: color.text + '20' // Ajout de transparence pour la bordure
  };
};

// Liste des clés pour les selectors
export const TASK_COLOR_KEYS = Object.keys(PASTEL_COLORS);