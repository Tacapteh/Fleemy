import React from "react";

export default function WeekNavigationHeader({
  currentWeek,
  onPrevWeek,
  onNextWeek,
}) {
  return (
    <div className="flex items-center justify-between bg-gray-100 p-4 rounded-md shadow mb-4">
      <button
        onClick={onPrevWeek}
        className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
      >
        ← Semaine précédente
      </button>
      <h2 className="text-lg font-bold">Semaine {currentWeek}</h2>
      <button
        onClick={onNextWeek}
        className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
      >
        Semaine suivante →
      </button>
    </div>
  );
}
