/**
 * Sélecteurs pour le planning avec résolution des clients
 * Optimisé avec memoization pour éviter les rendus inutiles
 */

import { useMemo } from "react";

/**
 * Crée un map client_id -> client pour résolution rapide
 */
export function useClientMap(clients: any[]) {
  return useMemo(() => {
    const map = new Map();
    clients.forEach((client) => {
      map.set(client.id, client);
    });
    return map;
  }, [clients]);
}

/**
 * Résout le client_id d'un événement vers le display_name
 * Retourne le client_name (label) si le client n'est pas trouvé
 */
export function resolveClientName(
  event: any,
  clientMap: Map<string, any>
): string {
  if (!event.client_id) {
    // Pas de client_id, utiliser client_name/label
    return event.client_name || event.client || "Client inconnu";
  }

  const client = clientMap.get(event.client_id);
  return client?.display_name || event.client_name || "Client inconnu";
}

/**
 * Enrichit les événements avec les informations clients complètes
 */
export function useEnrichedEvents(events: any[], clients: any[]) {
  const clientMap = useClientMap(clients);

  return useMemo(() => {
    return events.map((event) => ({
      ...event,
      clientDisplayName: resolveClientName(event, clientMap),
      client: clientMap.get(event.client_id),
    }));
  }, [events, clientMap]);
}

/**
 * Filtre les événements par client_id
 */
export function filterEventsByClient(events: any[], clientId: string) {
  return events.filter((event) => event.client_id === clientId);
}

/**
 * Groupe les événements par client
 */
export function groupEventsByClient(
  events: any[],
  clientMap: Map<string, any>
) {
  const grouped = new Map<string, any[]>();

  events.forEach((event) => {
    const clientId = event.client_id || "unknown";
    if (!grouped.has(clientId)) {
      grouped.set(clientId, []);
    }
    grouped.get(clientId)!.push({
      ...event,
      clientDisplayName: resolveClientName(event, clientMap),
    });
  });

  return grouped;
}
export interface DateRange {
  from: Date;
  to: Date;
}

export interface PlannerEventInput {
  id: string;
  date?: string;
  day?: number;
  dayIndex?: number;
  start: Date | string | number | null;
  end: Date | string | number | null;
  status?: string;
  title?: string;
  client?: string;
  description?: string;
  readOnly?: boolean;
  [key: string]: unknown;
}

export interface WeeklyTaskRange {
  day?: number | string | null;
  weekday?: number | string | null;
  start?: string | null;
  end?: string | null;
}

export interface WeeklyTaskDefinition {
  id: string;
  label?: string;
  icon?: string;
  color?: string;
  price?: number | string | null;
  readOnly?: boolean;
  weekday?: number | string | null;
  time_ranges?: WeeklyTaskRange[] | null;
  timeSlots?: WeeklyTaskRange[] | null;
  priority?: "high" | "medium" | "low" | string | null;
  team_id?: string | null;
  [key: string]: unknown;
}

export interface TaskOccurrence {
  taskId: string;
  occurrenceId: string;
  dayIndex: number;
  weekday?: number;
  startDate: Date;
  endDate: Date;
  label: string;
  color?: string;
  icon?: string;
  price?: number | string | null;
  readOnly?: boolean;
  attachedToEvent?: boolean;
  priority?: "high" | "medium" | "low";
  status?: "todo" | "doing" | "done";
  done?: boolean;
  [key: string]: unknown;
}

export interface AttachedTaskBadge {
  taskId: string;
  iconId: string;
  label: string;
  price?: number;
  color?: string;
  priority?: "high" | "medium" | "low";
  status?: "todo" | "doing" | "done";
  done?: boolean;
}

export interface DisplayEvent extends PlannerEventInput {
  dayIndex: number;
  startDate: Date;
  endDate: Date;
  attachedTaskBadges: AttachedTaskBadge[];
  displayPriority?: number;
}

export interface DisplayTaskGroup {
  id: string;
  dayIndex: number;
  startDate: Date;
  endDate: Date;
  tasks: TaskOccurrence[];
  attachedToEvent: boolean;
}

export interface ComputeDisplayBlocksResult {
  displayEvents: DisplayEvent[];
  displayTaskGroups: DisplayTaskGroup[];
}

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const timePattern = /^(\d{1,2}):(\d{2})$/;

