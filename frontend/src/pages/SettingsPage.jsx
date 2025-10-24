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
        {toggleSettings.map((item) => {
          const labelId = `setting-${item.key}-label`;
          const descriptionId = `setting-${item.key}-description`;

          return (
            <div
              key={item.key}
              className="flex items-center justify-between py-3 border-b border-slate-200 last:border-b-0 dark:border-slate-700 px-4"
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
              />
            </div>
          );
        })}

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
