/**
 * Utilitaires pour la conversion et manipulation du temps dans la grille hebdomadaire
 */

// Constantes de configuration
export const DAY_START_HOUR = 9;  // 09:00
export const DAY_END_HOUR = 18;   // 18:00 (exclusif)
export const SLOT_HEIGHT = 64;    // Hauteur d'un slot d'1h en pixels

/**
 * Convertit une heure HH:MM en minutes depuis minuit
 */
export const timeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  
  if (Number.isNaN(hours) || Number.isNaN(minutes) || minutes < 0 || minutes > 59) return 0;
  if (hours === 24) {
    return minutes === 0 ? 24 * 60 : 0;
  }
  if (hours < 0 || hours > 23) return 0;

  return hours * 60 + minutes;
};

/**
 * Convertit des minutes depuis minuit en heure HH:MM
 */
export const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

/**
 * Convertit une Date en heure HH:MM
 */
export const dateToTime = (date) => {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '00:00';
  
  const hours = date.getHours();
  const minutes = date.getMinutes();
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Calcule la position top en pourcentage pour un élément dans la grille
 * @param {Date|string} startTime - Heure de début
 * @param {boolean} clamp - Limiter à la plage horaire visible
 */
export const calculateTopPosition = (startTime, clamp = true, unit = 'percentage') => {
  let minutes;

  if (startTime instanceof Date) {
    minutes = startTime.getHours() * 60 + startTime.getMinutes();
  } else if (typeof startTime === 'string') {
    minutes = timeToMinutes(startTime);
  } else {
    return 0;
  }
  
  const startMinutes = DAY_START_HOUR * 60;
  const endMinutes = DAY_END_HOUR * 60;

  if (clamp) {
    minutes = Math.max(startMinutes, Math.min(minutes, endMinutes));
  }

  const offset = minutes - startMinutes;
  if (unit === 'minutes') {
    return offset;
  }

  return (offset / (endMinutes - startMinutes)) * 100;
};

/**
 * Calcule la hauteur en pourcentage pour un élément dans la grille
 * @param {Date|string} startTime - Heure de début
 * @param {Date|string} endTime - Heure de fin
 * @param {boolean} clamp - Limiter à la plage horaire visible
 */
export const calculateHeight = (startTime, endTime, clamp = true, unit = 'percentage') => {
  let startMinutes, endMinutes;

  if (startTime instanceof Date) {
    startMinutes = startTime.getHours() * 60 + startTime.getMinutes();
  } else if (typeof startTime === 'string') {
    startMinutes = timeToMinutes(startTime);
  } else {
    return 0;
  }
  
  if (endTime instanceof Date) {
    endMinutes = endTime.getHours() * 60 + endTime.getMinutes();
  } else if (typeof endTime === 'string') {
    endMinutes = timeToMinutes(endTime);
  } else {
    return 0;
  }
  
  const gridStartMinutes = DAY_START_HOUR * 60;
  const gridEndMinutes = DAY_END_HOUR * 60;

  if (clamp) {
    startMinutes = Math.max(gridStartMinutes, startMinutes);
    endMinutes = Math.min(gridEndMinutes, endMinutes);
  }

  if (endMinutes <= startMinutes) return 0;

  const duration = endMinutes - startMinutes;
  if (unit === 'minutes') {
    return duration;
  }

  return (duration / (gridEndMinutes - gridStartMinutes)) * 100;
};

/**
 * Vérifie si deux créneaux se chevauchent
 * @param {Object} slot1 - Premier créneau {startDate, endDate}
 * @param {Object} slot2 - Deuxième créneau {startDate, endDate}
 */
export const slotsOverlap = (slot1, slot2) => {
  if (!slot1?.startDate || !slot1?.endDate || !slot2?.startDate || !slot2?.endDate) {
    return false;
  }
  
  const start1 = slot1.startDate.getTime();
  const end1 = slot1.endDate.getTime();
  const start2 = slot2.startDate.getTime();
  const end2 = slot2.endDate.getTime();
  
  return start1 < end2 && start2 < end1;
};

/**
 * Calcule l'index du jour dans la semaine (0 = lundi, 6 = dimanche)
 * @param {Date} date
 * @param {Date} weekStart - Date du lundi de la semaine
 */
export const getDayIndex = (date, weekStart) => {
  if (!(date instanceof Date) || !(weekStart instanceof Date)) return -1;
  
  const daysDiff = Math.floor((date - weekStart) / (24 * 60 * 60 * 1000));
  return daysDiff >= 0 && daysDiff < 7 ? daysDiff : -1;
};