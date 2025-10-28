# Harmonisation Design Fleemy v1 - Phase Pilote

## ✅ Travaux réalisés

### 🎨 Phase 1 - Design System (`/app/frontend/src/ui/`)

#### 1. `designTokens.ts` - Tokens centralisés
- **Surface**: Fond sombre translucide (`bg-slate-900/40`) + bordure claire (`border-slate-200/20`)
- **Radius**: Arrondis cohérents (`rounded-xl` pour cartes)
- **Typography**: 4 niveaux de texte (primary, secondary, tertiary, muted)
- **Accent Variants**: 6 variants (default, money, warning, note, planning, success)
  - Les variants changent uniquement l'accent (icône, header, texte secondaire)
  - Base de la carte reste identique (fond sombre + bordure)
- **Status Chips**: 3 statuts (todo=gris, doing=ambre, done=vert)
- **Priority Chips**: 3 priorités (high=rouge/1, medium=jaune/2, low=gris/3)
- **Icon Tokens**: Tailles et couleurs par défaut

#### 2. `CardSection.tsx` - Composant carte harmonisé
- Applique surface commune à toutes les cartes
- Header avec icône + titre + sous-titre optionnel
- Support des variants pour teinte légère
- Props: `icon`, `title`, `subtitle`, `variant`, `children`, `headerAction`
- Design: Fond sombre translucide cohérent, seul l'accent change

#### 3. `SectionHeaderRow.tsx` - Headers de section
- Ligne horizontale icône + titre + actions
- Typographie et marges normalisées
- Réutilisable pour tous les headers de section

#### 4. `StatusChip.tsx` - Capsules de statut
- Utilise tokens du design system
- 3 états: À faire (gris), En cours (ambre), Terminé (vert)
- Support icône optionnelle

#### 5. `PriorityNumberBadge.tsx` - Badges de priorité
- Cercle avec chiffre (1/2/3)
- Utilise tokens du design system
- Rouge=1, Jaune=2, Gris=3

### 🔷 Phase 2 - Système d'icônes SVG (`/app/frontend/src/ui/icons/`)

#### `icons/index.ts` - Export centralisé (~70 icônes Lucide)
**Catégories:**
- **WorkIcons**: Briefcase, Monitor, Code, FileText, Presentation, Users, Phone, Mail, Calendar, Clock, Pencil, Search, TrendingUp, Folder, Eye, Wrench, Settings
- **MaintenanceIcons**: Leaf, Droplets, Sun, Hammer, Home, Building, Zap
- **CommunicationIcons**: MessageSquare, Send, Bell, BellOff, Mail, Phone
- **DailyLifeIcons**: Coffee, Utensils, ShoppingBag, ShoppingCart, Package, Truck, CreditCard, DollarSign
- **WellbeingIcons**: Pause, Play, Heart, Smile, Book, Music, Moon
- **StatusIcons**: CheckCircle, CheckCircle2, Circle, Loader, XCircle, AlertCircle, Info, HelpCircle
- **ActionIcons**: Plus, Minus, X, Check, Edit, Edit3, Trash, Trash2, Save, Download, Upload
- **NavigationIcons**: ChevronLeft/Right/Up/Down, ArrowLeft/Right, MoreVertical/Horizontal
- **MiscIcons**: Star, Flag, Target, Award, Gift, Key, Lock, Unlock

#### `icons/custom/` - Dossier pour icônes spécifiques Fleemy
Prêt pour icônes personnalisées futures (tonte, haie, etc.)

### 🎯 Phase 3 - Application pilote sur DailyTodoPanel

#### Modifications dans `/app/frontend/src/components/DailyTodoPanel.tsx`:

**Avant:**
```tsx
// Emojis partout: 🔥 🙂 💤 👍
// Styles custom non harmonisés
// bg-gradient-to-br from-amber-50 to-yellow-50/50
```

**Après:**
```tsx
import { CardSection, StatusChip } from '../ui';
import PriorityNumberBadge from '../ui/PriorityNumberBadge';

// Utilise CardSection avec variant="note"
<CardSection
  variant="note"
  icon={<Clock className="h-5 w-5" />}
  title="À ne pas oublier"
  subtitle={effectiveReadOnly ? 'Lecture seule' : undefined}
>
```

**Changements spécifiques:**
1. ✅ **CardSection** remplace le div custom avec gradient
2. ✅ **Icônes SVG** Lucide au lieu d'emojis:
   - Clock pour le header (au lieu de ⏰)
   - Plus pour ajout (cohérent)
   - Trash2 pour suppression (cohérent)
   - Clock dans les badges de temps
