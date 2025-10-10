# Corrections de l'affichage des tâches dans le planning - Version 2

## Date: 2025
## Objectif: Éliminer toute superposition entre tasks et events

---

## Problèmes résolus

### 1. **Fusion des tâches multiples sur le même créneau** ✅
**Problème:** Plusieurs tâches hebdomadaires sur le même créneau horaire (sans event) créaient des blocs séparés qui se superposaient visuellement.

**Solution implémentée dans `WeeklyGrid.jsx` (lignes 236-337):**
- Groupement des tâches autonomes par créneau horaire identique (`slotKey = startTime-endTime`)
- Création d'un seul bloc `task-standalone` par groupe
- Affichage de plusieurs icônes TaskBadge dans un conteneur flex-wrap
- Ordre stable des icônes via tri par `occurrenceId`

**Code clé:**
```javascript
const taskGroups = new Map();
uniqueTasks.forEach(task => {
  const slotKey = `${task.start.getTime()}-${task.end.getTime()}`;
  if (!taskGroups.has(slotKey)) {
    taskGroups.set(slotKey, []);
  }
  taskGroups.get(slotKey).push(task);
});
```

---

### 2. **Déduplication des icônes après reload Firestore** ✅
**Problème:** Les snapshots Firestore pouvaient créer des doublons d'occurrences, affichant la même icône plusieurs fois.

**Solution implémentée dans `WeeklyGrid.jsx`:**

**Pour les tâches autonomes (lignes 260-268):**
```javascript
const uniqueTasks = [];
const seenIds = new Set();
standaloneTasks.forEach(task => {
  if (!seenIds.has(task.occurrenceId)) {
    seenIds.add(task.occurrenceId);
    uniqueTasks.push(task);
  }
});
```

**Pour les tâches dans les events (lignes 191-207):**
```javascript
const uniqueOverlappingTasks = [];
const seenTaskIds = new Set();
overlappingTasksRaw.forEach(task => {
  if (!seenTaskIds.has(task.occurrenceId)) {
    seenTaskIds.add(task.occurrenceId);
    uniqueOverlappingTasks.push(task);
  }
});

const overlappingTasks = uniqueOverlappingTasks.sort((a, b) => 
  a.occurrenceId.localeCompare(b.occurrenceId)
);
```

---

### 3. **Gestion des z-index et priorité visuelle** ✅
**Problème:** Les z-index conflictuels créaient des overlays CSS où tasks et events se superposaient.

**Solution implémentée dans `WeeklyGrid.css`:**

**Hiérarchie claire des z-index:**
- `events-container`: z-index 20 (priorité absolue)
- `event-chip`: z-index 20 (priorité absolue)
- `tasks-container`: z-index 5 (en dessous)
- `task-standalone`: z-index 10 (normal), 15 (hover)

**Règle stricte:** Events toujours au-dessus des tasks, même au hover.

```css
/* Events ont la priorité absolue sur les tâches */
.events-container {
  z-index: 20; /* Supérieur aux tasks */
}

.task-standalone {
  z-index: 10; /* Inférieur aux events */
}

.task-standalone:hover {
  z-index: 15; /* Reste inférieur aux events même au hover */
}
```

---

### 4. **Amélioration du wrap mobile** ✅
**Problème:** Les icônes multiples ne se wrappaient pas correctement sur mobile.

**Solution implémentée:**
- Classes `flex flex-wrap gap-1` dans les conteneurs d'icônes
- Media queries pour réduire le gap sur mobile (0.125rem)
- `overflow: visible` sur `task-standalone` pour permettre le wrap

```css
/* Mobile: meilleur wrap et espacement */
@media (max-width: 768px) {
  .task-standalone .flex-wrap,
  .event-chip .flex-wrap {
    gap: 0.125rem;
  }
}
```

---

## Comportement final garanti

### ✅ Critère A: Task + Event → une seule carte (l'event) avec icône task en badge
- Implémenté dans `WeeklyGrid.jsx` lignes 176-229
- Les tâches qui chevauchent un event sont détectées via `slotsOverlap()`
- Affichées uniquement comme badges dans l'event (pas de bloc task séparé)
- Dédupliquées et triées par `occurrenceId`

### ✅ Critère B: 2+ tasks sans event → une seule carte avec plusieurs icônes
- Implémenté dans `WeeklyGrid.jsx` lignes 236-337
- Groupement par créneau horaire (`startTime-endTime`)
- Un seul bloc `task-standalone` par groupe
- Toutes les icônes dans un conteneur `flex-wrap`

