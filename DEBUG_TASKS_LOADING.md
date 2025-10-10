# 🐛 Guide de débogage - Chargement des tâches

## ✅ Corrections appliquées

### 1. Amélioration des logs dans useTasks.js
- Ajout d'emojis pour faciliter le suivi (🔍, 📸, ✅, ❌, etc.)
- Logs détaillés à chaque étape du chargement
- Affichage des données brutes et normalisées
- Meilleure visibilité des erreurs

### 2. Vérification du rendu des icônes
- Code déjà correct pour le mode "icon-only"
- Les icônes s'affichent dans le coin inférieur droit des événements
- Déduplication des tâches par occurrenceId
- Pas de bloc de tâche créé pour les tâches chevauchantes

## 🔍 Comment débuguer

### Étape 1: Vérifier les logs dans la console du navigateur

Ouvrez la console de votre navigateur (F12) et cherchez ces messages:

```
🔍 useTasks useEffect déclenché { userId: '...', weekStartISO: '...', teamId: '...' }
```

Si vous voyez:
- ✅ `📸 useTasks: Snapshot reçu { size: X }` avec X > 0 → Les tâches sont trouvées
- ⚠️ `📸 useTasks: Snapshot reçu { size: 0, empty: true }` → Aucune tâche dans Firestore
- ❌ `Erreur écoute tâches` → Problème de permissions ou de configuration

### Étape 2: Vérifier la structure des tâches dans Firestore

Les tâches hebdomadaires doivent avoir cette structure dans la collection `tasks`:

```json
{
  "id": "task_123",
  "user_id": "LWDyUjBIKqa362JovhzaB6xzVIG3",
  "label": "Réunion client",
  "weekly": true,
  "time_ranges": [
    {
      "day": 0,
      "start": "09:00",
      "end": "10:00"
    },
    {
      "day": 2,
      "start": "14:00",
      "end": "15:30"
    }
  ],
  "color": "#dbeafe",
  "icon": "📋",
  "price": 50,
  "team_id": null,
  "created_at": "...",
  "updated_at": "..."
}
```

**Points importants:**
- ✅ `weekly: true` est OBLIGATOIRE
- ✅ `user_id` doit correspondre à l'utilisateur connecté
- ✅ `time_ranges` est un tableau d'objets avec `day` (0-6), `start` et `end`
- ✅ `day`: 0 = Lundi, 1 = Mardi, 2 = Mercredi, 3 = Jeudi, 4 = Vendredi, 5 = Samedi, 6 = Dimanche

### Étape 3: Créer une tâche de test

Utilisez le bouton **"+ Tâche hebdomadaire"** dans l'interface Planning pour créer une tâche test:

1. Cliquez sur **"+ Tâche hebdomadaire"**
2. Remplissez:
   - Titre: "Test tâche"
   - Sélectionnez un ou plusieurs jours
   - Définissez les horaires (ex: 10:00 - 11:00)
   - Choisissez une couleur et un prix (optionnel)
3. Cliquez sur "Enregistrer"

Vérifiez les logs dans la console:
```
✅ useTasks: Document normalisé { sourceKey: 'global_user_id', id: '...', task: {...} }
📊 useTasks: Mise à jour tasks depuis sources { count: 1, taskIds: [...], tasks: [...] }
```

### Étape 4: Tester le chevauchement avec un événement

1. **Créer un événement** (bouton "+ Événement"):
   - Jour: Lundi
   - Heure: 10:00 - 11:00
   - Client: "Test Client"

2. **Créer une tâche chevauchante**:
   - Jour: Lundi
   - Heure: 10:00 - 11:00 (même créneau)

3. **Vérifier le rendu**:
   - ✅ L'événement s'affiche normalement (bloc complet avec bordure colorée)
   - ✅ La tâche N'apparaît PAS comme un bloc séparé
   - ✅ L'icône de la tâche (18×18px) apparaît dans le coin inférieur droit de l'événement
   - ✅ Au hover sur l'icône, vous voyez le tooltip avec le titre de la tâche

Dans la console, vous devriez voir:
```
[WeeklyGrid] Chevauchement détecté: { event: {...}, task: {...}, dayIndex: 0 }
[WeeklyGrid] Tâche task_123_0 filtrée (chevauche un événement)
```

### Étape 5: Tester une tâche sans chevauchement

