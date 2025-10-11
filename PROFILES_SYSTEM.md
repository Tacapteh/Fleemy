# Système de Profils d'Équipe - Documentation

## Vue d'ensemble

Ce système implémente un sélecteur de profils à la Netflix permettant aux utilisateurs de choisir entre un contexte **Solo** (planning personnel) et des contextes **Équipe** (planning collaboratif).

## Architecture

### Backend (FastAPI + Firestore)

#### Nouveaux Endpoints

**1. POST /api/teams**
- Crée une nouvelle équipe
- Génère automatiquement un code d'invitation unique (8 caractères alphanumériques uppercase)
- L'utilisateur créateur devient le owner et est ajouté aux members
- Body: `{ "name": "Nom de l'équipe" }`
- Response: `{ "success": true, "team_id": "...", "name": "...", "invite_code": "ABC12345" }`

**2. POST /api/teams/join**
- Permet de rejoindre une équipe via un code d'invitation
- Vérifie l'expiration du code si configurée
- Ajoute l'utilisateur aux members (opération idempotente)
- Body: `{ "code": "ABC12345" }`
- Response: `{ "success": true, "team_id": "...", "name": "..." }`

**3. GET /api/teams/my**
- Retourne toutes les équipes dont l'utilisateur est membre
- Response: `{ "success": true, "teams": [{ "team_id": "...", "name": "...", "owner_uid": "...", "members_count": 3 }] }`

**4. POST /api/teams/{team_id}/rotate-code**
- Régénère le code d'invitation (owner uniquement)
- Response: `{ "success": true, "invite_code": "NEW12345" }`

**5. PUT /api/auth/context**
- Sauvegarde le dernier contexte de l'utilisateur dans Firestore
- Body: `{ "type": "solo" }` ou `{ "type": "team", "team_id": "..." }`
- Response: `{ "success": true, "context": {...} }`

#### Structure Firestore

**Collection `teams/{teamId}`**
```javascript
{
  name: string,              // 2-48 caractères
  owner_uid: string,         // UID du créateur
  members: array<string>,    // Liste des UIDs membres
  invite_code: string,       // Code unique 8 caractères
  invite_expires_at: timestamp | null,  // Expiration optionnelle
  created_at: serverTimestamp,
  updated_at: serverTimestamp
}
```

**Document `users/{uid}`**
```javascript
{
  uid: string,
  name: string,
  email: string,
  last_context: {           // Dernier contexte utilisé
    type: "solo" | "team",
    team_id?: string
  }
}
```

### Frontend (React)

#### Nouvelles Pages et Composants

