export type UIEventName = 'openTaskModal' | 'confirmDeleteTask';

type UIEventHandlers = {
  openTaskModal: (taskId: string) => void;
  confirmDeleteTask: (taskId: string) => void;
};

type ListenerMap = {
  [K in UIEventName]: Set<UIEventHandlers[K]>;
};

const listeners: ListenerMap = {
  openTaskModal: new Set(),
  confirmDeleteTask: new Set(),
};

const emit = <K extends UIEventName>(eventName: K, taskId: string) => {
  listeners[eventName].forEach((listener) => {
    try {
      listener(taskId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Erreur lors de l'exécution du listener ${eventName}`, error);
    }
  });
};

export const subscribeToUIEvent = <K extends UIEventName>(
  eventName: K,
  listener: UIEventHandlers[K]
): (() => void) => {
  listeners[eventName].add(listener);
  return () => {
    listeners[eventName].delete(listener);
  };
};

export const openTaskModal = (taskId: string) => {
  emit('openTaskModal', taskId);
};

export const confirmDeleteTask = (taskId: string) => {
  emit('confirmDeleteTask', taskId);
};