const clampDateToMidnight = (value: Date): Date => {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

const normalizeTaskPriority = (value: unknown): "high" | "medium" | "low" => {
  if (typeof value !== "string") {
    return "medium";
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "high" || normalized === "low"
    ? (normalized as "high" | "low")
    : "medium";
};

const normalizeTaskStatus = (
  value: unknown
): "todo" | "doing" | "done" | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "todo" ||
    normalized === "doing" ||
    normalized === "done"
  ) {
    return normalized;
  }
  return undefined;
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return new Date(value);
  }
  if (typeof value === "number") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    const parsed = (value as { toDate: () => Date }).toDate();
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const parseTimeString = (
  value: unknown
): { hours: number; minutes: number } | null => {
  if (typeof value !== "string") return null;
  const match = value.trim().match(timePattern);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  if (hours === 24) {
    return minutes === 0 ? { hours: 24, minutes: 0 } : null;
  }
  if (hours < 0 || hours > 23) return null;
  return { hours, minutes };
};

const resolveDayIndex = (value: unknown, fallbackStart: Date): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    if (normalized >= 0 && normalized <= 6) return normalized;
    if (normalized >= 1 && normalized <= 7) return (normalized + 6) % 7;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsedNumber = Number(value);
    if (!Number.isNaN(parsedNumber)) {
      return resolveDayIndex(parsedNumber, fallbackStart);
    }
    const parsedDate = parseDate(value);
    if (parsedDate) {
      const diff = Math.floor(
        (clampDateToMidnight(parsedDate).getTime() -
          clampDateToMidnight(fallbackStart).getTime()) /
          MS_IN_DAY
      );
      if (diff >= 0 && diff <= 6) return diff;
    }
  }
  return -1;
};

const addTimeToDate = (
  base: Date,
  time: { hours: number; minutes: number }
): Date => {
  const result = new Date(base);
  result.setHours(time.hours, time.minutes, 0, 0);
  return result;
};

const rangesOverlap = (
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean => {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
};

const normalizeBadgePrice = (value: unknown): number | undefined => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const sanitized = trimmed.replace(/[^0-9,.-]+/g, "").replace(",", ".");
    if (!sanitized) {
      return undefined;
    }
    const parsed = Number(sanitized);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

type DisplayEventWithSource = DisplayEvent & {
  __sourceIndex?: number;
  __recencyScore?: number;
};

const normalizeEvent = (
  event: PlannerEventInput,
  rangeStart: Date
): DisplayEvent | null => {
  const fallbackDate = event.date ? parseDate(`${event.date}T00:00:00`) : null;

  const parsedStartDate = parseDate(event.start);
  let startDate = parsedStartDate;
  if (!startDate && fallbackDate) {
    const parsedTime = parseTimeString(event.start);
    if (parsedTime) {
      startDate = addTimeToDate(fallbackDate, parsedTime);
    }
  }

  let endDate = parseDate(event.end);
  if (!endDate && fallbackDate) {
    const parsedTime = parseTimeString(event.end);
    if (parsedTime && startDate) {
      endDate = addTimeToDate(fallbackDate, parsedTime);
    }
  }

  if (!startDate || !endDate) {
    return null;
  }

  const safeStart = new Date(startDate);
  const safeEnd = new Date(endDate);
  if (safeEnd <= safeStart) {
    return null;
  }

  const startMidnight = clampDateToMidnight(safeStart);
  const normalizedDay =
    typeof event.day === "number"
      ? event.day
      : typeof event.dayIndex === "number"
        ? event.dayIndex
        : Math.floor(
            (startMidnight.getTime() - rangeStart.getTime()) / MS_IN_DAY
          );

  if (normalizedDay < 0 || normalizedDay > 6) {
    return null;
  }

  return {
    ...event,
    dayIndex: normalizedDay,
    startDate: safeStart,
    endDate: safeEnd,
    attachedTaskBadges: [],
  };
};

const extractTimestamp = (value: unknown): number => {
  if (!value) {
    return Number.NaN;
  }

  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isNaN(time) ? Number.NaN : time;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? Number.NaN : parsed;
  }

  if (typeof value === "object") {
    const maybeTimestamp = value as {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof maybeTimestamp.toDate === "function") {
      const date = maybeTimestamp.toDate();
      const time = date?.getTime?.();
      return Number.isFinite(time) ? time : Number.NaN;
    }
    if (typeof maybeTimestamp.seconds === "number") {
      const millis =
        maybeTimestamp.seconds * 1000 +
        (typeof maybeTimestamp.nanoseconds === "number"
          ? maybeTimestamp.nanoseconds / 1_000_000
          : 0);
      return Number.isFinite(millis) ? millis : Number.NaN;
    }
  }

  return Number.NaN;
};

