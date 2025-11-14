import React, { useState } from 'react';
import { getTaskIcon } from '../constants/icons';

const FLEEMY_PASTELS = [
  { id: 'mint', color: '#B8EBD0', name: 'Mint' },
  { id: 'sky', color: '#BFE6FF', name: 'Sky' },
  { id: 'peach', color: '#FFD6B8', name: 'Peach' },
  { id: 'lilac', color: '#DCCEF8', name: 'Lilac' },
  { id: 'lemon', color: '#FDF3B0', name: 'Lemon' },
  { id: 'coral', color: '#FFBFC4', name: 'Coral' },
  { id: 'sage', color: '#CFE6C8', name: 'Sage' },
  { id: 'powder', color: '#E3EEF9', name: 'Powder' }
];

const DEFAULT_CATEGORIES = [
  { id: 'salary', name: 'Salaire', iconId: 'briefcase', color: '#B8EBD0', type: 'income' },
  { id: 'freelance', name: 'Freelance', iconId: 'computer', color: '#BFE6FF', type: 'income' },
  { id: 'investment', name: 'Investissements', iconId: 'analytics', color: '#FFD6B8', type: 'income' },
  { id: 'housing', name: 'Logement', iconId: 'office', color: '#DCCEF8', type: 'expense' },
  { id: 'food', name: 'Alimentation', iconId: 'shopping', color: '#FDF3B0', type: 'expense' },
  { id: 'transport', name: 'Transport', iconId: 'delivery', color: '#FFBFC4', type: 'expense' },
  { id: 'subscriptions', name: 'Abonnements', iconId: 'documents', color: '#CFE6C8', type: 'expense' },
  { id: 'dining', name: 'Restaurants', iconId: 'lunch', color: '#E3EEF9', type: 'expense' },
  { id: 'savings', name: 'Épargne', iconId: 'target', color: '#B8EBD0', type: 'saving' }
];

const CategoryPicker = ({ selectedCategory, onSelect, type, customCategories = [], onAddCategory }) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('star');
  const [newCategoryColor, setNewCategoryColor] = useState('#B8EBD0');

  // Combine default and custom categories
  const allCategories = [
    ...DEFAULT_CATEGORIES,
    ...customCategories.map(cat => ({
      id: cat.id,
      name: cat.name,
      iconId: cat.iconId,
      color: cat.color,
      type: 'custom'
    }))
  ];

  // Filter by type if provided
  const availableCategories = type
    ? allCategories.filter(cat => cat.type === type || cat.type === 'custom')
    : allCategories;

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) return;

    const newCategory = {
      id: `custom-${Date.now()}`,
      name: newCategoryName,
      iconId: newCategoryIcon,
      color: newCategoryColor
    };

    onAddCategory(newCategory);
    onSelect(newCategory.id, newCategory.name, newCategory.iconId, newCategory.color);
    setIsCreating(false);
    setNewCategoryName('');
    setNewCategoryIcon('star');
    setNewCategoryColor('#B8EBD0');
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
        Catégorie
      </label>

      {!isCreating ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {availableCategories.map((category) => {
              const isSelected = selectedCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => onSelect(category.id, category.name, category.iconId, category.color)}
                  className={`flex items-center gap-2 rounded-lg p-3 text-left transition ${
                    isSelected
                      ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                  style={{
                    backgroundColor: isSelected ? category.color : 'transparent',
                    border: `1px solid ${category.color}`
                  }}
                  data-testid={`category-${category.id}`}
                >
                  <span className="flex h-5 w-5 items-center justify-center text-xl">
                    {getTaskIcon(category.iconId, { className: 'h-5 w-5' })}
                  </span>
                  <span className="text-sm font-medium text-gray-900 dark:text-slate-100">
                    {category.name}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="w-full rounded-md border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            data-testid="add-category-button"
          >
            + Créer une catégorie personnalisée
          </button>
        </>
      ) : (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <input
            type="text"
            placeholder="Nom de la catégorie"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            data-testid="new-category-name-input"
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-400">
              Couleur
            </label>
            <div className="flex flex-wrap gap-2">
              {FLEEMY_PASTELS.map((pastel) => (
                <button
                  key={pastel.id}
                  type="button"
                  onClick={() => setNewCategoryColor(pastel.color)}
                  className={`h-8 w-8 rounded-full transition hover:scale-110 ${
                    newCategoryColor === pastel.color
                      ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800'
                      : ''
                  }`}
                  style={{ backgroundColor: pastel.color }}
                  title={pastel.name}
                  data-testid={`color-${pastel.id}`}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-slate-400">
              Icône
            </label>
            <div className="grid grid-cols-8 gap-1">
              {['star', 'target', 'gift', 'bulb', 'rocket', 'flag', 'check', 'gear'].map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setNewCategoryIcon(icon)}
                  className={`flex h-8 w-8 items-center justify-center rounded text-lg transition hover:bg-gray-200 dark:hover:bg-slate-700 ${
                    newCategoryIcon === icon ? 'bg-gray-200 dark:bg-slate-700' : ''
                  }`}
                  data-testid={`new-cat-icon-${icon}`}
                >
                  {getTaskIcon(icon, { className: 'h-5 w-5' })}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCreateCategory}
              disabled={!newCategoryName.trim()}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="create-category-confirm"
            >
              Créer
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setNewCategoryName('');
              }}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              data-testid="create-category-cancel"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryPicker;
