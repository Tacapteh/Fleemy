// Icônes de tâches regroupées par catégorie pour faciliter la sélection
export const TASK_ICON_CATEGORIES = [
  {
    key: 'work_general',
    label: 'Travail de bureau & gestion',
    icons: {
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
      'writing': '✍️',
      'research': '🔍',
      'analytics': '📈',
      'planning': '🗂️',
      'review': '👁️',
      'testing': '🧪'
    }
  },
  {
    key: 'services_clients',
    label: 'Services, formation & relation client',
    icons: {
      'support': '🆘',
      'education': '🎓',
      'healthcare': '⚕️',
      'finance': '💰',
      'sales': '💳',
      'marketing': '📢',
      'consulting': '🧠',
      'legal': '⚖️',
      'logistics': '📦'
    }
  },
  {
    key: 'manual_field',
    label: 'Travaux manuels, jardin & chantier',
    icons: {
      'manual_work': '🛠️',
      'maintenance': '🔧',
      'construction': '🏗️',
      'brickwork': '🧱',
      'carpentry': '🪚',
      'painting': '🖌️',
      'plumbing': '🚿',
      'electrician': '💡',
      'gardening': '🌱',
      'landscaping': '🌳',
      'farming': '🚜',
      'cleaning': '🧹',
      'delivery': '🚚',
      'warehouse': '🏭'
    }
  },
  {
    key: 'craft_workshop',
    label: 'Artisanat & atelier',
    icons: {
      'crafting': '🧵',
      'sewing': '🪡',
      'tailoring': '🧷',
      'metalwork': '⚒️',
      'repair': '🧰',
      'jewelry': '💍',
      'pottery': '🏺'
    }
  },
  {
    key: 'food_break',
    label: 'Restauration & pauses gourmandes',
    icons: {
      'coffee': '☕',
      'tea': '🍵',
      'breakfast': '🍳',
      'lunch': '🍽️',
      'dinner': '🍲',
      'snack': '🧁',
      'bakery': '🥐',
      'cooking': '👨‍🍳',
      'shopping': '🛒'
    }
  },
  {
    key: 'wellbeing',
    label: 'Bien-être & pauses actives',
    icons: {
      'break': '⏸️',
      'walk': '🚶‍♂️',
      'exercise': '💪',
      'meditation': '🧘‍♂️',
      'reading': '📖',
      'music': '🎵',
      'rest': '😴',
      'vacation': '🏖️',
      'health': '🩺'
    }
  },
  {
    key: 'versatile',
    label: 'Polyvalent & suivi',
    icons: {
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
    }
  }
];

// Objet plat utilisé par le code historique (clé => emoji)
export const TASK_ICONS = TASK_ICON_CATEGORIES.reduce((acc, category) => {
  Object.entries(category.icons).forEach(([key, emoji]) => {
    acc[key] = emoji;
  });
  return acc;
}, {});

// Map inverse pour retrouver la catégorie d'une icône
export const TASK_ICON_CATEGORY_MAP = TASK_ICON_CATEGORIES.reduce((acc, category) => {
  Object.keys(category.icons).forEach((iconKey) => {
    acc[iconKey] = category.key;
  });
  return acc;
}, {});

const EMOJI_DETECTION_REGEX = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1FAFF}]/u;

// Fonction pour obtenir l'icône par clé, avec fallback
export const getTaskIcon = (iconKey) => {
  if (typeof iconKey === 'string' && EMOJI_DETECTION_REGEX.test(iconKey)) {
    return iconKey;
  }

  return TASK_ICONS[iconKey] || TASK_ICONS['briefcase'] || '📋';
};

// Liste des clés pour les selectors
export const TASK_ICON_KEYS = Object.keys(TASK_ICONS);

const TASK_ICON_ENTRIES = Object.entries(TASK_ICONS);

export const resolveTaskIconKey = (iconValue) => {
  if (!iconValue) {
    return 'briefcase';
  }

  if (TASK_ICONS[iconValue]) {
    return iconValue;
  }

  const match = TASK_ICON_ENTRIES.find(([, emoji]) => emoji === iconValue);
  if (match) {
    return match[0];
  }

  return iconValue;
};

export const resolveTaskIconCategory = (iconValue) => {
  const key = resolveTaskIconKey(iconValue);
  return TASK_ICON_CATEGORY_MAP[key] || null;
};
