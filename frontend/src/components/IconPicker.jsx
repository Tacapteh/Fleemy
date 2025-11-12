import React, { useState } from 'react';
import { TASK_ICON_CATEGORIES, getTaskIcon } from '../constants/icons';

const IconPicker = ({ selectedIcon, onSelect, color = '#CCCCCC' }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);

  const filteredCategories = TASK_ICON_CATEGORIES.map(category => {
    if (searchTerm) {
      const filtered = Object.entries(category.icons).filter(([key]) =>
        key.toLowerCase().includes(searchTerm.toLowerCase())
      );
      return { ...category, icons: Object.fromEntries(filtered) };
    }
    return category;
  }).filter(cat => Object.keys(cat.icons).length > 0);

  const displayCategories = selectedCategory
    ? filteredCategories.filter(c => c.key === selectedCategory)
    : filteredCategories;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Rechercher une icône..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          data-testid="icon-search-input"
        />
        {selectedIcon && (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md text-2xl"
            style={{ backgroundColor: color }}
            data-testid="selected-icon-preview"
          >
            {getTaskIcon(selectedIcon)}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            selectedCategory === null
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
          }`}
          data-testid="category-all"
        >
          Toutes
        </button>
        {TASK_ICON_CATEGORIES.map((category) => (
          <button
            key={category.key}
            type="button"
            onClick={() => setSelectedCategory(category.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              selectedCategory === category.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
            data-testid={`category-${category.key}`}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div
        className="max-h-64 space-y-4 overflow-y-auto rounded-md border border-gray-200 p-3 dark:border-slate-700"
        role="listbox"
        aria-label="Sélection d'icône"
      >
        {displayCategories.map((category) => (
          <div key={category.key}>
            {!selectedCategory && (
              <h4 className="mb-2 text-xs font-semibold text-gray-600 dark:text-slate-400">
                {category.label}
              </h4>
            )}
            <div className="grid grid-cols-8 gap-2">
              {Object.entries(category.icons).map(([key, emoji]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onSelect(key)}
                  className={`flex h-10 w-10 items-center justify-center rounded-md text-xl transition hover:scale-110 ${
                    selectedIcon === key
                      ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900'
                      : 'hover:bg-gray-100 dark:hover:bg-slate-700'
                  }`}
                  title={key}
                  data-testid={`icon-${key}`}
                  role="option"
                  aria-selected={selectedIcon === key}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IconPicker;