const getEventRecencyScore = (event: DisplayEventWithSource): number => {
  const candidates = [
    extractTimestamp((event as unknown as { updated_at?: unknown }).updated_at),
    extractTimestamp((event as unknown as { updatedAt?: unknown }).updatedAt),
    extractTimestamp((event as unknown as { created_at?: unknown }).created_at),
    extractTimestamp((event as unknown as { createdAt?: unknown }).createdAt),
  ];

  for (const value of candidates) {
    if (Number.isFinite(value)) {
      return value as number;
    }
  }

  if (typeof event.__sourceIndex === "number") {
    return event.__sourceIndex;
  }

  return -Infinity;
};

const dedupeEventsByRecency = (
  events: DisplayEventWithSource[]
): DisplayEvent[] => {
  const withRecency = events.map((event) => ({
    ...event,
    __recencyScore: getEventRecencyScore(event),
  }));

  const prioritized = withRecency.sort((a, b) => {
    const aScore = Number.isFinite(a.__recencyScore)
      ? (a.__recencyScore as number)
      : -Infinity;
    const bScore = Number.isFinite(b.__recencyScore)
      ? (b.__recencyScore as number)
      : -Infinity;
    if (bScore !== aScore) {
      return bScore - aScore;
    }
    const aIndex = typeof a.__sourceIndex === "number" ? a.__sourceIndex : -1;
    const bIndex = typeof b.__sourceIndex === "number" ? b.__sourceIndex : -1;
    return bIndex - aIndex;
  });

  const selected: DisplayEventWithSource[] = [];

  prioritized.forEach((event) => {
    const overlapsWithNewer = selected.some(
      (existing) =>
        existing.dayIndex === event.dayIndex &&
        rangesOverlap(
          existing.startDate,
          existing.endDate,
          event.startDate,
          event.endDate
        )
    );

    if (!overlapsWithNewer) {
      selected.push(event);
    }
  });

  const toDisplayEvent = ({
    __sourceIndex,
    __recencyScore,
    ...rest
  }: DisplayEventWithSource): DisplayEvent => {
    const basePriority = Number.isFinite(__recencyScore)
      ? (__recencyScore as number)
      : typeof __sourceIndex === "number"
        ? __sourceIndex
        : rest.startDate.getTime();

    return {
      ...(rest as DisplayEvent),
      displayPriority: basePriority,
    };
  };

  return selected
    .map(toDisplayEvent)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
};

