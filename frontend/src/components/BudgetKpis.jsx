import React from 'react';
import { Wallet, ShoppingCart, TrendingUp, TrendingDown, PiggyBank } from 'lucide-react';

const BudgetKpis = ({ summary, settings, loading }) => {
  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const { totalIncome, totalExpense, net, savings } = summary;
  const savingsTarget = settings?.monthlyTargets?.savingsTarget || 0;
  const savingsProgress = savingsTarget > 0 ? (savings / savingsTarget) * 100 : 0;

  const kpis = [
    {
      label: 'Revenus',
      value: totalIncome,
      color: 'bg-[#B8EBD0]',
      textColor: 'text-gray-900',
      Icon: Wallet,
      iconColor: 'text-emerald-700',
      dataTestId: 'kpi-income'
    },
    {
      label: 'Dépenses',
      value: totalExpense,
      color: 'bg-[#FFBFC4]',
      textColor: 'text-gray-900',
      Icon: ShoppingCart,
      iconColor: 'text-rose-600',
      dataTestId: 'kpi-expenses'
    },
    {
      label: 'Net',
      value: net,
      color: net >= 0 ? 'bg-[#BFE6FF]' : 'bg-[#FFD6B8]',
      textColor: 'text-gray-900',
      Icon: net >= 0 ? TrendingUp : TrendingDown,
      iconColor: net >= 0 ? 'text-emerald-600' : 'text-rose-600',
      dataTestId: 'kpi-net'
    },
    {
      label: 'Épargne',
      value: savings,
      color: 'bg-[#DCCEF8]',
      textColor: 'text-gray-900',
      Icon: PiggyBank,
      iconColor: 'text-sky-700',
      dataTestId: 'kpi-savings',
      showProgress: savingsTarget > 0,
      progress: savingsProgress
    }
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          data-testid={kpi.dataTestId}
          className={`${kpi.color} overflow-hidden rounded-lg p-5 shadow-sm ring-1 ring-gray-200 transition-shadow hover:shadow-md dark:ring-slate-700`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-800">{kpi.label}</p>
              <p className={`mt-2 text-2xl font-bold ${kpi.textColor}`}>
                {kpi.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
            <div className="rounded-full bg-white/70 p-2 shadow-sm">
              <kpi.Icon className={`h-7 w-7 ${kpi.iconColor}`} aria-hidden="true" />
            </div>
          </div>
          {kpi.showProgress && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-800">
                <span>Objectif: {savingsTarget.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                <span>{Math.min(100, savingsProgress).toFixed(0)}%</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-300/50">
                <div
                  className="h-full rounded-full bg-gray-900 transition-all"
                  style={{ width: `${Math.min(100, savingsProgress)}%` }}
                  role="progressbar"
                  aria-valuenow={savingsProgress}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-label="Progression épargne"
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default BudgetKpis;