**1. ProfilePickerPage** (`/profiles`)
- Design moderne style Netflix avec fond dégradé
- Grille de tuiles responsive (2-4 colonnes selon l'écran)
- Tuiles :
  - **Moi** (Solo) - gradient bleu/violet
  - **Équipes** - une tuile par équipe avec gradient émeraude/teal
  - **Créer une équipe** - bordure transparente
  - **Rejoindre une équipe** - bordure transparente
- Tous les éléments ont des `data-testid` pour les tests
- Navigation clavier complète avec états focus visibles

**2. CreateTeamDialog**
- Dialog modal accessible (role="dialog", aria-labelledby, aria-modal)
- Validation : nom entre 2 et 48 caractères
- Compteur de caractères
- Gestion des erreurs avec aria-live
- Gradient indigo/violet

**3. JoinTeamDialog**
- Dialog modal accessible
- Input avec auto-uppercase pour le code
- Validation du format du code
- Messages d'erreur clairs (code invalide, expiré, déjà membre)
- Gradient émeraude/teal

**4. contextStore** (`/stores/contextStore.js`)
- Store simple pour gérer le contexte actuel
- Persistance dans localStorage
- Méthodes :
  - `get()` - récupère le contexte
  - `set(context)` - sauvegarde le contexte
  - `clear()` - efface le contexte
  - `isSolo()` - vérifie si mode solo
  - `isTeam()` - vérifie si mode équipe
  - `getTeamId()` - récupère l'ID de l'équipe courante

**5. AuthGuard** (dans App.js)
- Composant de garde post-login
- Vérifie si un contexte valide existe
- Pour les équipes : vérifie que l'utilisateur est toujours membre
- Redirige vers `/profiles` si aucun contexte valide
- Affiche un loader pendant la vérification

#### Routes

```
/profiles                      → ProfilePickerPage (sans sidebar)
/team/:teamId/schedule         → Planning (contexte équipe, sans sidebar)
/planning                      → Planning (contexte solo, avec sidebar)
/dashboard, /quotes, etc.      → Pages avec sidebar (protégées par AuthGuard)
```

## Flux Utilisateur

### Premier login
1. Utilisateur se connecte avec Google
2. AuthGuard détecte qu'aucun contexte n'existe
3. Redirection automatique vers `/profiles`
4. Utilisateur choisit son contexte

### Sélection Solo
1. Clic sur tuile "Moi"
2. Sauvegarde dans contextStore et Firestore
3. Redirection vers `/planning`

### Création d'équipe
1. Clic sur "Créer une équipe"
2. Dialog s'ouvre
3. Saisie du nom (2-48 caractères)
4. Soumission → POST /api/teams
5. Équipe créée avec code d'invitation
6. Ajout de la tuile dans la grille
7. Sélection automatique de l'équipe
8. Redirection vers `/team/{teamId}/schedule`

### Rejoindre une équipe
1. Clic sur "Rejoindre une équipe"
2. Dialog s'ouvre
3. Saisie du code (auto-uppercase)
4. Soumission → POST /api/teams/join
5. Si valide : ajout de la tuile et sélection
6. Si invalide/expiré : message d'erreur

### Retour automatique au dernier contexte
1. Utilisateur recharge la page
2. AuthGuard lit contextStore et vérifie avec le backend
3. Si contexte valide :
   - Solo → continue normalement
   - Équipe → vérifie que l'utilisateur est encore membre
4. Si invalide → redirection vers `/profiles`

## Droits et Permissions

### Firestore Rules (à implémenter)

```javascript
// Lecture d'une équipe : si uid ∈ members
match /teams/{teamId} {
  allow read: if request.auth.uid in resource.data.members;
  allow create: if request.auth != null;
  allow update: if request.auth.uid == resource.data.owner_uid;
}

// L'ajout de membres se fait via l'API (pas de write client direct)
```

### Backend
- **Création équipe** : tout utilisateur authentifié
- **Rejoindre équipe** : tout utilisateur avec code valide
- **Rotation code** : owner uniquement
- **Lecture planning équipe** : membres uniquement
- **Modification planning équipe** : chacun modifie ses propres événements

## Accessibilité (AA)

✅ Navigation clavier complète
✅ États focus visibles (ring-4 ring-white/50)
✅ Contraste AA respecté
✅ Dialogs avec rôles ARIA appropriés
✅ Messages d'erreur avec aria-live
✅ Labels associés aux inputs
✅ Tailles de clic ≥ 88px (tuiles aspect-square min 160px)

## Tests

### Tests Manuels

1. **Création équipe**
   - Ouvrir dialog → remplir nom → soumettre
   - Vérifier que la tuile apparaît
   - Vérifier la redirection vers planning équipe

2. **Rejoindre équipe**
   - Obtenir un code d'invitation
   - Ouvrir dialog → saisir code → soumettre
   - Vérifier que la tuile apparaît
   - Tester avec code invalide/expiré

3. **Sélection contexte**
   - Cliquer sur "Moi" → vérifier redirection /planning
   - Cliquer sur équipe → vérifier redirection /team/{id}/schedule

4. **Persistance**
   - Sélectionner contexte → recharger page
   - Vérifier que le contexte est maintenu

5. **Navigation clavier**
   - Utiliser Tab pour naviguer entre les tuiles
   - Vérifier que focus est visible
   - Enter/Space pour sélectionner

### Tests Backend (à implémenter)

```python
# test_teams.py
def test_create_team():
    # POST /api/teams avec nom valide
    # Vérifier structure response
    # Vérifier code unique généré

def test_join_team_valid_code():
    # POST /api/teams/join avec code valide
    # Vérifier ajout dans members

def test_join_team_invalid_code():
    # POST /api/teams/join avec code invalide
    # Vérifier erreur 404

def test_get_my_teams():
    # GET /api/teams/my
    # Vérifier toutes les équipes de l'utilisateur

def test_rotate_code_owner():
    # POST /api/teams/{id}/rotate-code en tant qu'owner
    # Vérifier nouveau code généré

def test_rotate_code_non_owner():
    # POST /api/teams/{id}/rotate-code en tant que membre
    # Vérifier erreur 403
```

## Configuration Requise

### Backend
- Firebase Admin SDK configuré
- GOOGLE_APPLICATION_CREDENTIALS pointant vers serviceAccountKey.json
- Firestore activé sur le projet Firebase

### Frontend
Variables d'environnement dans `/app/frontend/.env` :
```bash
REACT_APP_BACKEND_URL=https://your-backend.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
REACT_APP_FIREBASE_API_KEY=your-api-key
REACT_APP_FIREBASE_APP_ID=your-app-id
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
```

## Prochaines Étapes

1. Remplacer les credentials Firebase factices par les vraies valeurs
2. Tester le flux complet avec un vrai compte Firebase
3. Implémenter les règles Firestore Security Rules
4. Ajouter la rotation automatique des codes d'invitation
5. Améliorer la page `/team/:teamId/schedule` avec sidebar adaptée
6. Ajouter la gestion des membres (voir, inviter, retirer)
7. Implémenter les tests unitaires backend
8. Implémenter les tests E2E avec Playwright

## Notes Importantes

- Les codes d'invitation sont en uppercase (8 caractères alphanumériques)
- L'opération join est idempotente (rejoindre 2x la même équipe ne cause pas d'erreur)
- Le contexte est sauvegardé à la fois en localStorage et dans Firestore
- AuthGuard valide le contexte à chaque chargement de page protégée
- Les dialogues sont accessibles et suivent les bonnes pratiques ARIA