const expandTaskOccurrences = (
  dateRange: DateRange,
  tasks: unknown[]
): TaskOccurrence[] => {
  const rangeStart = clampDateToMidnight(dateRange.from);
  const occurrences: TaskOccurrence[] = [];
  const occurrenceMap = new Map<string, TaskOccurrence>();

  tasks.forEach((taskRaw) => {
    if (!taskRaw || typeof taskRaw !== "object") return;
    const task = taskRaw as Partial<WeeklyTaskDefinition> &
      Partial<TaskOccurrence>;
    const taskRecord = task as Record<string, unknown>;
    const rawStatusValue =
      typeof task.status === "string"
        ? task.status
        : typeof taskRecord?.status === "string"
          ? (taskRecord.status as string)
          : undefined;
    const normalizedStatus = normalizeTaskStatus(rawStatusValue);
    const isTaskDone = task.done === true || taskRecord?.done === true;
    const taskWeekday = resolveDayIndex(
      taskRecord?.weekday ??
        taskRecord?.week_day ??
        taskRecord?.weekDay ??
        null,
      rangeStart
    );

    if (
      task.startDate instanceof Date &&
      task.endDate instanceof Date &&
      typeof task.dayIndex === "number"
    ) {
      const startDate = new Date(task.startDate);
      const endDate = new Date(task.endDate);
      if (
        isNaN(startDate.getTime()) ||
        isNaN(endDate.getTime()) ||
        endDate <= startDate
      ) {
        return;
      }
      if (taskWeekday !== -1 && taskWeekday !== task.dayIndex) {
        return;
      }
      const occId =
        task.occurrenceId ||
        `${task.taskId || task.id || "task"}_${task.dayIndex}_${startDate.getTime()}`;
      if (occurrenceMap.has(occId)) return;
      const occurrence: TaskOccurrence = {
        taskId: task.taskId || task.id || occId,
        occurrenceId: occId,
        dayIndex: task.dayIndex,
        weekday: taskWeekday !== -1 ? taskWeekday : task.dayIndex,
        startDate,
        endDate,
        label: task.label || "Tâche",
        color: task.color,
        icon: task.icon || "📋",
        price: task.price,
        readOnly: task.readOnly,
        attachedToEvent: false,
        priority: normalizeTaskPriority(task.priority),
        status: normalizedStatus ?? (isTaskDone ? "done" : undefined),
        done: isTaskDone,
      };
      occurrenceMap.set(occId, occurrence);
      occurrences.push(occurrence);
      return;
    }

    const timeRanges = Array.isArray(task.time_ranges)
      ? task.time_ranges
      : Array.isArray((task as WeeklyTaskDefinition).timeSlots)
        ? (task as WeeklyTaskDefinition).timeSlots
        : [];

    if (!timeRanges.length) {
      return;
    }

    timeRanges.forEach((range, index) => {
      const rawDay =
        (range as WeeklyTaskRange)?.day ??
        (range as Record<string, unknown>)?.dayIndex ??
        (range as Record<string, unknown>)?.day_index ??
        (range as Record<string, unknown>)?.dayOfWeek ??
        (range as Record<string, unknown>)?.day_of_week ??
        (range as Record<string, unknown>)?.weekday ??
        null;

      const parsedDayIndex = resolveDayIndex(rawDay, rangeStart);
      if (parsedDayIndex < 0 || parsedDayIndex > 6) {
        return;
      }

      if (taskWeekday !== -1 && taskWeekday !== parsedDayIndex) {
        return;
      }

      const dayDate = new Date(
        rangeStart.getTime() + parsedDayIndex * MS_IN_DAY
      );
      const startTime = parseTimeString(range?.start);
      const endTime = parseTimeString(range?.end);
      if (!startTime || !endTime) {
        return;
      }
      const startDate = addTimeToDate(dayDate, startTime);
      const endDate = addTimeToDate(dayDate, endTime);
      if (endDate <= startDate) {
        return;
      }

      const occId = [
        task.id || "task",
        parsedDayIndex,
        `${String(startTime.hours).padStart(2, "0")}${String(startTime.minutes).padStart(2, "0")}`,
        `${String(endTime.hours).padStart(2, "0")}${String(endTime.minutes).padStart(2, "0")}`,
        index,
      ].join("_");
      if (occurrenceMap.has(occId)) {
        return;
      }

      const occurrence: TaskOccurrence = {
        taskId: task.id || occId,
        occurrenceId: occId,
        dayIndex: parsedDayIndex,
        weekday: taskWeekday !== -1 ? taskWeekday : parsedDayIndex,
        startDate,
        endDate,
        label: task.label || "Tâche",
        color: task.color,
        icon: task.icon || "📋",
        price: task.price,
        readOnly: task.readOnly,
        attachedToEvent: false,
        priority: normalizeTaskPriority(task.priority),
        status: normalizedStatus ?? (isTaskDone ? "done" : undefined),
        done: isTaskDone,
      };
      occurrenceMap.set(occId, occurrence);
      occurrences.push(occurrence);
    });
  });

  occurrences.sort((a, b) => {
    const diff = a.startDate.getTime() - b.startDate.getTime();
    if (diff !== 0) return diff;
    return a.occurrenceId.localeCompare(b.occurrenceId);
  });

  return occurrences;
};

