# Guide des icônes de tâches

Ce guide récapitule les catégories d'emojis disponibles pour les tâches et explique comment sélectionner ou modifier la catégorie associée à une icône.

## Aperçu des catégories

| Catégorie | Description | Exemples d'icônes |
| --- | --- | --- |
| Travail de bureau & gestion | Organisation, suivi administratif, réunions et coordination. | 💼 🏢 💻 📊 📅 |
| Services, formation & relation client | Accompagnement, formation, santé, finance ou commerce. | 🆘 🎓 ⚕️ 💳 📦 |
| Travaux manuels, jardin & chantier | Activités terrain, artisanat lourd, logistique extérieure. | 🛠️ 🏗️ 🌳 🚜 🧹 |
| Artisanat & atelier | Activités d'atelier, confection et création manuelle. | 🧵 🪡 ⚒️ 🧰 💍 |
| Restauration & pauses gourmandes | Repas, cafés, courses alimentaires et préparation culinaire. | ☕ 🍳 🍽️ 🍲 🥐 |
| Bien-être & pauses actives | Récupération, sport léger et moments de détente. | ⏸️ 🚶‍♂️ 💪 🧘‍♂️ 😴 |
| Polyvalent & suivi | Marqueurs génériques pour signaler un statut ou une priorité. | ⭐ ✅ 🚩 🎯 🚀 |

## Où modifier les icônes

Les icônes sont définies dans [`frontend/src/constants/icons.js`](frontend/src/constants/icons.js). Chaque catégorie possède :

- `key` : identifiant technique utilisé dans le code.
- `label` : libellé visible dans les interfaces et la documentation.
- `icons` : objet "clé ➜ emoji" listant les icônes disponibles.

### Ajouter ou déplacer une icône

1. Repérez la catégorie souhaitée dans `TASK_ICON_CATEGORIES`.
2. Ajoutez une nouvelle entrée dans la propriété `icons` (par exemple `"new_task": "🆕"`).
3. Si vous déplacez une icône vers une autre catégorie, supprimez-la de l'ancienne catégorie et ajoutez-la à la nouvelle.
4. Vérifiez que la clé est unique dans l'ensemble du fichier et qu'elle reflète l'usage (ex. `"gardening"`, `"coffee"`).
5. Sauvegardez : le tableau `TASK_ICON_KEYS` et la fonction `getTaskIcon` utilisent automatiquement cette nouvelle configuration.

### Trouver la catégorie associée à une icône

Le fichier expose également la constante `TASK_ICON_CATEGORY_MAP` qui relie chaque clé d'icône à sa catégorie (`category.key`). Cela permet de :

- Afficher les icônes groupées par catégorie dans un composant.
- Filtrer la liste lorsqu'on souhaite ne montrer que les icônes de repas, de travaux manuels, etc.

### Bonnes pratiques

- Gardez les catégories équilibrées (6 à 10 icônes chacune) pour éviter les listes trop longues.
- Préférez des emojis clairs et facilement reconnaissables pour les utilisateurs.
- Documentez les ajouts importants directement dans ce fichier pour aider l'équipe à faire un choix rapide.

Pour toute modification plus importante (nouvelle catégorie, refonte visuelle), pensez à synchroniser les composants `TaskForm` et `WeeklyTaskForm` si vous souhaitez afficher les icônes triées par catégorie dans l'interface.
