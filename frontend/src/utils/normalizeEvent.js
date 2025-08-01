export const DAY_MAP = {
  monday: 'Lundi',
  tuesday: 'Mardi',
  wednesday: 'Mercredi',
  thursday: 'Jeudi',
  friday: 'Vendredi',
  saturday: 'Samedi',
  sunday: 'Dimanche',
};

export default function normalizeEvent(event = {}) {
  const dayKey = String(event.day || '').toLowerCase();
  const dayFr = DAY_MAP[dayKey] || event.day;
  let start = event.start_time || event.start || '';
  if (typeof start !== 'string') start = String(start || '');
  const [h = '0', m = '0'] = start.split(':');
  const startTimeFormatted = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  return { ...event, dayFr, startTimeFormatted };
}
