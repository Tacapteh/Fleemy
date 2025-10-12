import React from "react";

export default function WeekNavigationHeader({
  currentLabel,
  onPrev,
  onNext,
  onToday,
  view = 'week',
  onViewChange,
  memberOptions = [],
  selectedMemberId,
  onMemberChange,
  isReadOnlyMode = false,
  planningMode = 'personal',
  onPlanningModeChange,
  canUseTeamMode = false,
  teamName = null,
  teamOptions = [],
  selectedTeamId = null,
  onTeamChange,
  teamsLoading = false,
}) {
  const showMemberSelector =
    planningMode === 'team' && Array.isArray(memberOptions) && memberOptions.length > 1;
  const selectedValue =
    selectedMemberId && memberOptions.some((option) => option.value === selectedMemberId)
      ? selectedMemberId
      : memberOptions[0]?.value || '';
  const showTeamToggle = Boolean(onPlanningModeChange) && canUseTeamMode;
  const showTeamSelector =
    planningMode === 'team' &&
    Array.isArray(teamOptions) &&
    teamOptions.length > 1 &&
    typeof onTeamChange === 'function';
  const selectedTeamValue =
    selectedTeamId && teamOptions.some((option) => option.value === selectedTeamId)
      ? selectedTeamId
      : teamOptions[0]?.value || '';

  const handleModeClick = (mode) => {
    if (!onPlanningModeChange) return;
    if (mode === 'team' && !canUseTeamMode) return;
    onPlanningModeChange(mode);
  };

  const handleViewChange = (mode) => {
    if (typeof onViewChange !== 'function') {
      return;
    }
    onViewChange(mode);
  };

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
        {planningMode === 'team' && (
          <div className="flex flex-col items-center gap-1">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
              Équipe
            </span>
            {teamName && (
              <span className="text-sm font-medium text-blue-800" data-testid="planning-team-name">
                {teamName}
              </span>
            )}
            {showTeamSelector && (
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600">
                <label htmlFor="planning-team-select" className="font-medium">
                  Afficher
                </label>
                <select
                  id="planning-team-select"
                  className="px-2 py-1 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  value={selectedTeamValue}
                  onChange={(event) => onTeamChange?.(event.target.value)}
                  disabled={teamsLoading}
                >
                  {teamOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {teamsLoading && (
                  <span className="text-xs text-gray-500" aria-live="polite">
                    Chargement…
                  </span>
                )}
              </div>
            )}
          </div>
        )}
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

      <div className="flex flex-col gap-2 items-center justify-center">
        {showTeamToggle && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleModeClick('personal')}
              className={`px-3 py-1 rounded ${
                planningMode === 'personal'
                  ? 'bg-green-300'
                  : 'bg-gray-300 hover:bg-gray-400'
              }`}
            >
              Mon planning
            </button>
            <button
              onClick={() => handleModeClick('team')}
              className={`px-3 py-1 rounded ${
                planningMode === 'team' ? 'bg-blue-300' : 'bg-gray-300 hover:bg-gray-400'
              }`}
            >
              Planning équipe
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 justify-center">
          <button
            onClick={() => handleViewChange('week')}
            className={`px-3 py-1 rounded ${
              view === 'week' ? 'bg-blue-300' : 'bg-gray-300 hover:bg-gray-400'
            }`}
          >
            Semaine
          </button>
          <button
            onClick={() => handleViewChange('month')}
            className={`px-3 py-1 rounded ${
              view === 'month' ? 'bg-blue-300' : 'bg-gray-300 hover:bg-gray-400'
            }`}
          >
            Mois
          </button>
        </div>
      </div>
    </div>
  );
}
