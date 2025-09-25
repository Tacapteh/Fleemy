// Test pour vérifier la génération d'occurrences des tâches hebdomadaires

// Simuler les données d'une tâche hebdomadaire
const mockTask = {
  id: 'test-task-1',
  label: 'Jardinage matinal',
  color: 'pastel-green',
  icon: 'gardening',
  weekly: true,
  time_ranges: [
    { day: 0, start: '09:00', end: '10:00' }, // Lundi 9h-10h
    { day: 2, start: '14:00', end: '15:00' }  // Mercredi 14h-15h
  ],
  price: 25,
  user_id: 'test-user'
};

// Simuler weekStartISO (lundi de cette semaine)
const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajuster pour lundi
  return new Date(d.setDate(diff));
};

const weekStartISO = getMonday(new Date()).toISOString().split('T')[0];
console.log('Week start ISO:', weekStartISO);

// Calculer la semaine visible en dates absolues
const weekDates = [];
const monday = new Date(weekStartISO + 'T00:00:00');
for (let i = 0; i < 7; i++) {
  const day = new Date(monday);
  day.setDate(monday.getDate() + i);
  weekDates.push(day);
}

console.log('Week dates:', weekDates.map(d => d.toISOString().split('T')[0]));

// Fonction de génération d'occurrences (copiée de useTasks)
function generateOccurrences(tasks, weekDates, currentUid = 'test-user') {
  if (!tasks.length || !weekDates) {
    console.log('Pas de tâches ou weekDates manquantes');
    return [];
  }
  
  const result = [];
  
  tasks.forEach(task => {
    console.log('Traitement tâche:', { id: task.id, label: task.label, weekly: task.weekly, time_ranges: task.time_ranges });
    
    // Vérifier que la tâche est hebdomadaire et a des créneaux
    if (!task.weekly || !Array.isArray(task.time_ranges)) {
      console.log('Tâche ignorée - pas hebdomadaire ou pas de time_ranges');
      return;
    }
    
    task.time_ranges.forEach((range, rangeIndex) => {
      const { day, start, end } = range;
      console.log('Traitement time_range:', { day, start, end, rangeIndex });
      
      // day doit être entre 0 (lundi) et 6 (dimanche)
      if (typeof day !== 'number' || day < 0 || day > 6) {
        console.log('Jour invalide:', day);
        return;
      }
      
      // Valider et parser les heures
      const parseTime = (timeStr) => {
        if (!timeStr || typeof timeStr !== 'string') return null;
        const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) return null;
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
        return { hours, minutes };
      };
      
      const startTime = parseTime(start);
      const endTime = parseTime(end);
      
      if (!startTime || !endTime) {
        console.log('Heures invalides:', { start, end });
        return;
      }
      
      // Créer les dates absolues pour cette occurrence
      const dayDate = weekDates[day];
      if (!dayDate) {
        console.log('Date jour manquante:', { day });
        return;
      }
      
      const startDate = new Date(dayDate);
      startDate.setHours(startTime.hours, startTime.minutes, 0, 0);
      
      const endDate = new Date(dayDate);
      endDate.setHours(endTime.hours, endTime.minutes, 0, 0);
      
      // Vérifier que l'heure de fin est après l'heure de début
      if (endDate <= startDate) {
        console.log('Heure de fin invalide:', { startDate, endDate });
        return;
      }
      
      const occurrence = {
        taskId: task.id,
        occurrenceId: `${task.id}_${rangeIndex}`,
        dayIndex: day,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        label: task.label || 'Tâche sans titre',
        color: task.color || '#dbeafe',
        icon: task.icon || '📋',
        price: task.price || null,
        readOnly: task.user_id !== currentUid,
        weekly: true
      };
      
      console.log('Occurrence créée:', occurrence);
      result.push(occurrence);
    });
  });
  
  console.log('Total occurrences générées:', result.length);
  return result;
}

// Test de la génération
const tasks = [mockTask];
const occurrences = generateOccurrences(tasks, weekDates);

console.log('=== RÉSULTAT FINAL ===');
console.log('Tâches:', tasks.length);
console.log('Occurrences:', occurrences.length);
console.log('Détail occurrences:', JSON.stringify(occurrences, null, 2));