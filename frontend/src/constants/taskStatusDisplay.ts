import type React from 'react';
import { TaskTodoIcon, TaskDoingIcon, TaskDoneIcon } from '../components/icons/TaskStatusIcons';

export type TaskStatusKey = 'todo' | 'doing' | 'done';

export interface TaskStatusDisplayConfig {
  label: string;
  srLabel: string;
  iconComponent: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconClass: string;
  chipClass: string;
}

export interface TaskStatusIndicatorStyle {
  backgroundColor: string;
  borderColor: string;
}

export const TASK_STATUS_DISPLAY: Record<TaskStatusKey, TaskStatusDisplayConfig> = {
  todo: {
    label: 'À faire',
    srLabel: 'Tâche à faire',
    iconComponent: TaskTodoIcon,
    iconClass: 'text-slate-400 dark:text-slate-300',
    chipClass:
      'bg-slate-500/10 text-slate-300 border border-slate-500/30 dark:bg-slate-500/20 dark:text-slate-200 dark:border-slate-500/40',
  },
  doing: {
    label: 'En cours',
    srLabel: 'Tâche en cours',
    iconComponent: TaskDoingIcon,
    iconClass: 'text-amber-300',
    chipClass:
      'bg-amber-500/10 text-amber-300 border border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200 dark:border-amber-500/40',
  },
  done: {
    label: 'Terminé',
    srLabel: 'Tâche terminée',
    iconComponent: TaskDoneIcon,
    iconClass: 'text-emerald-400',
    chipClass:
      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/40',
  },
};

export const TASK_STATUS_INDICATOR_STYLES: Record<TaskStatusKey, TaskStatusIndicatorStyle> = {
  todo: {
    backgroundColor: '#cbd5f5',
    borderColor: 'rgba(148, 163, 184, 0.9)',
  },
  doing: {
    backgroundColor: '#fcd34d',
    borderColor: 'rgba(245, 158, 11, 0.9)',
  },
  done: {
    backgroundColor: '#34d399',
    borderColor: 'rgba(5, 150, 105, 0.9)',
  },
};

export const normalizeTaskStatusKey = (value?: string | null): TaskStatusKey | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'todo' || normalized === 'doing' || normalized === 'done') {
    return normalized;
  }
  return undefined;
};

export const resolveEffectiveTaskStatus = (
  value?: string | null,
  done?: boolean,
): TaskStatusKey => {
  const normalized = normalizeTaskStatusKey(value);
  if (normalized) {
    return normalized;
  }
  return done ? 'done' : 'todo';
};
