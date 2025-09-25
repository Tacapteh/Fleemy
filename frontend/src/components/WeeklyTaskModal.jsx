import WeeklyTaskForm from './WeeklyTaskForm';

export default function WeeklyTaskModal({ isOpen, task, onSave, onDelete, onClose }) {
  if (!isOpen) return null;
  return (
    <WeeklyTaskForm
      initialTask={task}
      onSave={onSave}
      onCancel={onClose}
      onDelete={onDelete}
    />
  );
}