3. ✅ **StatusChip** pour les statuts (utilise les tokens)
4. ✅ **Select priorité** sans emojis (🔥🙂💤 supprimés)
5. ✅ **Fond sombre translucide** cohérent (`bg-slate-900/40`, `bg-slate-800/40`)
6. ✅ **Bordures claires** cohérentes (`border-slate-600/50`, `border-slate-700/30`)
7. ✅ **Textes cohérents** (`text-slate-100`, `text-slate-300`, `text-slate-400`)
8. ✅ **Message vide** sans emoji ("Rien à noter pour le moment" au lieu de "👍")

#### Import du nouveau PriorityNumberBadge
```tsx
import PriorityNumberBadge from '../ui/PriorityNumberBadge';
```

## 📊 Bilan

### Fichiers créés (8)
1. `/app/frontend/src/ui/designTokens.ts` - Tokens de design
2. `/app/frontend/src/ui/CardSection.tsx` - Composant carte
3. `/app/frontend/src/ui/SectionHeaderRow.tsx` - Headers de section
4. `/app/frontend/src/ui/StatusChip.tsx` - Capsules de statut
5. `/app/frontend/src/ui/PriorityNumberBadge.tsx` - Badges priorité
6. `/app/frontend/src/ui/icons/index.ts` - Système d'icônes
7. `/app/frontend/src/ui/index.ts` - Export centralisé
8. `/app/frontend/src/ui/README.md` - Documentation

### Fichiers modifiés (1)
1. `/app/frontend/src/components/DailyTodoPanel.tsx` - Application du nouveau design

### Dossiers créés (2)
1. `/app/frontend/src/ui/` - Design system
2. `/app/frontend/src/ui/icons/custom/` - Icônes custom

## 🎯 Résultats

### ✅ Objectifs atteints
- Design harmonisé et professionnel sur module pilote
- Plus d'emojis, uniquement des icônes SVG cohérentes
- Base visuelle commune (fond sombre + bordure claire + rounded-xl)
- Variants qui changent uniquement l'accent, pas toute la carte
- Accessibilité préservée (AA, aria-labels, data-testid)
- Logique métier 100% intacte
- Hot reload fonctionne, compilation réussie

### 🎨 Design cohérent
- Fond: `bg-slate-900/40` translucide
- Bordure: `border-slate-200/20` claire
- Arrondi: `rounded-xl`
- Variants ajoutent teinte légère au header uniquement

### 🔄 Prochaines étapes recommandées

**Dashboard:**
- Widget "Cette semaine" → CardSection variant="planning"
- Widget "Paiements" → CardSection variant="money"
- Widget "Prochains créneaux" → CardSection variant="planning"

**Planning:**
- Headers jours → SectionHeaderRow
- Cartes événements → CardSection variant="default"
- Cartes tâches → StatusChip + PriorityNumberBadge

**Devis & Factures:**
- Listes → CardSection variant="money"
- Statuts paiement → StatusChip adapté

**Général:**
- Remplacer tous les emojis restants par icônes Lucide
- Étendre StatusChip pour d'autres statuts (payé, en attente, etc.)

## ♿ Accessibilité

### Validations AA
- ✅ Contrastes respectés sur tous les tokens
- ✅ aria-labels sur composants interactifs
- ✅ data-testid pour tests automatisés
- ✅ Screen reader friendly

### Composants accessibles
- CardSection: `data-testid` support
- StatusChip: `aria-label`, `srLabel`
- PriorityNumberBadge: `aria-label`, `title`
- SectionHeaderRow: `data-testid` support

## 📦 Structure finale

```
/app/frontend/src/ui/
├── designTokens.ts          # Tokens centralisés
├── CardSection.tsx          # Carte harmonisée
├── SectionHeaderRow.tsx     # Headers de section
├── StatusChip.tsx           # Capsules de statut
├── PriorityNumberBadge.tsx  # Badges de priorité
├── index.ts                 # Export global
├── README.md                # Documentation
└── icons/
    ├── index.ts             # 70+ icônes Lucide
    └── custom/
        └── index.ts         # Icônes Fleemy custom

/app/frontend/src/components/
└── DailyTodoPanel.tsx       # ✅ Applique le nouveau design
```

## 🚀 Utilisation

### Import simple
```tsx
import { CardSection, StatusChip, Clock, Plus } from '@/ui';
```

### Exemple
```tsx
<CardSection
  variant="note"
  icon={<Clock className="h-5 w-5" />}
  title="Ma section"
>
  <StatusChip statusKey="doing" label="En cours" srLabel="Tâche en cours" />
</CardSection>
```

---

**Fleemy Design System v1** - Base solide pour une harmonisation complète ✨
