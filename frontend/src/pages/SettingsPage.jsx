import React, { useCallback, useEffect, useState } from "react";
import { useSettings } from "../context/SettingsContext";

function Switch({ checked, onToggle, ...props }) {
  const handleToggle = useCallback(() => {
    if (typeof onToggle === "function") {
      onToggle();
    }
  }, [onToggle]);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleToggle();
      }
    },
    [handleToggle]
  );

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      tabIndex={0}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
        checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
      }`}
      {...props}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

const toggleSettings = [
  {
    key: "showFullDay",
    label: "Plage horaire 0h → 24h",
    description: "Étendre l’affichage des heures sur 24h complètes.",
  },
  {
    key: "showWeekends",
    label: "Afficher le week-end",
    description: "Afficher le samedi et le dimanche dans la vue semaine et mois.",
  },
  {
    key: "enableMinutes",
    label: "Minutes détaillées",
    description: "Autoriser la saisie de créneaux comme 09h15 → 10h45.",
  },
  {
    key: "darkMode",
    label: "Thème sombre",
    description: "Utiliser l’interface en mode sombre.",
  },
  {
    key: "requireClientName",
    label: "Client obligatoire",
    description: "Forcer la sélection d’un client pour valider un événement.",
  },
];

const NUMBER_SETTING_KEY = "defaultSlotDurationMinutes";

export default function SettingsPage() {
  const { settings, loading, updateSetting } = useSettings();
  const [durationInput, setDurationInput] = useState("60");

  useEffect(() => {
    if (settings && typeof settings[NUMBER_SETTING_KEY] === "number") {
      setDurationInput(String(settings[NUMBER_SETTING_KEY]));
    }
  }, [settings]);

  const handleToggle = useCallback(
    (key) => {
      if (!settings) {
        return;
      }
      const nextValue = !(settings[key] === true);
      updateSetting?.(key, nextValue);
    },
    [settings, updateSetting]
  );

  const handleDurationChange = useCallback((event) => {
    setDurationInput(event.target.value);
  }, []);

  const commitDurationValue = useCallback(() => {
    if (!settings) {
      return;
    }

    const parsed = parseInt(durationInput, 10);
    if (Number.isNaN(parsed)) {
      setDurationInput(
        String(
          typeof settings[NUMBER_SETTING_KEY] === "number"
            ? settings[NUMBER_SETTING_KEY]
            : 60
        )
      );
      return;
    }

    const clamped = Math.min(480, Math.max(5, parsed));
    setDurationInput(String(clamped));

    if (settings[NUMBER_SETTING_KEY] !== clamped) {
      updateSetting?.(NUMBER_SETTING_KEY, clamped);
    }
  }, [durationInput, settings, updateSetting]);

  const handleDayStartChange = useCallback(
    (event) => {
      if (!settings || settings.showFullDay) {
        return;
      }

      const rawValue = event.target.value;
      if (rawValue === "") {
        return;
      }

      const parsed = parseInt(rawValue, 10);
      if (Number.isNaN(parsed)) {
        return;
      }

      const currentStart =
        typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;
      const currentEnd =
        typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;

      const nextStart = Math.max(0, Math.min(23, parsed));
      let nextEnd = currentEnd;

      if (nextStart >= nextEnd) {
        nextEnd = Math.min(24, nextStart + 1);
      }

      if (currentStart !== nextStart) {
        updateSetting?.("dayStartHour", nextStart);
      }

      if (nextEnd !== currentEnd) {
        updateSetting?.("dayEndHour", nextEnd);
      }
    },
    [settings, updateSetting]
  );

  const handleDayEndChange = useCallback(
    (event) => {
      if (!settings || settings.showFullDay) {
        return;
      }

      const rawValue = event.target.value;
      if (rawValue === "") {
        return;
      }

      const parsed = parseInt(rawValue, 10);
      if (Number.isNaN(parsed)) {
        return;
      }

      const currentStart =
        typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;
      const currentEnd =
        typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;

      const nextEnd = Math.max(1, Math.min(24, parsed));
      let nextStart = currentStart;

      if (nextEnd <= nextStart) {
        nextStart = Math.max(0, Math.min(nextEnd - 1, 23));
      }

      if (nextStart !== currentStart) {
        updateSetting?.("dayStartHour", nextStart);
      }

      if (nextEnd !== currentEnd) {
        updateSetting?.("dayEndHour", nextEnd);
      }
    },
    [settings, updateSetting]
  );

  const showFullDayToggle = toggleSettings.find((item) => item.key === "showFullDay");
  const additionalToggleSettings = toggleSettings.filter((item) => item.key !== "showFullDay");

  const renderToggleRow = useCallback(
    (item) => {
      if (!item) {
        return null;
      }
      const labelId = `setting-${item.key}-label`;
      const descriptionId = `setting-${item.key}-description`;

      return (
        <div
          key={item.key}
          className="flex items-center justify-between border-b border-slate-200 px-4 py-3 last:border-b-0 dark:border-slate-700"
        >
          <div className="flex-1 pr-4">
            <p id={labelId} className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {item.label}
            </p>
            <p id={descriptionId} className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {item.description}
            </p>
          </div>
          <Switch
            checked={settings[item.key] === true}
            onToggle={() => handleToggle(item.key)}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
          />
        </div>
      );
    },
    [handleToggle, settings]
  );

  if (loading || !settings) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center text-sm text-slate-700 dark:text-slate-200">
        Chargement…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 sm:text-2xl">
          Paramètres d’affichage
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Personnalisez l’apparence de votre planning. Les modifications sont enregistrées automatiquement.
        </p>
      </header>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {renderToggleRow(showFullDayToggle)}

        <div className="border-b border-slate-200 px-4 py-4 last:border-b-0 dark:border-slate-700">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="sm:pr-4">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Heures affichées dans la journée
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Contrôle la plage horaire visible dans la vue Semaine.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Début
                <input
                  id="setting-dayStartHour-input"
                  type="number"
                  min={0}
                  max={23}
                  value={
                    typeof settings.dayStartHour === "number"
                      ? settings.dayStartHour
                      : 7
                  }
                  onChange={handleDayStartChange}
                  disabled={settings.showFullDay === true}
                  className="mt-1 w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                />
              </label>

              <label className="flex flex-col text-xs font-medium text-slate-600 dark:text-slate-300">
                Fin
                <input
                  id="setting-dayEndHour-input"
                  type="number"
                  min={1}
                  max={24}
                  value={
                    typeof settings.dayEndHour === "number"
                      ? settings.dayEndHour
                      : 20
                  }
                  onChange={handleDayEndChange}
                  disabled={settings.showFullDay === true}
                  className="mt-1 w-20 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:disabled:border-slate-700 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                />
              </label>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Si l’option « Plage horaire 0h → 24h » est activée, l’affichage montrera automatiquement toutes les heures, de 00:00 à
            24:00.
          </p>
        </div>

        {additionalToggleSettings.map((item) => renderToggleRow(item))}

        <div className="flex items-center justify-between py-3 border-b border-slate-200 last:border-b-0 dark:border-slate-700 px-4">
          <div className="flex-1 pr-4">
            <p
              id={`setting-${NUMBER_SETTING_KEY}-label`}
              className="text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              Durée par défaut d’un créneau
            </p>
            <p
              id={`setting-${NUMBER_SETTING_KEY}-description`}
              className="mt-1 text-xs text-slate-500 dark:text-slate-400"
            >
              Durée proposée automatiquement lors de la création d’un nouveau créneau (en minutes).
            </p>
          </div>
          <input
            type="number"
            min={5}
            max={480}
            step={5}
            value={durationInput}
            onChange={handleDurationChange}
            onBlur={commitDurationValue}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitDurationValue();
              }
            }}
            aria-labelledby={`setting-${NUMBER_SETTING_KEY}-label`}
            aria-describedby={`setting-${NUMBER_SETTING_KEY}-description`}
            className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>
    </div>
  );
}
