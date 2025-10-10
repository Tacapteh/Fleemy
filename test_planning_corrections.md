# Plan de test - Corrections Planning Fleemy

## Tests à effectuer manuellement

### ✅ Test 1: Fusion de tâches multiples sur le même créneau
**Objectif:** Vérifier qu'un seul bloc apparaît avec plusieurs icônes

**Étapes:**
1. Se connecter à l'application Fleemy
2. Aller dans Planning (vue semaine)
3. Créer une première tâche hebdomadaire:
   - Jour: Lundi
   - Horaire: 10h00 - 11h00
   - Label: "Tâche 1"
   - Couleur: Bleu pastel
   - Icône: Briefcase (💼)
4. Créer une deuxième tâche hebdomadaire:
   - Jour: Lundi
   - Horaire: 10h00 - 11h00 (MÊME créneau)
   - Label: "Tâche 2"
   - Couleur: Vert pastel
   - Icône: Email (📧)
5. Créer une troisième tâche hebdomadaire:
   - Jour: Lundi
   - Horaire: 10h00 - 11h00 (MÊME créneau)
   - Label: "Tâche 3"
   - Couleur: Rose pastel
   - Icône: Calendar (📅)

**Résultat attendu:**
- ✅ Un seul bloc task apparaît sur Lundi 10h-11h
- ✅ Le bloc contient 3 icônes/badges visibles (💼 📧 📅)
- ✅ Les 3 icônes sont côte à côte avec un petit gap
- ✅ Pas de superposition visuelle

**Résultat actuel:** _À remplir après test_

---

### ✅ Test 2: Déduplication après reload
**Objectif:** Vérifier qu'aucune icône n'est dupliquée après rechargement

**Étapes:**
1. Avec les 3 tâches du Test 1 toujours présentes
2. Noter le nombre exact d'icônes visibles (devrait être 3)
3. Recharger la page (F5 ou Ctrl+R)
4. Attendre le chargement complet (2-3 secondes)
5. Vérifier à nouveau le nombre d'icônes

**Résultat attendu:**
- ✅ Toujours exactement 3 icônes après reload
- ✅ Pas de clignotement ou flash pendant le chargement
- ✅ Ordre des icônes reste stable (💼 📧 📅 dans le même ordre)

**Résultat actuel:** _À remplir après test_

---

