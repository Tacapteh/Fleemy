import WeeklyTaskForm from './WeeklyTaskForm';

export default function WeeklyTaskModal({
  isOpen,
  task,
  onSave,
  onDelete,
  onClose,
  context,
  readOnly,
  weekStartISO,
  defaultDayIndex = null,
  onSwitchToEvent,
  onReturnToLinkedTasks,
  linkedTasks = [],
  initialLinkedTaskId = null,
  onLinkedTaskSelectionChange,
  availableTasks = [],
}) {
  if (!isOpen) return null;

  const handleSave = (savedTask) => {
    if (onSave) {
      onSave(savedTask);
    }
  };

  return (
    <WeeklyTaskForm
      initialTask={task}
      context={context}
      readOnly={readOnly}
      weekStartISO={weekStartISO}
      defaultDayIndex={defaultDayIndex}
      onSave={handleSave}
      onCancel={onClose}
      onDelete={onDelete}
      onSwitchToEvent={onSwitchToEvent}
      onReturnToLinkedTasks={onReturnToLinkedTasks}
      linkedTasks={linkedTasks}
      initialLinkedTaskId={initialLinkedTaskId}
      onLinkedTaskSelectionChange={onLinkedTaskSelectionChange}
      availableTasks={availableTasks}
    />
  );
}
