import React from "react";

export default function WeekNavigationHeader({
  currentLabel,
  onPrev,
  onNext,
  onToday,
  view,
  onViewChange,
}) {
  return (
    <div className="flex items-center justify-between bg-gray-100 p-4 rounded-md shadow mb-4">
      <div className="flex space-x-2">
        <button
          onClick={onToday}
          className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
        >
          Aujourd'hui
        </button>
        <button
          onClick={onPrev}
          className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
        >
          ◀︎
        </button>
        <button
          onClick={onNext}
          className="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400"
        >
          ▶︎
        </button>
      </div>
      <h2 className="text-lg font-bold">{currentLabel}</h2>
      <div className="flex space-x-2">
        <button
          onClick={() => onViewChange("week")}
          className={`px-3 py-1 rounded ${
            view === "week" ? "bg-blue-300" : "bg-gray-300 hover:bg-gray-400"
          }`}
        >
          Semaine
        </button>
        <button
          onClick={() => onViewChange("month")}
          className={`px-3 py-1 rounded ${
            view === "month" ? "bg-blue-300" : "bg-gray-300 hover:bg-gray-400"
          }`}
        >
          Mois
        </button>
      </div>
    </div>
  );
}
