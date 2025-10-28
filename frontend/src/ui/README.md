# Fleemy Design System v1

## 📐 Architecture

Le design system Fleemy v1 fournit une base visuelle cohérente pour toute l'application avec des tokens, composants et icônes réutilisables.

## 🎨 Design Tokens (`designTokens.ts`)

### Surface
```typescript
import { surface, radius } from '@/ui/designTokens';

// Base commune pour toutes les cartes
surface.card // fond sombre translucide + bordure claire
radius.card  // rounded-xl
```

### Typography
```typescript
import { text } from '@/ui/designTokens';

text.primary   // Texte principal (slate-100)
text.secondary // Texte secondaire (slate-300)
text.tertiary  // Texte tertiaire (slate-400)
text.muted     // Texte atténué (slate-500)
```

### Accent Variants
Les variants ajoutent une légère teinte de couleur au header sans transformer toute la carte:

- `default` - Gris neutre
- `money` - Vert émeraude (revenus, paiements)
- `warning` - Rouge (alertes, erreurs)
- `note` - Ambre (notes, rappels)
- `planning` - Bleu (planification, calendrier)
- `success` - Vert (confirmation, succès)

### Status & Priority Chips
```typescript
import { statusChips, priorityChips } from '@/ui/designTokens';

// Statuts: todo, doing, done
statusChips.todo   // Gris
statusChips.doing  // Ambre
statusChips.done   // Vert

// Priorités: high, medium, low
priorityChips.high   // Rouge (1)
priorityChips.medium // Jaune (2)
priorityChips.low    // Gris (3)
```

## 🧱 Composants

### CardSection
Carte harmonisée avec header accentué.

```tsx
import { CardSection } from '@/ui';
import { Clock } from '@/ui/icons';

<CardSection
  variant="note"
  icon={<Clock className="h-5 w-5" />}
  title="À ne pas oublier"
  subtitle="3 notes aujourd'hui"
>
  {/* Contenu de la carte */}
</CardSection>
```

**Props:**
- `icon?: ReactNode` - Icône dans le header
- `title: string` - Titre principal
- `subtitle?: string` - Sous-titre optionnel
- `variant?: CardVariant` - Variant d'accent (default, money, warning, note, planning, success)
- `children: ReactNode` - Contenu de la carte
- `className?: string` - Classes additionnelles
- `headerAction?: ReactNode` - Action dans le header (bouton, badge, etc.)

### SectionHeaderRow
Header de section horizontal avec icône et actions.

```tsx
import { SectionHeaderRow } from '@/ui';
import { Calendar } from '@/ui/icons';

<SectionHeaderRow
  icon={<Calendar className="h-5 w-5" />}
  title="Mardi 28 janvier"
  actionsRight={<button>+ Événement</button>}
/>
```

**Props:**
- `icon?: ReactNode` - Icône à gauche
- `title: string` - Titre
- `actionsRight?: ReactNode` - Actions à droite
- `className?: string` - Classes additionnelles

### StatusChip
Capsule de statut avec couleurs cohérentes.

```tsx
import { StatusChip } from '@/ui';
import { CheckCircle } from '@/ui/icons';

<StatusChip
  statusKey="done"
  label="Terminé"
  srLabel="Tâche terminée"
  icon={<CheckCircle className="h-3 w-3" />}
/>
```

**Props:**
- `statusKey: 'todo' | 'doing' | 'done'` - Clé du statut
- `label: string` - Label visible
- `srLabel: string` - Label pour lecteurs d'écran
- `icon?: ReactNode` - Icône optionnelle
- `className?: string` - Classes additionnelles

### PriorityNumberBadge
Badge de priorité avec chiffre (1, 2, 3).

```tsx
import { PriorityNumberBadge } from '@/ui';

<PriorityNumberBadge priority="high" show={true} />
```

**Props:**
- `priority: 'high' | 'medium' | 'low'` - Niveau de priorité
- `show?: boolean` - Afficher ou masquer (default: true)
- `className?: string` - Classes additionnelles

## 🎯 Icônes SVG

~70 icônes Lucide organisées par catégorie.

```tsx
import { Clock, Plus, Trash2, CheckCircle } from '@/ui/icons';

<Clock className="h-5 w-5" />
<Plus className="h-4 w-4" />
<Trash2 className="h-4 w-4" />
```

**Catégories disponibles:**
- **WorkIcons** - Briefcase, Monitor, Code, FileText, etc.
- **MaintenanceIcons** - Leaf, Droplets, Sun, Hammer, etc.
- **CommunicationIcons** - Mail, Phone, MessageSquare, Bell, etc.
- **DailyLifeIcons** - Coffee, Utensils, ShoppingBag, etc.
- **WellbeingIcons** - Pause, Heart, Book, Music, etc.
- **StatusIcons** - CheckCircle, Loader, XCircle, etc.
- **ActionIcons** - Plus, Edit, Trash, Save, etc.
- **NavigationIcons** - ChevronLeft, ArrowRight, etc.

### Tailles recommandées
- `h-3 w-3` - Extra small (12px)
- `h-4 w-4` - Small (16px)
- `h-5 w-5` - Medium (20px) - **Recommandé pour headers**
- `h-6 w-6` - Large (24px)
- `h-8 w-8` - Extra large (32px)

## 🎨 Exemple complet

```tsx
import { CardSection, StatusChip, PriorityNumberBadge } from '@/ui';
import { Clock, Plus, Trash2 } from '@/ui/icons';

function MyComponent() {
  return (
    <CardSection
      variant="note"
      icon={<Clock className="h-5 w-5" />}
      title="Mes tâches"
      subtitle="3 tâches en cours"
      headerAction={
        <button className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Ajouter
        </button>
      }
    >
      <div className="space-y-2">
        {tasks.map(task => (
          <div key={task.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/40">
            <StatusChip
              statusKey={task.status}
              label={task.statusLabel}
              srLabel={`Tâche ${task.statusLabel}`}
            />
            <span className="flex-1">{task.title}</span>
            <PriorityNumberBadge priority={task.priority} />
            <button>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </CardSection>
  );
}
```

## ♿ Accessibilité

- **Contrastes AA validés** sur tous les tokens de couleur
- **aria-labels** sur tous les composants interactifs
- **data-testid** pour les tests automatisés
- **Screen reader friendly** avec srLabel sur StatusChip

## 📦 Import simplifié

```tsx
// Import tout depuis @/ui
import { 
  CardSection, 
  StatusChip, 
  PriorityNumberBadge,
  Clock,
  Plus,
  Trash2,
  statusChips,
  text
} from '@/ui';
```

## 🚀 Prochaines étapes

Ce design system est actuellement appliqué sur:
- ✅ Module "À ne pas oublier" (DailyTodoPanel)

Prochains modules à harmoniser:
- Dashboard (cartes "Cette semaine", "Paiements", "Prochains créneaux")
- Planning (jours, événements, tâches)
- Devis & Factures
- Clients

---

**Fleemy Design System v1** - Cohérence visuelle pour une expérience professionnelle 🎨
