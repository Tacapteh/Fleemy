import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import DailyTodoPanel from '../components/DailyTodoPanel';

const toDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDateInputValue = (dateStr) => {
  return dateStr;
};

export default function Todo() {
  const { user } = useOutletContext();
  const [selectedDate, setSelectedDate] = useState(toDateString(new Date()));

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  const goToToday = () => {
    setSelectedDate(toDateString(new Date()));
  };

  const goToPrevious = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() - 1);
    setSelectedDate(toDateString(date));
  };

  const goToNext = () => {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + 1);
    setSelectedDate(toDateString(date));
  };

  const formatDisplayDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (!user?.uid) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-slate-600 dark:text-slate-400">Chargement...</p>
      </div>
    );
  }

  return (
    <div 
      data-testid="todo-page"
      className="space-y-6 text-slate-900 dark:text-slate-100"
    >
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">
          Notes du jour
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
          Gérez vos rappels et notes personnelles pour chaque journée
        </p>
      </div>

      {/* Date selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goToPrevious}
            data-testid="todo-prev-day"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Jour précédent"
          >
            ←
          </button>
          
          <div className="flex flex-col gap-1">
            <input
              type="date"
              value={toDateInputValue(selectedDate)}
              onChange={handleDateChange}
              data-testid="todo-date-input"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              aria-label="Sélectionner une date"
            />
            <p className="text-xs text-slate-600 dark:text-slate-400 capitalize">
              {formatDisplayDate(selectedDate)}
            </p>
          </div>

          <button
            type="button"
            onClick={goToNext}
            data-testid="todo-next-day"
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Jour suivant"
          >
            →
          </button>
        </div>

        <button
          type="button"
          onClick={goToToday}
          data-testid="todo-today-button"
          className="inline-flex items-center rounded-md border border-transparent bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-amber-600 dark:hover:bg-amber-500"
        >
          Aujourd'hui
        </button>
      </div>

      {/* Todo panel */}
      <div className="mx-auto max-w-3xl">
        <DailyTodoPanel
          selectedDate={selectedDate}
          userId={user.uid}
          readOnly={false}
        />
      </div>
    </div>
  );
}
