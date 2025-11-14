import React from 'react';
import { getIcon } from '../icons/registry';

const createIconConfig = (emoji, icon) => ({ emoji, icon });

const ICON_CONFIGS = {
  briefcase: createIconConfig('💼', 'briefcase'),
  office: createIconConfig('🏢', 'office'),
  computer: createIconConfig('💻', 'computer'),
  documents: createIconConfig('📋', 'documents'),
  presentation: createIconConfig('📊', 'presentation'),
  meeting: createIconConfig('🤝', 'meeting'),
  phone: createIconConfig('📞', 'phone'),
  email: createIconConfig('📧', 'email'),
  calendar: createIconConfig('📅', 'calendar'),
  clock: createIconConfig('⏰', 'clock'),
  writing: createIconConfig('✍️', 'writing'),
  research: createIconConfig('🔍', 'research'),
  analytics: createIconConfig('📈', 'analytics'),
  planning: createIconConfig('🗂️', 'planning'),
  review: createIconConfig('👁️', 'review'),
  testing: createIconConfig('🧪', 'testing'),
  support: createIconConfig('🆘', 'support'),
  education: createIconConfig('🎓', 'education'),
  healthcare: createIconConfig('⚕️', 'healthcare'),
  finance: createIconConfig('💰', 'finance'),
  sales: createIconConfig('💳', 'sales'),
  marketing: createIconConfig('📢', 'marketing'),
  consulting: createIconConfig('🧠', 'consulting'),
  legal: createIconConfig('⚖️', 'legal'),
  logistics: createIconConfig('📦', 'logistics'),
  manual_work: createIconConfig('🛠️', 'manual_work'),
  maintenance: createIconConfig('🔧', 'maintenance'),
  construction: createIconConfig('🏗️', 'construction'),
  brickwork: createIconConfig('🧱', 'brickwork'),
  carpentry: createIconConfig('🪚', 'carpentry'),
  painting: createIconConfig('🖌️', 'painting'),
  plumbing: createIconConfig('🚿', 'plumbing'),
  electrician: createIconConfig('💡', 'electrician'),
  gardening: createIconConfig('🌱', 'gardening'),
  landscaping: createIconConfig('🌳', 'landscaping'),
  farming: createIconConfig('🚜', 'farming'),
  cleaning: createIconConfig('🧹', 'cleaning'),
  delivery: createIconConfig('🚚', 'delivery'),
  warehouse: createIconConfig('🏭', 'warehouse'),
  crafting: createIconConfig('🧵', 'crafting'),
  sewing: createIconConfig('🪡', 'sewing'),
  tailoring: createIconConfig('🧷', 'tailoring'),
  metalwork: createIconConfig('⚒️', 'metalwork'),
  repair: createIconConfig('🧰', 'repair'),
  jewelry: createIconConfig('💍', 'jewelry'),
  pottery: createIconConfig('🏺', 'pottery'),
  coffee: createIconConfig('☕', 'coffee'),
  tea: createIconConfig('🍵', 'tea'),
  breakfast: createIconConfig('🍳', 'breakfast'),
  lunch: createIconConfig('🍽️', 'lunch'),
  dinner: createIconConfig('🍲', 'dinner'),
  snack: createIconConfig('🧁', 'snack'),
  bakery: createIconConfig('🥐', 'bakery'),
  cooking: createIconConfig('👨‍🍳', 'cooking'),
  shopping: createIconConfig('🛒', 'shopping'),
  break: createIconConfig('⏸️', 'break'),
  walk: createIconConfig('🚶‍♂️', 'walk'),
  exercise: createIconConfig('💪', 'exercise'),
  meditation: createIconConfig('🧘‍♂️', 'meditation'),
  reading: createIconConfig('📖', 'reading'),
  music: createIconConfig('🎵', 'music'),
  rest: createIconConfig('😴', 'rest'),
  vacation: createIconConfig('🏖️', 'vacation'),
  health: createIconConfig('🩺', 'health'),
  star: createIconConfig('⭐', 'star'),
  check: createIconConfig('✅', 'check'),
  flag: createIconConfig('🚩', 'flag'),
  target: createIconConfig('🎯', 'target'),
  rocket: createIconConfig('🚀', 'rocket'),
  bulb: createIconConfig('💡', 'bulb'),
  gear: createIconConfig('⚙️', 'gear'),
  key: createIconConfig('🔑', 'key'),
  lock: createIconConfig('🔒', 'lock'),
  gift: createIconConfig('🎁', 'gift')
};

