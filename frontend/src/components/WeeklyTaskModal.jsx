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
    />
  );
}
