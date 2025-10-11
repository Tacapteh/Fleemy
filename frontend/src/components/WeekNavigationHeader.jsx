import React from "react";

export default function WeekNavigationHeader({
  currentLabel,
  onPrev,
  onNext,
  onToday,
  view,
  onViewChange,
  memberOptions = [],
  selectedMemberId,
  onMemberChange,
  isReadOnlyMode = false,
}) {
  const showMemberSelector = Array.isArray(memberOptions) && memberOptions.length > 1;
  const selectedValue =
    selectedMemberId && memberOptions.some((option) => option.value === selectedMemberId)
      ? selectedMemberId
      : memberOptions[0]?.value || '';

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-gray-100 p-4 rounded-md shadow mb-4">
      <div className="flex items-center gap-2">
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

      <div className="flex flex-col items-center gap-2 text-center md:flex-1">
        <h2 className="text-lg font-bold">{currentLabel}</h2>
        {showMemberSelector && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600">
            <label htmlFor="planning-member-select" className="font-medium">
              Planning de
            </label>
            <select
              id="planning-member-select"
              className="px-2 py-1 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={selectedValue}
              onChange={(event) => onMemberChange?.(event.target.value)}
            >
              {memberOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {isReadOnlyMode && (
              <span className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
                Lecture seule
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 justify-center">
        <button
          onClick={() => onViewChange('week')}
          className={`px-3 py-1 rounded ${
            view === 'week' ? 'bg-blue-300' : 'bg-gray-300 hover:bg-gray-400'
          }`}
        >
          Semaine
        </button>
        <button
          onClick={() => onViewChange('month')}
          className={`px-3 py-1 rounded ${
            view === 'month' ? 'bg-blue-300' : 'bg-gray-300 hover:bg-gray-400'
          }`}
        >
          Mois
        </button>
      </div>
    </div>
  );
}