const pickIcons = (keys) =>
  keys.reduce((acc, key) => {
    if (ICON_CONFIGS[key]) {
      acc[key] = ICON_CONFIGS[key];
    }
    return acc;
  }, {});

export const TASK_ICON_CATEGORIES = [
  {
    key: 'work_general',
    label: 'Travail de bureau & gestion',
    icons: pickIcons([
      'briefcase',
      'office',
      'computer',
      'documents',
      'presentation',
      'meeting',
      'phone',
      'email',
      'calendar',
      'clock',
      'writing',
      'research',
      'analytics',
      'planning',
      'review',
      'testing'
    ])
  },
  {
    key: 'services_clients',
    label: 'Services, formation & relation client',
    icons: pickIcons([
      'support',
      'education',
      'healthcare',
      'finance',
      'sales',
      'marketing',
      'consulting',
      'legal',
      'logistics'
    ])
  },
  {
    key: 'manual_field',
    label: 'Travaux manuels, jardin & chantier',
    icons: pickIcons([
      'manual_work',
      'maintenance',
      'construction',
      'brickwork',
      'carpentry',
      'painting',
      'plumbing',
      'electrician',
      'gardening',
      'landscaping',
      'farming',
      'cleaning',
      'delivery',
      'warehouse'
    ])
  },
  {
    key: 'craft_workshop',
    label: 'Artisanat & atelier',
    icons: pickIcons([
      'crafting',
      'sewing',
      'tailoring',
      'metalwork',
      'repair',
      'jewelry',
      'pottery'
    ])
  },
  {
    key: 'food_break',
    label: 'Restauration & pauses gourmandes',
    icons: pickIcons([
      'coffee',
      'tea',
      'breakfast',
      'lunch',
      'dinner',
      'snack',
      'bakery',
      'cooking',
      'shopping'
    ])
  },
  {
    key: 'wellbeing',
    label: 'Bien-être & pauses actives',
    icons: pickIcons([
      'break',
      'walk',
      'exercise',
      'meditation',
      'reading',
      'music',
      'rest',
      'vacation',
      'health'
    ])
  },
  {
    key: 'versatile',
    label: 'Polyvalent & suivi',
    icons: pickIcons([
      'star',
      'check',
      'flag',
      'target',
      'rocket',
      'bulb',
      'gear',
      'key',
      'lock',
      'gift'
    ])
  }
];

export const TASK_ICONS = ICON_CONFIGS;

export const TASK_ICON_CATEGORY_MAP = TASK_ICON_CATEGORIES.reduce((acc, category) => {
  Object.keys(category.icons).forEach((iconKey) => {
    acc[iconKey] = category.key;
  });
  return acc;
}, {});

const TASK_ICON_KEYS_INTERNAL = Object.keys(ICON_CONFIGS);

const EMOJI_TO_ICON_KEY = TASK_ICON_KEYS_INTERNAL.reduce((acc, key) => {
  const config = ICON_CONFIGS[key];
  if (config?.emoji) {
    acc[config.emoji] = key;
  }
  return acc;
}, {});

export const TASK_ICON_KEYS = TASK_ICON_KEYS_INTERNAL;

export const resolveTaskIconKey = (iconValue) => {
  if (!iconValue) {
    return 'briefcase';
  }

  if (ICON_CONFIGS[iconValue]) {
    return iconValue;
  }

  if (typeof iconValue === 'string' && EMOJI_TO_ICON_KEY[iconValue]) {
    return EMOJI_TO_ICON_KEY[iconValue];
  }

  return iconValue;
};

export const resolveTaskIconCategory = (iconValue) => {
  const key = resolveTaskIconKey(iconValue);
  return TASK_ICON_CATEGORY_MAP[key] || null;
};

export const getTaskIcon = (iconValue, options = {}) => {
  const resolvedKey = resolveTaskIconKey(iconValue);
  const iconId = ICON_CONFIGS[resolvedKey]?.icon || resolvedKey;
  const IconComponent = getIcon(iconId);
  const { className, strokeWidth = 1.8, ...rest } = options;
  const finalClassName = className ?? 'h-5 w-5';

  return (
    <IconComponent
      className={finalClassName}
      strokeWidth={strokeWidth}
      aria-hidden="true"
      focusable="false"
      {...rest}
    />
  );
};
