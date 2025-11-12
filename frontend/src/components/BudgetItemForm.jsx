import React, { useState, useEffect } from 'react';
import IconPicker from './IconPicker';
import CategoryPicker from './CategoryPicker';

const BudgetItemForm = ({ item = null, onSubmit, onCancel, customCategories = [], onAddCategory, readOnly = false }) => {
  const [formData, setFormData] = useState({
    label: '',
    amount: '',
    type: 'expense',
    categoryId: '',
    categoryName: '',
    iconId: 'briefcase',
    color: '#B8EBD0',
    recurrence: 'none',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    notes: ''
  });

  const [errors, setErrors] = useState({});
  const [showIconPicker, setShowIconPicker] = useState(false);

  useEffect(() => {
    if (item) {
      setFormData({
        label: item.label || '',
        amount: item.amount?.toString() || '',
        type: item.type || 'expense',
        categoryId: item.categoryId || '',
        categoryName: item.categoryName || '',
        iconId: item.iconId || 'briefcase',
        color: item.color || '#B8EBD0',
        recurrence: item.recurrence || 'none',
        startDate: item.startDate || new Date().toISOString().split('T')[0],
        endDate: item.endDate || '',
        notes: item.notes || ''
      });
    }
  }, [item]);

  const validate = () => {
    const newErrors = {};

    if (!formData.label.trim()) {
      newErrors.label = 'Le libellé est requis';
    }

    const amount = parseFloat(formData.amount);
    if (!formData.amount || isNaN(amount) || amount <= 0) {
      newErrors.amount = 'Le montant doit être supérieur à 0';
    }

    if (!formData.categoryId) {
      newErrors.categoryId = 'Une catégorie est requise';
    }

    if (formData.recurrence !== 'none' && !formData.startDate) {
      newErrors.startDate = 'La date de début est requise pour les récurrences';
    }

    if (formData.endDate && formData.startDate && formData.endDate < formData.startDate) {
      newErrors.endDate = 'La date de fin doit être après la date de début';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    const submitData = {
      label: formData.label.trim(),
      amount: parseFloat(formData.amount),
      type: formData.type,
      categoryId: formData.categoryId,
      iconId: formData.iconId,
      color: formData.color,
      recurrence: formData.recurrence,
      startDate: formData.startDate,
      endDate: formData.endDate || null,
      notes: formData.notes.trim() || null
    };

    onSubmit(submitData);
  };

  const handleCategorySelect = (categoryId, categoryName, iconId, color) => {
    setFormData(prev => ({
      ...prev,
      categoryId,
      categoryName,
      iconId,
      color
    }));
    setErrors(prev => ({ ...prev, categoryId: null }));
  };

  if (readOnly) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          ⚠️ Lecture seule - Vous consultez le budget d'un autre membre
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
          Type
        </label>
        <div className="flex gap-2">
          {[
            { value: 'income', label: 'Revenu', icon: '💰' },
            { value: 'expense', label: 'Dépense', icon: '💸' },
            { value: 'saving', label: 'Épargne', icon: '🐷' }
          ].map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, type: value }))}
              className={`flex-1 rounded-lg border p-3 text-center transition ${
                formData.type === value
                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500 dark:bg-blue-900/20 dark:text-blue-300'
                  : 'border-gray-300 bg-white hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700'
              }`}
              data-testid={`type-${value}`}
            >
              <div className="text-2xl mb-1">{icon}</div>
              <div className="text-sm font-medium">{label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Label */}
      <div>
        <label htmlFor="label" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Libellé *
        </label>
        <input
          id="label"
          type="text"
          value={formData.label}
          onChange={(e) => {
            setFormData(prev => ({ ...prev, label: e.target.value }));
            setErrors(prev => ({ ...prev, label: null }));
          }}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            errors.label
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
          }`}
          placeholder="Ex: Loyer, Salaire, Courses..."
          data-testid="label-input"
          aria-invalid={!!errors.label}
          aria-describedby={errors.label ? 'label-error' : undefined}
        />
        {errors.label && (
          <p id="label-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errors.label}
          </p>
        )}
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Montant (€) *
        </label>
        <input
          id="amount"
          type="number"
          step="0.01"
          min="0"
          value={formData.amount}
          onChange={(e) => {
            setFormData(prev => ({ ...prev, amount: e.target.value }));
            setErrors(prev => ({ ...prev, amount: null }));
          }}
          className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
            errors.amount
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
          }`}
          placeholder="0.00"
          data-testid="amount-input"
          aria-invalid={!!errors.amount}
          aria-describedby={errors.amount ? 'amount-error' : undefined}
        />
        {errors.amount && (
          <p id="amount-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {errors.amount}
          </p>
        )}
      </div>

      {/* Category Picker */}
      <div>
        <CategoryPicker
          selectedCategory={formData.categoryId}
          onSelect={handleCategorySelect}
          type={formData.type}
          customCategories={customCategories}
          onAddCategory={onAddCategory}
        />
        {errors.categoryId && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.categoryId}</p>
        )}
      </div>

      {/* Icon Picker Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowIconPicker(!showIconPicker)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          data-testid="toggle-icon-picker"
        >
          <span>Personnaliser l'icône</span>
          <span className="text-xl">{showIconPicker ? '▲' : '▼'}</span>
        </button>
        {showIconPicker && (
          <div className="mt-3">
            <IconPicker
              selectedIcon={formData.iconId}
              onSelect={(iconId) => setFormData(prev => ({ ...prev, iconId }))}
              color={formData.color}
            />
          </div>
        )}
      </div>

      {/* Recurrence */}
      <div>
        <label htmlFor="recurrence" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Récurrence
        </label>
        <select
          id="recurrence"
          value={formData.recurrence}
          onChange={(e) => setFormData(prev => ({ ...prev, recurrence: e.target.value }))}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          data-testid="recurrence-select"
        >
          <option value="none">Aucune (unique)</option>
          <option value="weekly">Hebdomadaire</option>
          <option value="monthly">Mensuelle</option>
        </select>
      </div>

      {/* Date fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Date de début *
          </label>
          <input
            id="startDate"
            type="date"
            value={formData.startDate}
            onChange={(e) => {
              setFormData(prev => ({ ...prev, startDate: e.target.value }));
              setErrors(prev => ({ ...prev, startDate: null }));
            }}
            className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
              errors.startDate
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
            }`}
            data-testid="start-date-input"
            aria-invalid={!!errors.startDate}
            aria-describedby={errors.startDate ? 'start-date-error' : undefined}
          />
          {errors.startDate && (
            <p id="start-date-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {errors.startDate}
            </p>
          )}
        </div>

        {formData.recurrence !== 'none' && (
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Date de fin (optionnelle)
            </label>
            <input
              id="endDate"
              type="date"
              value={formData.endDate}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, endDate: e.target.value }));
                setErrors(prev => ({ ...prev, endDate: null }));
              }}
              className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.endDate
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
              }`}
              data-testid="end-date-input"
              aria-invalid={!!errors.endDate}
              aria-describedby={errors.endDate ? 'end-date-error' : undefined}
            />
            {errors.endDate && (
              <p id="end-date-error" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {errors.endDate}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
          Notes (optionnelles)
        </label>
        <textarea
          id="notes"
          rows="3"
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          placeholder="Ajouter des détails supplémentaires..."
          data-testid="notes-input"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
          data-testid="submit-button"
        >
          {item ? 'Mettre à jour' : 'Créer'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          data-testid="cancel-button"
        >
          Annuler
        </button>
      </div>
    </form>
  );
};

export default BudgetItemForm;
