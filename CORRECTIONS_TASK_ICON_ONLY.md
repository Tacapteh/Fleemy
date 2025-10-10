# Corrections : Tâches chevauchantes en mode icône uniquement

## 📋 Problème résolu
Les tâches chevauchant un événement apparaissaient comme des mini-cartes (TaskBadge complets avec fond, bordure, texte). 
Elles doivent maintenant être des simples badges d'icônes (18×18, transparents, inline) à l'intérieur du bloc événement.

## ✅ Modifications apportées

### 1. `/app/frontend/src/components/TaskBadge.jsx`
**Ajout du mode "icon-only"** :
- Nouveau paramètre `mode` avec valeurs `'badge'` (défaut) ou `'icon-only'`
- En mode `icon-only` :
  - Affichage uniquement de l'icône (18×18px)
  - Fond transparent, sans bordure ni ombre
  - Conserve l'accessibilité (aria-label, title)
  - Cliquable avec feedback hover
  - Contraste garanti avec la couleur de l'icône

**Code clé** :
```jsx
mode = 'badge' // 'badge' ou 'icon-only'

if (mode === 'icon-only') {
  return (
    <span className="w-[18px] h-[18px]" aria-label={ariaLabel}>
      {icon}
    </span>
  );
}
```

### 2. `/app/frontend/src/components/WeeklyGrid.jsx`
**Utilisation du mode icon-only pour les tâches chevauchantes** :
- Ligne 231 : Changement de `size="small"` vers `mode="icon-only"`
- Suppression de l'opacity sur le conteneur des icônes
- Garde la déduplication et l'ordre stable déjà en place (lignes 192-203)
- Garde le filtrage des tâches autonomes (lignes 254-273)

**Code modifié** :
```jsx
{overlappingTasks.map((task) => (
  <TaskBadge
    key={task.occurrenceId}
    task={task}
    mode="icon-only"  // ← Changement ici
    isReadOnly={task.readOnly || isReadOnlyMode}
    onClick={onTaskClick}
  />
))}
```

### 3. `/app/frontend/src/styles/WeeklyGrid.css`
**Amélioration des styles pour les icônes** :
- Ajout de `min-height: 18px` pour garantir l'alignement
- Transition douce pour le hover
- Responsive mobile avec gap réduit (`0.125rem`)
- Garantie de visibilité sur mobile avec `line-height: 1`

## 🎯 Critères d'acceptation validés

### A) Task + Event → 1 seul bloc avec icône ✅
- Une tâche chevauchant un événement apparaît uniquement comme une icône 18×18 dans l'événement
- Pas de mini-carte, pas de fond, pas de texte
- L'icône est inline et transparente

### B) 2 tasks sans event → 1 carte fusionnée ✅
- Comportement existant préservé
- Les tâches autonomes (sans chevauchement) sont fusionnées en une seule carte
- Affichent les badges complets avec icône + texte + prix

### C) Reload → pas de doublons ✅
- Déduplication par `occurrenceId` déjà en place (ligne 192-198)
- Tri stable par `occurrenceId.localeCompare()` (ligne 201-203)
- Aucun clignotement ni doublon après reload

### D) Mobile → wrap correct et accessibilité ✅
- `flex-wrap` avec `gap: 0.25rem` (0.125rem sur mobile)
- Aria-label descriptif : `"Tâche: {label}, {time}, {price}"`
- Contraste garanti via la couleur de l'icône
- Tooltip au hover avec toutes les infos

## 🔧 Code technique

### Déduplication (déjà présente)
```jsx
const uniqueOverlappingTasks = [];
const seenTaskIds = new Set();
overlappingTasksRaw.forEach(task => {
  if (!seenTaskIds.has(task.occurrenceId)) {
    seenTaskIds.add(task.occurrenceId);
    uniqueOverlappingTasks.push(task);
  }
});
```

### Filtrage des tâches autonomes (déjà présent)
```jsx
const standaloneTasks = dayTasks.filter((task) => {
  const hasOverlap = columns[dayIndex].some(event => {
    return slotsOverlap(
      { startDate: eventStart, endDate: eventEnd },
      { startDate: task.start, endDate: task.end }
    );
  });
  return !hasOverlap; // Seulement les tâches sans chevauchement
});
```

## 🚀 Impact
- **Performance** : Identique (pas de changement structurel)
- **Accessibilité** : Préservée (aria-label, title, keyboard navigation)
- **UX** : Améliorée (moins de clutter visuel, priorité à l'événement)
- **Mobile** : Optimisé (meilleur wrap, espacement réduit)

## 📦 Fichiers modifiés
1. `/app/frontend/src/components/TaskBadge.jsx`
2. `/app/frontend/src/components/WeeklyGrid.jsx`
3. `/app/frontend/src/styles/WeeklyGrid.css`

## ✨ Résultat final
- Event + Task chevauchante → **1 bloc event avec icône simple 18×18**
- Pas de mini-carte TaskBadge dans les événements
- Tâches autonomes → cartes fusionnées normales (inchangé)
- Pas de doublons après reload
- Mobile responsive avec bon contraste
