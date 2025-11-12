import React from 'react';
import { Bar } from 'react-chartjs-2';
import { defaultChartOptions } from '../lib/charts';

const IncomeExpenseBar = ({ summary, loading }) => {
  if (loading) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-gray-50 p-6 dark:bg-slate-800">
        <div className="text-gray-500 dark:text-slate-400">Chargement...</div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg bg-gray-50 p-6 dark:bg-slate-800">
        <div className="text-gray-500 dark:text-slate-400">Aucune donnée disponible</div>
      </div>
    );
  }

  const { totalIncome, totalExpense } = summary;

  const chartData = {
    labels: ['Ce mois'],
    datasets: [
      {
        label: 'Revenus',
        data: [totalIncome],
        backgroundColor: '#B8EBD0',
        borderColor: '#8ED4AC',
        borderWidth: 1
      },
      {
        label: 'Dépenses',
        data: [totalExpense],
        backgroundColor: '#FFBFC4',
        borderColor: '#FF9BA3',
        borderWidth: 1
      }
    ]
  };

  const options = {
    ...defaultChartOptions,
    plugins: {
      ...defaultChartOptions.plugins,
      title: {
        display: false
      },
      legend: {
        ...defaultChartOptions.plugins.legend,
        position: 'top'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
          }
        },
        grid: {
          color: 'rgba(0, 0, 0, 0.05)'
        }
      },
      x: {
        grid: {
          display: false
        }
      }
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200 dark:bg-slate-900 dark:ring-slate-700">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-slate-100">
        Revenus vs Dépenses
      </h3>
      <div className="h-80">
        <Bar data={chartData} options={options} />
      </div>
    </div>
  );
};

export default IncomeExpenseBar;
