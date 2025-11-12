import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { defaultChartOptions } from '../lib/charts';

const CategoryDonut = ({ summary, loading }) => {
  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-gray-50 p-6 dark:bg-slate-800">
        <div className="text-gray-500 dark:text-slate-400">Chargement...</div>
      </div>
    );
  }

  if (!summary || !summary.breakdownByCategory) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-gray-50 p-6 dark:bg-slate-800">
        <div className="text-gray-500 dark:text-slate-400">Aucune donnée disponible</div>
      </div>
    );
  }

  // Filter only expenses for the donut chart
  const expenseCategories = Object.entries(summary.breakdownByCategory)
    .filter(([_, data]) => data.type === 'expense')
    .sort(([, a], [, b]) => b.amount - a.amount);

  if (expenseCategories.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-gray-50 p-6 dark:bg-slate-800">
        <div className="text-gray-500 dark:text-slate-400">Aucune dépense enregistrée</div>
      </div>
    );
  }

  const labels = expenseCategories.map(([id, data]) => {
    const amount = data.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    return `${data.label} (${amount})`;
  });

  const dataValues = expenseCategories.map(([_, data]) => data.amount);
  const backgroundColors = expenseCategories.map(([_, data]) => data.color);

  const chartData = {
    labels,
    datasets: [
      {
        data: dataValues,
        backgroundColor: backgroundColors,
        borderColor: '#ffffff',
        borderWidth: 2
      }
    ]
  };

  const options = {
    ...defaultChartOptions,
    plugins: {
      ...defaultChartOptions.plugins,
      legend: {
        ...defaultChartOptions.plugins.legend,
        position: 'right'
      },
      title: {
        display: false
      }
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-slate-100">
        Répartition des dépenses
      </h3>
      <div className="h-80">
        <Doughnut data={chartData} options={options} />
      </div>
    </div>
  );
};

export default CategoryDonut;