export const computeDisplayBlocks = (
  dateRange: DateRange,
  events: PlannerEventInput[] = [],
  tasks: unknown[] = []
): ComputeDisplayBlocksResult => {
  const rangeStart = clampDateToMidnight(dateRange.from);
  const normalizedEvents: DisplayEventWithSource[] = [];

  events.forEach((event, index) => {
    const normalized = normalizeEvent(event, rangeStart);
    if (normalized) {
      normalizedEvents.push({ ...normalized, __sourceIndex: index });
    }
  });

  const dedupedEvents = dedupeEventsByRecency(normalizedEvents);

  const occurrences = expandTaskOccurrences(dateRange, tasks);

  const displayEvents = dedupedEvents.map((event) => {
    const badges: AttachedTaskBadge[] = [];
    const seenOccurrences = new Set<string>();
    const seenTaskIds = new Set<string>();

    occurrences.forEach((occurrence) => {
      if (occurrence.dayIndex !== event.dayIndex) return;
      if (
        !rangesOverlap(
          event.startDate,
          event.endDate,
          occurrence.startDate,
          occurrence.endDate
        )
      )
        return;
      if (seenOccurrences.has(occurrence.occurrenceId)) return;

      seenOccurrences.add(occurrence.occurrenceId);
      occurrence.attachedToEvent = true;

      if (seenTaskIds.has(occurrence.taskId)) {
        return;
      }
      seenTaskIds.add(occurrence.taskId);

      const iconId =
        typeof occurrence.icon === "string" && occurrence.icon.trim() !== ""
          ? occurrence.icon.trim()
          : "briefcase";
      const label =
        typeof occurrence.label === "string" && occurrence.label.trim() !== ""
          ? occurrence.label.trim()
          : "Tâche";
      const price = normalizeBadgePrice(occurrence.price);

      badges.push({
        taskId: occurrence.taskId,
        iconId,
        label,
        price,
        color:
          typeof occurrence.color === "string" ? occurrence.color : undefined,
        priority: normalizeTaskPriority(occurrence.priority),
        status:
          occurrence.status === "todo" ||
          occurrence.status === "doing" ||
          occurrence.status === "done"
            ? occurrence.status
            : undefined,
        done: occurrence.done === true,
      });
    });

    return {
      ...event,
      attachedTaskBadges: badges,
    };
  });

  const unattached = occurrences.filter(
    (occurrence) => !occurrence.attachedToEvent
  );
  const groupsByDay = new Map<number, DisplayTaskGroup[]>();

  unattached.forEach((occurrence) => {
    if (occurrence.dayIndex < 0 || occurrence.dayIndex > 6) return;
    const dayGroups = groupsByDay.get(occurrence.dayIndex) || [];
    let targetGroup: DisplayTaskGroup | undefined = dayGroups.length
      ? dayGroups[dayGroups.length - 1]
      : undefined;

    if (
      !targetGroup ||
      !rangesOverlap(
        targetGroup.startDate,
        targetGroup.endDate,
        occurrence.startDate,
        occurrence.endDate
      )
    ) {
      targetGroup = {
        id: `group-${occurrence.dayIndex}-${occurrence.startDate.getTime()}`,
        dayIndex: occurrence.dayIndex,
        startDate: new Date(occurrence.startDate),
        endDate: new Date(occurrence.endDate),
        tasks: [],
        attachedToEvent: false,
      };
      dayGroups.push(targetGroup);
      groupsByDay.set(occurrence.dayIndex, dayGroups);
    }

    targetGroup.startDate =
      targetGroup.startDate.getTime() <= occurrence.startDate.getTime()
        ? targetGroup.startDate
        : new Date(occurrence.startDate);
    targetGroup.endDate =
      targetGroup.endDate.getTime() >= occurrence.endDate.getTime()
        ? targetGroup.endDate
        : new Date(occurrence.endDate);
    targetGroup.tasks.push(occurrence);
  });

  const displayTaskGroups: DisplayTaskGroup[] = [];
  Array.from(groupsByDay.entries())
    .sort((a, b) => a[0] - b[0])
    .forEach(([, groups]) => {
      groups.forEach((group) => {
        group.tasks.sort((a, b) =>
          a.occurrenceId.localeCompare(b.occurrenceId)
        );
        displayTaskGroups.push(group);
      });
    });

  return {
    displayEvents,
    displayTaskGroups,
  };
};

interface SelectDisplayModelArgs {
  dateRange: DateRange;
  events: PlannerEventInput[];
  tasks: unknown[];
}

export const selectDisplayModel = ({
  dateRange,
  events,
  tasks,
}: SelectDisplayModelArgs): ComputeDisplayBlocksResult => {
  return computeDisplayBlocks(dateRange, events, tasks);
};
