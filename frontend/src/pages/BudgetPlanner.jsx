import React, { useState, useEffect, useMemo } from 'react';
import { useBudget } from '../hooks/useBudget';
import BudgetKpis from '../components/BudgetKpis';
import CategoryDonut from '../components/CategoryDonut';
import IncomeExpenseBar from '../components/IncomeExpenseBar';
import BudgetItemForm from '../components/BudgetItemForm';
import { getTaskIcon } from '../constants/icons';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Edit2,
  Trash2,
  Settings as SettingsIcon,
  AlertTriangle,
  XCircle,
  CalendarDays,
  CalendarRange
} from 'lucide-react';

const BudgetPlanner = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [filterType, setFilterType] = useState('income');
  const [filterCategory, setFilterCategory] = useState('all');
  const [teamMemberId, setTeamMemberId] = useState(null);
  const [savingsTarget, setSavingsTarget] = useState('');

  const typeTabs = useMemo(() => ([
    { value: 'income', label: 'Revenus' },
    { value: 'expense', label: 'Dépenses' },
    { value: 'saving', label: 'Épargne' }
  ]), []);

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
    let filtered = items.filter(item => item.type === filterType);

    if (filterCategory !== 'all') {
      filtered = filtered.filter(item => item.categoryId === filterCategory);
    }

    return filtered.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  }, [items, filterType, filterCategory]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    if (!items.some(item => item.type === filterType)) {
      const availableTab = typeTabs.find(tab => items.some(item => item.type === tab.value));
      if (availableTab) {
        setFilterType(availableTab.value);
      }
    }
  }, [items, filterType, typeTabs]);

  useEffect(() => {
    setFilterCategory('all');
  }, [filterType]);

  // Get unique categories for filter
  const categories = useMemo(() => {
    const catMap = new Map();
    items
      .filter(item => item.type === filterType)
      .forEach(item => {
      if (!catMap.has(item.categoryId)) {
        catMap.set(item.categoryId, {
          id: item.categoryId,
          name: item.label,
          color: item.color
        });
      }
    });
    return Array.from(catMap.values());
  }, [items, filterType]);

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
            className="rounded-lg border border-slate-200 bg-white/90 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:hover:bg-emerald-400 dark:focus-visible:ring-offset-slate-900"
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
        <div className="rounded-lg bg-amber-100/80 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span>Lecture seule - Vous consultez le budget d'un autre membre</span>
          </div>
        </div>
      )}

      {/* Period Navigator */}
      <div className="flex items-center justify-between rounded-lg bg-white/90 p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-700">
        <button
          onClick={handlePreviousMonth}
          className="rounded-lg p-2 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 dark:hover:bg-slate-800"
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
          className="rounded-lg p-2 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 dark:hover:bg-slate-800"
          aria-label="Mois suivant"
          data-testid="next-month-button"
        >
          <ChevronRight className="h-5 w-5 text-gray-600 dark:text-slate-400" />
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-rose-100/80 p-4 text-sm text-rose-900 dark:bg-rose-500/10 dark:text-rose-200">
          <div className="flex items-start gap-2">
            <XCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
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
      <div className="rounded-lg bg-white/95 p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900/60 dark:ring-slate-700">
        <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
            Transactions du mois
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800/60">
              {typeTabs.map(tab => {
                const isActive = filterType === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setFilterType(tab.value)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 ${
                      isActive
                        ? 'bg-white/90 text-slate-900 shadow-sm ring-1 ring-emerald-300/60 dark:bg-slate-900/80 dark:text-slate-100 dark:ring-emerald-500/40'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                    }`}
                    type="button"
                    aria-pressed={isActive}
                    data-testid={`filter-type-tab-${tab.value}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1 text-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
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
                  <tr key={item.id || index} className="transition hover:bg-emerald-50/50 dark:hover:bg-slate-800/50">
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
                            ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : item.type === 'expense'
                            ? 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300'
                            : 'bg-sky-500/10 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300'
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
                        <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                          {item.recurrence === 'weekly' ? (
                            <>
                              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Hebdo</span>
                            </>
                          ) : (
                            <>
                              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Mensuel</span>
                            </>
                          )}
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
                            className="rounded p-1 text-emerald-500 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
                            aria-label="Modifier"
                            data-testid={`edit-item-${index}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id || item._originalId)}
                            className="rounded p-1 text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
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
          <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white/95 shadow-xl dark:bg-slate-900/70">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
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
          <div className="w-full max-w-md overflow-hidden rounded-lg bg-white/95 shadow-xl dark:bg-slate-900/70">
            <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
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
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="Ex: 500"
                  data-testid="savings-target-input"
                />
              </div>

              <div className="flex gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
                <button
                  onClick={handleSavingsTargetUpdate}
                  className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:hover:bg-emerald-400 dark:focus-visible:ring-offset-slate-900"
                  data-testid="save-settings-button"
                >
                  Enregistrer
                </button>
                <button
                  onClick={() => setShowSettings(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
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
