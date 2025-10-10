# 🧪 Tests de rendu des tâches et événements

## Test 1: Vérifier le chargement des tâches

### Dans la console du navigateur (F12):

```javascript
// Vérifier l'état actuel
console.log('User:', window.auth?.currentUser?.uid);

// Simuler la création d'une tâche de test (à exécuter dans la console)
// Note: Ceci nécessite que vous soyez connecté
```

## Test 2: Créer une tâche hebdomadaire via l'interface

1. Aller sur la page Planning
2. Cliquer sur **"+ Tâche hebdomadaire"**
3. Remplir le formulaire:
   ```
   Titre: Test Tâche 1
   Jours: Lundi, Mercredi
   Lundi: 10:00 - 11:00
   Mercredi: 14:00 - 15:30
   Couleur: Bleu
   Prix: 50
   ```
4. Sauvegarder

### Logs attendus:
```
🔍 useTasks useEffect déclenché
📸 useTasks: Snapshot reçu { size: 1 }
✅ useTasks: Document normalisé { id: '...', task: {...} }
📊 useTasks: Mise à jour tasks depuis sources { count: 1 }
```

## Test 3: Créer un événement qui chevauche

1. Cliquer sur **"+ Événement"**
2. Remplir:
   ```
   Client: Test Client
   Jour: Lundi
   Heure: 10:00 - 11:00
   Statut: Impayé
   ```
3. Sauvegarder

### Résultat attendu:
- ✅ L'événement s'affiche avec une bordure rouge (impayé)
- ✅ L'icône de la tâche (📋) apparaît en bas à droite de l'événement
- ✅ Pas de bloc tâche séparé au même endroit
- ✅ La tâche du mercredi s'affiche normalement (pas de chevauchement)

### Logs attendus:
```
[WeeklyGrid] Chevauchement détecté: { event: {...}, task: {...}, dayIndex: 0 }
[WeeklyGrid] Tâche xxx_0 filtrée (chevauche un événement)
[WeeklyGrid] Tâche xxx_1 autonome (pas de chevauchement)
```

## Test 4: Vérifier l'absence de duplication après reload

1. Recharger la page (F5)
2. Attendre le chargement complet

### Résultat attendu:
- ✅ Les icônes n'apparaissent qu'une seule fois
- ✅ Pas de clignotement
- ✅ Ordre stable des icônes

### Logs attendus (pas de duplication):
```
📸 useTasks: Snapshot reçu { size: 1, empty: false }
📊 useTasks: Mise à jour tasks depuis sources { count: 1, taskIds: ['xxx'], tasks: [...] }
```

## Test 5: Tester avec plusieurs tâches chevauchant le même événement

1. Créer une 2ème tâche hebdomadaire:
   ```
   Titre: Test Tâche 2
   Jour: Lundi
   Heure: 10:00 - 11:00
   Icône: 💼
   ```

2. Créer une 3ème tâche:
   ```
   Titre: Test Tâche 3
   Jour: Lundi
   Heure: 10:00 - 11:00
   Icône: 📊
   ```

### Résultat attendu:
```
┌─────────────────────────────┐
│ Test Client                 │
│                              │
│                  📋 💼 📊  │ ← 3 icônes alignées
└─────────────────────────────┘
```

- ✅ Les 3 icônes apparaissent en bas à droite
- ✅ Elles sont alignées horizontalement avec gap de 4px
- ✅ Wrap automatique si écran trop petit
- ✅ Pas de bloc tâche séparé

## Test 6: Tester la réactivité mobile

1. Ouvrir DevTools (F12)
2. Passer en mode responsive (Ctrl+Shift+M)
3. Sélectionner iPhone SE ou équivalent

### Résultat attendu:
- ✅ Les icônes restent visibles (18×18px)
- ✅ Gap réduit à 2px (0.125rem)
- ✅ Pas de débordement
- ✅ Tooltip fonctionne au tap

## Test 7: Vérifier l'accessibilité

1. Naviguer au clavier (Tab)
2. Hover sur une icône de tâche

### Résultat attendu:
- ✅ Focus visible sur les icônes cliquables
- ✅ Tooltip au hover avec infos complètes
- ✅ Aria-label descriptif
- ✅ Enter/Space pour ouvrir le modal de la tâche

## Checklist finale

- [ ] Les tâches se chargent (logs avec emojis visibles)
- [ ] Les tâches chevauchantes affichent uniquement leur icône dans l'événement
- [ ] Les tâches autonomes affichent leur bloc complet
- [ ] Pas de duplication après reload
- [ ] Les icônes sont cliquables et ouvrent le modal de tâche
- [ ] Le responsive mobile fonctionne
- [ ] L'accessibilité est préservée

## 🐛 Si un test échoue

1. **Vérifier les logs détaillés** dans la console (emojis)
2. **Consulter** `/app/DEBUG_TASKS_LOADING.md` pour les solutions
3. **Vérifier Firestore** que les tâches ont bien `weekly: true` et `time_ranges`
4. **Vérifier les permissions** dans les règles Firestore
5. **Redémarrer les services** si nécessaire: `sudo supervisorctl restart all`
