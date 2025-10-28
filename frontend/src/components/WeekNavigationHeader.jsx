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

  const basePillButton =
    'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 active:opacity-90';
  const neutralPillClasses =
    'bg-slate-200/80 text-slate-800 hover:bg-slate-300 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:bg-slate-700/70';
  const activePillClasses =
    'bg-blue-500 text-white shadow-md shadow-blue-900/25 hover:bg-blue-500';

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
    <div className="mb-4 flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-100 p-4 text-slate-900 shadow-lg shadow-slate-900/10 transition-colors transition-shadow duration-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <button
          onClick={onToday}
          className={`${basePillButton} ${neutralPillClasses}`}
        >
          Aujourd'hui
        </button>
        <button
          onClick={onPrev}
          className={`${basePillButton} ${neutralPillClasses}`}
        >
          ◀︎
        </button>
        <button
          onClick={onNext}
          className={`${basePillButton} ${neutralPillClasses}`}
        >
          ▶︎
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 text-center md:flex-1">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{currentLabel}</h2>
        {planningMode === 'team' && (
          <div className="flex flex-col items-center gap-1">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-500/20 dark:text-blue-100">
              Équipe
            </span>
            {teamName && (
              <span className="text-sm font-medium text-blue-800 dark:text-blue-100" data-testid="planning-team-name">
                {teamName}
              </span>
            )}
            {showTeamSelector && (
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600 dark:text-slate-300">
                <label htmlFor="planning-team-select" className="font-medium text-slate-900 dark:text-slate-100">
                  Afficher
                </label>
                <select
                  id="planning-team-select"
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm transition-colors transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
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
                  <span className="text-xs text-gray-500 dark:text-slate-400" aria-live="polite">
                    Chargement…
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {showMemberSelector && (
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-gray-600 dark:text-slate-300">
            <label htmlFor="planning-member-select" className="font-medium text-slate-900 dark:text-slate-100">
              Planning de
            </label>
            <select
              id="planning-member-select"
              className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm transition-colors transition-shadow duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus-visible:ring-offset-slate-900"
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
              <span className="inline-flex items-center rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-semibold text-slate-700 transition-colors duration-150 dark:bg-slate-800/70 dark:text-slate-200">
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
              className={`${basePillButton} ${
                planningMode === 'personal' ? activePillClasses : neutralPillClasses
              }`}
            >
              Mon planning
            </button>
            <button
              onClick={() => handleModeClick('team')}
              className={`${basePillButton} ${
                planningMode === 'team' ? activePillClasses : neutralPillClasses
              }`}
            >
              Planning équipe
            </button>
          </div>
        )}
        <div className="flex items-center gap-2 justify-center">
          <button
            onClick={() => handleViewChange('week')}
            className={`${basePillButton} ${view === 'week' ? activePillClasses : neutralPillClasses}`}
          >
            Semaine
          </button>
          <button
            onClick={() => handleViewChange('month')}
            className={`${basePillButton} ${view === 'month' ? activePillClasses : neutralPillClasses}`}
          >
            Mois
          </button>
        </div>
      </div>
    </div>
  );
}
