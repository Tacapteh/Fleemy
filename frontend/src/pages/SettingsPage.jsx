import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSettings } from "../context/SettingsContext";

function Switch({ checked, onToggle, labelledBy }) {
  const handleToggle = useCallback(() => {
    if (typeof onToggle === "function") {
      onToggle(!checked);
    }
  }, [checked, onToggle]);

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
      aria-labelledby={labelledBy}
      tabIndex={0}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
        checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
      }`}
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
    key: "showWeekends",
    label: "Afficher le week-end",
    description: "Afficher le samedi et le dimanche dans la vue semaine et mois.",
  },
  {
    key: "showFullDay",
    label: "Plage horaire 0h → 24h",
    description: "Étendre l’affichage des heures sur 24h complètes.",
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
  const { settings, updateSetting } = useSettings();
  const [durationInput, setDurationInput] = useState("60");

  const safeSettings = useMemo(() => settings || null, [settings]);

  useEffect(() => {
    if (safeSettings && typeof safeSettings[NUMBER_SETTING_KEY] === "number") {
      setDurationInput(String(safeSettings[NUMBER_SETTING_KEY]));
    }
  }, [safeSettings]);

  const handleToggle = useCallback(
    (key, value) => {
      if (!safeSettings) {
        return;
      }
      updateSetting?.(key, value);
    },
    [safeSettings, updateSetting]
  );

  const handleDurationChange = useCallback((event) => {
    setDurationInput(event.target.value);
  }, []);

  const commitDurationValue = useCallback(() => {
    const parsed = parseInt(durationInput, 10);
    if (Number.isNaN(parsed)) {
      if (safeSettings && typeof safeSettings[NUMBER_SETTING_KEY] === "number") {
        setDurationInput(String(safeSettings[NUMBER_SETTING_KEY]));
      }
      return;
    }

    const clamped = Math.min(480, Math.max(5, parsed));
    setDurationInput(String(clamped));

    if (safeSettings && safeSettings[NUMBER_SETTING_KEY] === clamped) {
      return;
    }

    updateSetting?.(NUMBER_SETTING_KEY, clamped);
  }, [durationInput, safeSettings, updateSetting]);

  if (safeSettings === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
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
        {toggleSettings.map((item) => {
          const currentValue = Boolean(safeSettings[item.key]);
          const labelId = `setting-${item.key}-label`;
          const descriptionId = `setting-${item.key}-description`;

          return (
            <div
              key={item.key}
              className="flex items-center justify-between py-3 px-4 border-b border-slate-200 last:border-b-0 dark:border-slate-700"
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
                checked={currentValue}
                onToggle={(nextValue) => handleToggle(item.key, nextValue)}
                labelledBy={labelId}
              />
            </div>
          );
        })}

        <div className="flex items-center justify-between py-3 px-4 border-b border-slate-200 last:border-b-0 dark:border-slate-700">
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
            className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>
    </div>
  );
}