### ✅ Test 3: Priorité event sur task (Critère A)
**Objectif:** Task + Event → une seule carte (l'event) avec icône task en badge

**Étapes:**
1. Créer une tâche hebdomadaire:
   - Jour: Mardi
   - Horaire: 14h00 - 15h00
   - Label: "Tâche réunion"
   - Icône: Meeting (🤝)
2. Créer un événement client sur le même créneau:
   - Jour: Mardi
   - Horaire: 14h00 - 15h00
   - Client: "Client ABC"
   - Statut: Payé (vert)
3. Observer le planning

**Résultat attendu:**
- ✅ Un seul bloc visible : l'événement client (vert)
- ✅ PAS de bloc task séparé
- ✅ L'icône de la tâche (🤝) apparaît dans l'événement comme un petit badge
- ✅ Le badge est en deuxième ligne ou dans un coin de l'événement
- ✅ Cliquer sur le badge ouvre la tâche (pas l'événement)

**Résultat actuel:** _À remplir après test_

---

### ✅ Test 4: Multiple tasks + event
**Objectif:** Plusieurs tasks + 1 event → une seule carte event avec plusieurs badges

**Étapes:**
1. Créer 2 tâches hebdomadaires:
   - Tâche A: Mercredi 10h-11h, icône 💼
   - Tâche B: Mercredi 10h-11h, icône ☕
2. Créer un événement client:
   - Jour: Mercredi
   - Horaire: 10h00 - 11h00
   - Client: "Client XYZ"
   - Statut: En attente (orange)

**Résultat attendu:**
- ✅ Un seul bloc visible : l'événement client (orange)
- ✅ 2 badges d'icônes de tâches dans l'événement (💼 ☕)
- ✅ Pas de bloc task séparé

**Résultat actuel:** _À remplir après test_

---

### ✅ Test 5: Mobile responsive et wrap
**Objectif:** Les icônes se wrappent proprement sur petit écran

**Étapes:**
1. Créer 5 tâches hebdomadaires sur le même créneau:
   - Jeudi 15h-16h avec 5 icônes différentes
2. Ouvrir les DevTools du navigateur (F12)
3. Activer le mode "Device Toolbar" (Ctrl+Shift+M)
4. Sélectionner "iPhone 12 Pro" ou "Pixel 5"
5. Observer l'affichage des tâches

**Résultat attendu:**
- ✅ Les 5 icônes se wrappent sur plusieurs lignes si nécessaire
- ✅ Pas de débordement horizontal (overflow)
- ✅ Gap réduit entre les icônes (meilleure utilisation de l'espace)
- ✅ Aria-labels présents (vérifier avec un lecteur d'écran)

**Résultat actuel:** _À remplir après test_

---

### ✅ Test 6: Aucun overlay CSS (z-index)
**Objectif:** Garantir que les events restent toujours au-dessus des tasks

**Étapes:**
1. Créer une tâche: Vendredi 11h-12h
2. Créer un événement: Vendredi 12h-13h (créneau adjacent)
3. Observer l'affichage
4. Hover avec la souris sur chaque bloc
5. Vérifier visuellement qu'il n'y a pas de superposition

**Résultat attendu:**
- ✅ Les blocs sont côte à côte sans chevauchement
- ✅ Au hover, l'événement reste toujours au-dessus visuellement
- ✅ Au hover, la tâche ne passe pas au-dessus de l'événement
- ✅ Pas d'ombre ou d'effet visuel qui crée une superposition

**Résultat actuel:** _À remplir après test_

---

### ✅ Test 7: Ordre stable des icônes
**Objectif:** L'ordre des icônes ne change pas après manipulations

**Étapes:**
1. Créer 3 tâches dans cet ordre:
   - Tâche A (icône 📋)
   - Tâche B (icône ✅)
   - Tâche C (icône 🎯)
2. Noter l'ordre d'affichage
3. Modifier une tâche (changer la couleur)
4. Recharger la page
5. Vérifier l'ordre à nouveau

**Résultat attendu:**
- ✅ L'ordre reste stable : toujours 📋 ✅ 🎯
- ✅ Même ordre après modification d'une tâche
- ✅ Même ordre après rechargement

**Résultat actuel:** _À remplir après test_

---

### ✅ Test 8: Accessibilité (aria-labels)
**Objectif:** Vérifier que les lecteurs d'écran peuvent lire les informations

**Étapes:**
1. Créer une tâche: Samedi 10h-11h, label "Réunion", prix 50€
2. Ouvrir les DevTools → Onglet "Elements"
3. Inspecter le badge de la tâche
4. Vérifier l'attribut `aria-label`

**Résultat attendu:**
- ✅ aria-label présent sur le badge
- ✅ Format: "Tâche Réunion, 10:00 à 11:00, 50€"
- ✅ Attribut `title` aussi présent avec les mêmes infos

**Résultat actuel:** _À remplir après test_

---

### ✅ Test 9: Performance (pas de clignotement)
**Objectif:** Vérifier que le rendu est fluide

**Étapes:**
1. Créer 10 tâches hebdomadaires réparties sur la semaine
2. Recharger la page 5 fois de suite rapidement
3. Observer le processus de chargement

**Résultat attendu:**
- ✅ Pas de clignotement des icônes
- ✅ Les icônes apparaissent en une seule fois (pas par vagues)
- ✅ Temps de chargement raisonnable (< 2 secondes)

**Résultat actuel:** _À remplir après test_

---

### ✅ Test 10: Suppression et mise à jour
**Objectif:** Les modifications se reflètent correctement

**Étapes:**
1. Créer 3 tâches sur le même créneau (Dimanche 14h-15h)
2. Supprimer une tâche
3. Vérifier que seulement 2 icônes restent
4. Modifier une tâche (changer l'icône)
5. Vérifier que l'icône est mise à jour

**Résultat attendu:**
- ✅ Après suppression : 2 icônes (pas 3)
- ✅ Après modification : nouvelle icône visible immédiatement
- ✅ Pas de doublons temporaires pendant la mise à jour

**Résultat actuel:** _À remplir après test_

---

## Checklist finale des critères d'acceptation

| Critère | Description | Statut |
|---------|-------------|--------|
| **A** | Task + Event → une seule carte (l'event) avec icône task en badge | ⬜ À tester |
| **B** | 2+ tasks sans event → une seule carte avec plusieurs icônes | ⬜ À tester |
| **C** | Reload → pas de duplication, pas de clignotement | ⬜ À tester |
| **D** | Mobile → icônes wrap propre et aria-labels présents | ⬜ À tester |

---

## Notes de test

**Environnement:**
- Navigateur: _______
- Résolution: _______
- Date du test: _______

**Bugs trouvés:** _À documenter ici_

**Améliorations suggérées:** _À documenter ici_

---

**Status global:** ⬜ En attente de tests