1. **Créer une tâche autonome**:
   - Jour: Mardi
   - Heure: 14:00 - 15:00
   - (Pas d'événement à cette heure)

2. **Vérifier le rendu**:
   - ✅ La tâche s'affiche comme un bloc complet avec icône + texte + prix
   - ✅ Pas d'icône seule

Dans la console:
```
[WeeklyGrid] Tâche task_456_0 autonome (pas de chevauchement)
```

## 🎯 Résultats attendus

### Scénario A: Tâche + Événement qui se chevauchent
```
┌─────────────────────────────┐
│ Événement Test Client       │ ← Bloc événement complet
│                              │
│                          📋 │ ← Icône 18×18 en bas à droite
└─────────────────────────────┘
```
- ✅ 1 seul bloc (l'événement)
- ✅ Icône de la tâche en bas à droite
- ✅ Pas de bloc tâche séparé

### Scénario B: Tâche seule (pas de chevauchement)
```
┌─────────────────────────────┐
│ 📋 Réunion client      50€  │ ← Bloc tâche complet
└─────────────────────────────┘
```
- ✅ Bloc tâche complet avec icône, texte et prix
- ✅ Fond coloré, bordure

### Scénario C: Plusieurs tâches chevauchent le même événement
```
┌─────────────────────────────┐
│ Événement Important         │
│                              │
│                    📋 💼 📊 │ ← 3 icônes côte à côte
└─────────────────────────────┘
```
- ✅ Les icônes se placent horizontalement
- ✅ Wrap automatique si trop d'icônes
- ✅ Pas de doublon après reload

## ⚠️ Problèmes courants

### Problème 1: Aucune tâche ne s'affiche
**Symptômes:** `tasksCount: 0, occurrencesCount: 0` dans les logs

**Solutions:**
1. Vérifiez que vous avez créé des tâches hebdomadaires (`weekly: true`)
2. Vérifiez que `user_id` correspond à votre utilisateur connecté
3. Vérifiez les règles Firestore (déjà correctes dans ce projet)
4. Consultez les logs détaillés avec les emojis pour voir où ça bloque

### Problème 2: Tâches dupliquées après reload
**Symptômes:** Icônes apparaissent en double dans les événements

**Solutions:**
- ✅ Déjà corrigé: déduplication par `occurrenceId` (lignes 200-208 de WeeklyGrid.jsx)
- ✅ Tri stable par `occurrenceId.localeCompare()` (ligne 211-213)

### Problème 3: Tâches apparaissent comme des blocs au lieu d'icônes
**Symptômes:** TaskBadge complet au lieu d'icône seule

**Solutions:**
- ✅ Déjà corrigé: `mode="icon-only"` passé à TaskBadge (ligne 259)
- Vérifiez que TaskBadge.jsx contient bien la gestion du mode "icon-only"

### Problème 4: Icônes pas visibles / trop petites
**Symptômes:** Icônes invisibles sur mobile

**Solutions:**
- ✅ Déjà corrigé: taille fixe 18×18px
- ✅ Déjà corrigé: gap adaptatif mobile (0.125rem)
- ✅ Contraste garanti via `color: colorStyles.color`

## 📊 Logs de référence

### Chargement réussi
```
🔍 useTasks useEffect déclenché { userId: 'LWDyUjBIKqa362JovhzaB6xzVIG3', weekStartISO: '2025-10-05', teamId: null }
🎯 useTasks: Nombre de queries créées: 1
👂 useTasks: Démarrage écoute pour global_user_id
📸 useTasks: Snapshot reçu { sourceKey: 'global_user_id', size: 2, userId: '...', empty: false }
📄 useTasks: Document brut { sourceKey: 'global_user_id', id: 'task_1', rawData: {...}, weekly: true, user_id: '...', time_ranges: [...] }
✅ useTasks: Document normalisé { sourceKey: 'global_user_id', id: 'task_1', task: {...} }
📦 useTasks: Tâches normalisées pour global_user_id : [{...}, {...}]
📊 useTasks: Mise à jour tasks depuis sources { count: 2, taskIds: ['task_1', 'task_2'], tasks: [...] }
```

### Aucune tâche trouvée
```
🔍 useTasks useEffect déclenché { userId: 'LWDyUjBIKqa362JovhzaB6xzVIG3', weekStartISO: '2025-10-05', teamId: null }
🎯 useTasks: Nombre de queries créées: 1
👂 useTasks: Démarrage écoute pour global_user_id
📸 useTasks: Snapshot reçu { sourceKey: 'global_user_id', size: 0, userId: '...', empty: true }
📦 useTasks: Tâches normalisées pour global_user_id : []
📊 useTasks: Mise à jour tasks depuis sources { count: 0, taskIds: [], tasks: [] }
```
→ **C'est normal si vous n'avez pas encore créé de tâches!**

### Erreur de permissions
```
🔍 useTasks useEffect déclenché { userId: '...', weekStartISO: '...', teamId: null }
❌ useTasks: Erreur écoute tâches { sourceKey: 'global_user_id', err: {...}, code: 'permission-denied', message: '...' }
```
→ Vérifiez les règles Firestore

## 🚀 Prochaines étapes

1. **Créer des tâches de test** via l'interface
2. **Vérifier les logs** dans la console du navigateur
3. **Tester les scénarios** A, B et C ci-dessus
4. **Signaler tout problème** avec les logs complets

## 📝 Notes techniques

- **Collection Firestore:** `tasks` (root level, pas sous-collection)
- **Query:** `where('user_id', '==', userId)` + `where('weekly', '==', true)`
- **Hook:** `useTasks(userId, weekStartISO, teamId)`
- **Rendu:** WeeklyGrid.jsx avec mode "icon-only" pour les chevauchements
- **Déduplication:** Par `occurrenceId` (format: `{taskId}_{rangeIndex}`)
