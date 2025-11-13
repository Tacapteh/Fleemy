import React, { useState, useEffect, useMemo } from 'react';
import { useBudget } from '../hooks/useBudget';
import BudgetKpis from '../components/BudgetKpis';
import CategoryDonut from '../components/CategoryDonut';
import IncomeExpenseBar from '../components/IncomeExpenseBar';
import BudgetItemForm from '../components/BudgetItemForm';
import { getTaskIcon } from '../constants/icons';
import { ChevronLeft, ChevronRight, Plus, Edit2, Trash2, Settings as SettingsIcon } from 'lucide-react';

const BudgetPlanner = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [teamMemberId, setTeamMemberId] = useState(null);
  const [savingsTarget, setSavingsTarget] = useState('');

  // Calculate period dates
  const periodStart = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    return `${year}-${month.toString().padStart(2, '0')}-01`;
  }, [currentDate]);

  const periodEnd = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;
  }, [currentDate]);

  const { items, summary, settings, loading, error, createItem, updateItem, deleteItem, updateSettings, invalidate } = useBudget(
    periodStart,
    periodEnd,
    teamMemberId
  );

  useEffect(() => {
    if (settings?.monthlyTargets?.savingsTarget) {
      setSavingsTarget(settings.monthlyTargets.savingsTarget.toString());
    }
  }, [settings]);

  const handlePreviousMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  };

  const handleNextMonth = () => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  };

  const handleCreateItem = async (itemData) => {
    try {
      await createItem(itemData);
      setShowItemModal(false);
    } catch (err) {
      console.error('Error creating item:', err);
      alert('Erreur lors de la création: ' + err.message);
    }
  };

  const handleUpdateItem = async (itemData) => {
    try {
      if (editingItem?.id) {
        await updateItem(editingItem.id, itemData);
        setShowItemModal(false);
        setEditingItem(null);
      }
    } catch (err) {
      console.error('Error updating item:', err);
      alert('Erreur lors de la mise à jour: ' + err.message);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) {
      return;
    }

    try {
      await deleteItem(itemId);
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Erreur lors de la suppression: ' + err.message);
    }
  };

  const handleSavingsTargetUpdate = async () => {
    const target = parseFloat(savingsTarget);
    if (isNaN(target) || target < 0) {
      alert('Veuillez entrer un montant valide');
      return;
    }

    try {
      await updateSettings({
        userId: settings?.userId,
        defaultCurrency: settings?.defaultCurrency || 'EUR',
        monthlyTargets: {
          savingsTarget: target,
          incomeTarget: settings?.monthlyTargets?.incomeTarget || null
        },
        customCategories: settings?.customCategories || []
      });
      setShowSettings(false);
    } catch (err) {
      console.error('Error updating settings:', err);
      alert('Erreur lors de la sauvegarde: ' + err.message);
    }
  };

  const handleAddCategory = (newCategory) => {
    const updatedCategories = [...(settings?.customCategories || []), newCategory];
    updateSettings({
      userId: settings?.userId,
      defaultCurrency: settings?.defaultCurrency || 'EUR',
      monthlyTargets: settings?.monthlyTargets || {},
      customCategories: updatedCategories
    });
  };

  // Filter items
  const filteredItems = useMemo(() => {
    let filtered = items;

    if (filterType !== 'all') {
      filtered = filtered.filter(item => item.type === filterType);
    }

    if (filterCategory !== 'all') {
      filtered = filtered.filter(item => item.categoryId === filterCategory);
    }

    return filtered.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  }, [items, filterType, filterCategory]);

  // Get unique categories for filter
  const categories = useMemo(() => {
    const catMap = new Map();
    items.forEach(item => {
      if (!catMap.has(item.categoryId)) {
        catMap.set(item.categoryId, {
          id: item.categoryId,
          name: item.label,
          color: item.color
        });
      }
    });
    return Array.from(catMap.values());
  }, [items]);

  const monthYear = currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const isReadOnly = teamMemberId && teamMemberId !== 'current-user-id';

  return (
    <div className="mx-auto max-w-7xl space-y-6" data-testid="budget-planner">
      {/* Header */}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-slate-100">Budget Planner</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
            Gérez vos revenus, dépenses et objectifs d'épargne
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            data-testid="settings-button"
            aria-label="Paramètres"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>

          {!isReadOnly && (
            <>
              <button
                onClick={() => {
                  setEditingItem(null);
                  setShowItemModal(true);
                }}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                data-testid="add-item-button"
              >
                <Plus className="h-5 w-5" />
                Ajouter
              </button>
            </>
          )}
        </div>
      </div>

      {/* Read-only badge */}
      {isReadOnly && (
        <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
          ⚠️ Lecture seule - Vous consultez le budget d'un autre membre
        </div>
      )}

      {/* Period Navigator */}
      <div className="flex items-center justify-between rounded-lg bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
        <button
          onClick={handlePreviousMonth}
          className="rounded-lg p-2 transition hover:bg-gray-100 dark:hover:bg-slate-800"
          aria-label="Mois précédent"
          data-testid="prev-month-button"
        >
          <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-slate-400" />
        </button>

        <h2 className="text-lg font-semibold capitalize text-gray-900 dark:text-slate-100">
          {monthYear}
        </h2>

        <button
          onClick={handleNextMonth}
          className="rounded-lg p-2 transition hover:bg-gray-100 dark:hover:bg-slate-800"
          aria-label="Mois suivant"
          data-testid="next-month-button"
        >
          <ChevronRight className="h-5 w-5 text-gray-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
          ❌ {error}
        </div>
      )}

      {/* KPIs */}
      <BudgetKpis summary={summary} settings={settings} loading={loading} />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryDonut summary={summary} loading={loading} />
        <IncomeExpenseBar summary={summary} loading={loading} />
      </div>

      {/* Items Table */}
      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
        <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Transactions du mois
          </h3>

          <div className="flex flex-wrap gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              data-testid="filter-type-select"
            >
              <option value="all">Tous types</option>
              <option value="income">Revenus</option>
              <option value="expense">Dépenses</option>
              <option value="saving">Épargne</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              data-testid="filter-category-select"
            >
              <option value="all">Toutes catégories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-8 text-center text-gray-500 dark:text-slate-400">Chargement...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-8 text-center text-gray-500 dark:text-slate-400">
              Aucune transaction pour cette période
            </div>
          ) : (
            <table className="w-full" data-testid="items-table">
              <thead className="border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                    Libellé
                  </th>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                    Type
                  </th>
                  <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                    Montant
                  </th>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                    Date
                  </th>
                  <th className="pb-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                    Récurrence
                  </th>
                  {!isReadOnly && (
                    <th className="pb-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-slate-400">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {filteredItems.map((item, index) => (
                  <tr key={item.id || index} className="transition hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded text-lg"
                          style={{ backgroundColor: item.color }}
                        >
                          {getTaskIcon(item.iconId)}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900 dark:text-slate-100">
                            {item.label}
                          </div>
                          {item.notes && (
                            <div className="text-xs text-gray-500 dark:text-slate-400">
                              {item.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                          item.type === 'income'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                            : item.type === 'expense'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}
                      >
                        {item.type === 'income' ? 'Revenu' : item.type === 'expense' ? 'Dépense' : 'Épargne'}
                      </span>
                    </td>
                    <td className="py-3 text-right font-semibold text-gray-900 dark:text-slate-100">
                      {item.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </td>
                    <td className="py-3 text-sm text-gray-600 dark:text-slate-400">
                      {new Date(item.startDate).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3">
                      {item.recurrence !== 'none' && (
                        <span className="text-xs text-gray-500 dark:text-slate-400">
                          {item.recurrence === 'weekly' ? '📅 Hebdo' : '📆 Mensuel'}
                        </span>
                      )}
                    </td>
                    {!isReadOnly && (
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setShowItemModal(true);
                            }}
                            className="rounded p-1 text-blue-600 transition hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
                            aria-label="Modifier"
                            data-testid={`edit-item-${index}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id || item._originalId)}
                            className="rounded p-1 text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            aria-label="Supprimer"
                            data-testid={`delete-item-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Item Modal */}
      {showItemModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowItemModal(false);
              setEditingItem(null);
            }
          }}
          data-testid="item-modal"
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-900">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
                {editingItem ? 'Modifier l\'élément' : 'Ajouter un élément'}
              </h2>
            </div>
            <div className="max-h-[80vh] overflow-y-auto p-6">
              <BudgetItemForm
                item={editingItem}
                onSubmit={editingItem ? handleUpdateItem : handleCreateItem}
                onCancel={() => {
                  setShowItemModal(false);
                  setEditingItem(null);
                }}
                customCategories={settings?.customCategories || []}
                onAddCategory={handleAddCategory}
                readOnly={isReadOnly}
              />
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowSettings(false);
            }
          }}
          data-testid="settings-modal"
        >
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white shadow-xl dark:bg-slate-900">
            <div className="border-b border-gray-200 px-6 py-4 dark:border-slate-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
                Paramètres Budget
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label htmlFor="savingsTarget" className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Objectif d'épargne mensuel (€)
                </label>
                <input
                  id="savingsTarget"
                  type="number"
                  step="0.01"
                  min="0"
                  value={savingsTarget}
                  onChange={(e) => setSavingsTarget(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Ex: 500"
                  data-testid="savings-target-input"
                />
              </div>

              <div className="flex gap-3 border-t border-gray-200 pt-4 dark:border-slate-700">
                <button
                  onClick={handleSavingsTargetUpdate}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  data-testid="save-settings-button"
                >
                  Enregistrer
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                  data-testid="cancel-settings-button"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BudgetPlanner;