### ✅ Critère C: Reload → pas de duplication, pas de clignotement
- Déduplication systématique via `Set` et `occurrenceId`
- Tri stable par `occurrenceId.localeCompare()`
- Aucun clignotement grâce au groupement avant le rendu

### ✅ Critère D: Mobile → icônes wrap propre et aria-labels présents
- `flex-wrap` activé sur tous les conteneurs d'icônes
- Gap réduit à 0.125rem sur mobile
- `aria-label` déjà présent dans `TaskBadge.jsx` (lignes 29, 61)

---

## Un seul bloc principal par case horaire

**Règle stricte appliquée:**
1. Si EVENT présent → bloc event uniquement (+ badges tasks)
2. Si TASKS sans event → bloc task fusionné (+ icônes multiples)
3. Aucun overlay CSS grâce aux z-index hiérarchisés

**Hiérarchie visuelle garantie:**
```
Event (z-index: 20)
  └─> Task badges (intégrés dans l'event)

Task standalone (z-index: 10-15)
  └─> Plusieurs icônes fusionnées si même créneau
```

---

## Fichiers modifiés

### `/app/frontend/src/components/WeeklyGrid.jsx`
**Lignes 176-207:** Déduplication et tri des tâches chevauchant les events  
**Lignes 236-337:** Fusion des tâches autonomes par créneau horaire avec déduplication

### `/app/frontend/src/styles/WeeklyGrid.css`
**Lignes 133-138:** Suppression du z-index dupliqué de `.events-container`  
**Lignes 251-304:** Hiérarchie z-index corrigée et styles de wrap mobile

---

## Tests recommandés

### Test 1: Fusion de tâches multiples
1. Créer 2-3 tâches hebdomadaires sur le même créneau (ex: Lundi 10h-11h)
2. Vérifier qu'un seul bloc apparaît avec plusieurs icônes
3. Vérifier que l'ordre des icônes est stable après reload

### Test 2: Déduplication après reload
1. Créer une tâche hebdomadaire
2. Recharger la page plusieurs fois (F5)
3. Vérifier qu'aucune icône n'est dupliquée

### Test 3: Priorité event sur task
1. Créer une tâche hebdomadaire (ex: Mardi 14h-15h)
2. Créer un event client sur le même créneau
3. Vérifier que seul l'event apparaît (pas de bloc task)
4. Vérifier que l'icône de la tâche est dans l'event comme badge

### Test 4: Mobile responsive
1. Réduire la largeur de l'écran à 768px ou moins
2. Créer plusieurs tâches sur le même créneau
3. Vérifier que les icônes se wrappent proprement
4. Vérifier les aria-labels avec un lecteur d'écran

### Test 5: Aucun overlay CSS
1. Créer un événement et une tâche sur créneaux adjacents
2. Vérifier qu'aucun bloc ne chevauche l'autre visuellement
3. Hover sur les blocs et vérifier que l'event reste au-dessus

---

## Notes techniques

### occurrenceId
Format: `{taskId}_{rangeIndex}`
- Utilisé comme clé unique pour déduplication
- Généré dans `useTasks.js` ligne 216

### slotKey
Format: `{startTime}-{endTime}` (timestamps)
- Utilisé pour grouper les tâches sur le même créneau
- Généré à partir de `task.start.getTime()` et `task.end.getTime()`

### Ordre de rendu
1. Grid layer (lignes horizontales)
2. Interactive layer (zones cliquables)
3. Events (z-index 20) avec badges tasks
4. Tasks autonomes fusionnées (z-index 10-15)

---

## Maintenance future

**Si une tâche n'apparaît pas:**
1. Vérifier que `task.start` et `task.end` sont des objets Date valides
2. Vérifier que `task.occurrenceId` est unique
3. Vérifier les logs console pour warnings

**Si des doublons apparaissent:**
1. Vérifier que `occurrenceId` est bien généré (format: `taskId_rangeIndex`)
2. Vérifier la déduplication dans `uniqueTasks` et `uniqueOverlappingTasks`

**Si des overlays CSS persistent:**
1. Vérifier les z-index dans `WeeklyGrid.css`
2. Garantir que events-container (z-index 20) > tasks-container (z-index 5)

---

## Résumé des gains

✅ **Un seul bloc par créneau horaire** → Visibilité claire  
✅ **Pas de duplication d'icônes** → Cohérence après reload  
✅ **Priorité event garantie** → Pas de conflit visuel  
✅ **Mobile responsive** → Wrap propre des icônes  
✅ **Accessibilité** → aria-labels présents  
✅ **Performance** → Déduplication avant rendu  

---

**Fin des corrections V2**
