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
  const [startHourInput, setStartHourInput] = useState("");
  const [endHourInput, setEndHourInput] = useState("");
  const [hourlyRateInput, setHourlyRateInput] = useState("0");

  useEffect(() => {
    if (settings && typeof settings[NUMBER_SETTING_KEY] === "number") {
      setDurationInput(String(settings[NUMBER_SETTING_KEY]));
    }
  }, [settings]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const fallbackStart =
      typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;
    const fallbackEnd =
      typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;

    const activeElementId =
      typeof document !== "undefined" ? document.activeElement?.id : null;

    if (activeElementId !== "setting-dayStartHour-input") {
      setStartHourInput(String(fallbackStart));
    }

    if (activeElementId !== "setting-dayEndHour-input") {
      setEndHourInput(String(fallbackEnd));
    }
  }, [settings?.dayEndHour, settings?.dayStartHour]);

  useEffect(() => {
    if (!settings) {
      return;
    }

    const activeElementId =
      typeof document !== "undefined" ? document.activeElement?.id : null;

    if (activeElementId === "setting-hourlyRateGlobal-input") {
      return;
    }

    const numericValue = Number(settings.hourlyRateGlobal);
    const safeValue = Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : 0;
    setHourlyRateInput(String(safeValue));
  }, [settings, settings?.hourlyRateGlobal]);

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

  const handleHourlyRateChange = useCallback((event) => {
    setHourlyRateInput(event.target.value);
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

  const handleCommitStart = useCallback(() => {
    if (!settings) {
      return;
    }

    if (settings.showFullDay === true) {
      const fallbackStart =
        typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;
      setStartHourInput(String(fallbackStart));
      return;
    }

    const parsed = parseInt(startHourInput, 10);
    if (Number.isNaN(parsed)) {
      const fallbackStart =
        typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;
      setStartHourInput(String(fallbackStart));
      return;
    }

    let clampedStart = parsed;
    if (clampedStart < 0) {
      clampedStart = 0;
    } else if (clampedStart > 23) {
      clampedStart = 23;
    }

    const currentEnd =
      typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;

    if (clampedStart >= currentEnd) {
      let nextEnd = clampedStart + 1;
      if (nextEnd > 24) {
        nextEnd = 24;
      }
      if (nextEnd !== settings.dayEndHour) {
        updateSetting?.("dayEndHour", nextEnd);
      }
      setEndHourInput(String(nextEnd));
    }

    if (clampedStart !== settings.dayStartHour) {
      updateSetting?.("dayStartHour", clampedStart);
    }

    setStartHourInput(String(clampedStart));
  }, [settings, startHourInput, updateSetting]);

  const handleCommitEnd = useCallback(() => {
    if (!settings) {
      return;
    }

    if (settings.showFullDay === true) {
      const fallbackEnd =
        typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;
      setEndHourInput(String(fallbackEnd));
      return;
    }

    const parsed = parseInt(endHourInput, 10);
    if (Number.isNaN(parsed)) {
      const fallbackEnd =
        typeof settings.dayEndHour === "number" ? settings.dayEndHour : 20;
      setEndHourInput(String(fallbackEnd));
      return;
    }

    let clampedEnd = parsed;
    if (clampedEnd < 1) {
      clampedEnd = 1;
    } else if (clampedEnd > 24) {
      clampedEnd = 24;
    }

    const currentStart =
      typeof settings.dayStartHour === "number" ? settings.dayStartHour : 7;

    if (clampedEnd <= currentStart) {
      let nextStart = clampedEnd - 1;
      if (nextStart < 0) {
        nextStart = 0;
      }
      if (nextStart !== settings.dayStartHour) {
        updateSetting?.("dayStartHour", nextStart);
      }
      setStartHourInput(String(nextStart));
    }

    if (clampedEnd !== settings.dayEndHour) {
      updateSetting?.("dayEndHour", clampedEnd);
    }

    setEndHourInput(String(clampedEnd));
  }, [endHourInput, settings, updateSetting]);

  const commitHourlyRate = useCallback(() => {
    if (!settings) {
      return;
    }

    const raw = typeof hourlyRateInput === "string" ? hourlyRateInput.trim() : String(hourlyRateInput ?? "");
    const normalizedRaw = raw.replace(",", ".");
    const parsed = normalizedRaw === "" ? 0 : Number.parseFloat(normalizedRaw);

    if (!Number.isFinite(parsed) || parsed < 0) {
      const fallback = Number.isFinite(Number(settings.hourlyRateGlobal)) && Number(settings.hourlyRateGlobal) >= 0
        ? Number(settings.hourlyRateGlobal)
        : 0;
      setHourlyRateInput(String(fallback));
      return;
    }

    const rounded = Math.round(parsed * 100) / 100;
    setHourlyRateInput(String(rounded));

    if (settings.hourlyRateGlobal !== rounded) {
      updateSetting?.("hourlyRateGlobal", rounded);
    }
  }, [hourlyRateInput, settings, updateSetting]);

  const fullDay = settings?.showFullDay === true;

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
                  value={startHourInput}
                  onChange={(event) => setStartHourInput(event.target.value)}
                  onBlur={handleCommitStart}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCommitStart();
                    }
                  }}
                  disabled={fullDay}
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
                  value={endHourInput}
                  onChange={(event) => setEndHourInput(event.target.value)}
                  onBlur={handleCommitEnd}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleCommitEnd();
                    }
                  }}
                  disabled={fullDay}
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

        <div className="flex items-start justify-between border-b border-slate-200 px-4 py-4 last:border-b-0 dark:border-slate-700">
          <div className="flex-1 pr-4">
            <p
              id="setting-hourlyRateGlobal-label"
              className="text-sm font-medium text-slate-900 dark:text-slate-100"
            >
              Taux horaire global
            </p>
            <p
              id="setting-hourlyRateGlobal-description"
              className="mt-1 text-xs text-slate-500 dark:text-slate-400"
            >
              Ce taux est utilisé pour calculer le total facturé sur les événements, sauf si un client a un taux personnalisé.
            </p>
          </div>
          <input
            id="setting-hourlyRateGlobal-input"
            type="number"
            min={0}
            step={0.5}
            value={hourlyRateInput}
            onChange={handleHourlyRateChange}
            onBlur={commitHourlyRate}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitHourlyRate();
              }
            }}
            aria-labelledby="setting-hourlyRateGlobal-label"
            aria-describedby="setting-hourlyRateGlobal-description"
            className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>
    </div>
  );
}
