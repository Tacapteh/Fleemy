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
  const start_time = event.start_time || event.startTime || '';
  const end_time = event.end_time || event.endTime || '';
  let start = start_time;
  if (typeof start !== 'string') start = String(start || '');
  const [h = '0', m = '0'] = start.split(':');
  const startTimeFormatted = `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  return { ...event, start_time, end_time, dayFr, startTimeFormatted };
}
