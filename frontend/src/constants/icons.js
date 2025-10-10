// 50 icônes fixes pour les tâches, incluant des icônes liées au travail
export const TASK_ICONS = {
  // Travail général
  'briefcase': '💼',
  'office': '🏢',
  'computer': '💻',
  'documents': '📋',
  'presentation': '📊',
  'meeting': '🤝',
  'phone': '📞',
  'email': '📧',
  'calendar': '📅',
  'clock': '⏰',
  
  // Tâches spécifiques
  'writing': '✍️',
  'design': '🎨',
  'development': '⚙️',
  'research': '🔍',
  'analytics': '📈',
  'planning': '📋',
  'review': '👁️',
  'testing': '🧪',
  'maintenance': '🔧',
  'support': '🆘',
  
  // Activités métiers
  'gardening': '🌱',
  'cooking': '👨‍🍳',
  'cleaning': '🧹',
  'delivery': '🚚',
  'construction': '🔨',
  'education': '🎓',
  'healthcare': '⚕️',
  'finance': '💰',
  'sales': '💳',
  'marketing': '📢',
  
  // Pauses et bien-être
  'coffee': '☕',
  'lunch': '🍽️',
  'break': '⏸️',
  'walk': '🚶‍♂️',
  'exercise': '💪',
  'meditation': '🧘‍♂️',
  'reading': '📖',
  'music': '🎵',
  'rest': '😴',
  'vacation': '🏖️',
  
  // Icônes polyvalentes
  'star': '⭐',
  'check': '✅',
  'flag': '🚩',
  'target': '🎯',
  'rocket': '🚀',
  'bulb': '💡',
  'gear': '⚙️',
  'key': '🔑',
  'lock': '🔒',
  'gift': '🎁'
};

// Fonction pour obtenir l'icône par clé, avec fallback
export const getTaskIcon = (iconKey) => {
  // Si iconKey est déjà un emoji (pas une clé), le retourner directement
  if (typeof iconKey === 'string' && iconKey.length <= 4 && /[\u{1F300}-\u{1F9FF}]/u.test(iconKey)) {
    return iconKey;
  }

  return TASK_ICONS[iconKey] || TASK_ICONS['briefcase'] || '📋';
};

// Liste des clés pour les selectors
export const TASK_ICON_KEYS = Object.keys(TASK_ICONS);