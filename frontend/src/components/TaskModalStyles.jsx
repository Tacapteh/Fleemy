import React from 'react';

const TaskModalStyles = () => (
  <style>{`
    .task-form-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      z-index: 1000;
    }

    .task-form-modal {
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 35%);
      border-radius: 16px;
      width: min(640px, 100%);
      max-height: 88vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 40px 80px rgba(15, 23, 42, 0.18);
      border: 1px solid rgba(148, 163, 184, 0.35);
      animation: task-form-pop 0.25s ease-out;
    }

    .task-form-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 24px 28px;
      border-bottom: 1px solid #e2e8f0;
      position: sticky;
      top: 0;
      background: rgba(248, 250, 252, 0.95);
      backdrop-filter: blur(6px);
      z-index: 1;
    }

    .task-form-header h3 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: #0f172a;
    }

    .task-form-close {
      background: none;
      border: none;
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      color: #64748b;
      border-radius: 9999px;
      padding: 4px 8px;
      transition: background 0.15s ease-in-out, color 0.15s ease-in-out;
    }

    .task-form-close:hover {
      background: rgba(148, 163, 184, 0.12);
      color: #334155;
    }

    .task-form {
      flex: 1;
      padding: 28px;
      display: flex;
      flex-direction: column;
      gap: 20px;
      overflow-y: auto;
      background: #ffffff;
    }

    .task-form-info {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid rgba(59, 130, 246, 0.25);
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 0.95rem;
    }

    .task-form-error {
      background: #fee2e2;
      color: #b91c1c;
      border: 1px solid #fecaca;
      border-radius: 10px;
      padding: 12px 16px;
      font-weight: 500;
    }

    .task-form-field {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .task-form-field label {
      font-weight: 600;
      color: #1f2937;
      font-size: 0.95rem;
    }

    .task-form-field input,
    .task-form-field textarea,
    .task-form-field select {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.95rem;
      transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
    }

    .task-form-field textarea {
      resize: vertical;
      min-height: 96px;
    }

    .task-form-field input:focus,
    .task-form-field textarea:focus,
    .task-form-field select:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }

    .task-form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .task-form-icons,
    .task-form-colors {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .task-form-icon {
      background: #f3f4f6;
      border: 2px solid transparent;
      border-radius: 10px;
      padding: 10px;
      cursor: pointer;
      font-size: 18px;
      transition: all 0.15s ease-in-out;
      min-width: 44px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .task-form-icon:hover {
      background: #e5e7eb;
    }

    .task-form-icon.selected {
      border-color: #3b82f6;
      background: #dbeafe;
    }

    .task-form-color {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3px solid transparent;
      cursor: pointer;
      transition: transform 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
    }

    .task-form-color:hover {
      transform: scale(1.05);
    }

    .task-form-color.selected {
      border-color: #1f2937;
      box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.15);
    }

    .task-form-icon:disabled,
    .task-form-color:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .task-form-icon.selected:disabled,
    .task-form-color.selected:disabled {
      opacity: 0.65;
    }

    .task-form-helper {
      margin-top: 6px;
      font-size: 0.85rem;
      color: #64748b;
    }

    .time-ranges-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .time-range-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #f8fafc;
    }

    .time-range-controls {
      display: grid;
      grid-template-columns: minmax(120px, 1.2fr) auto minmax(120px, 1.2fr);
      gap: 12px;
      align-items: center;
      flex: 1;
    }

    .day-select,
    .time-input {
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.95rem;
      background: #ffffff;
      transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
    }

    .day-select:focus,
    .time-input:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    .time-separator {
      color: #64748b;
      font-weight: 600;
      text-align: center;
    }

    .remove-range {
      background: #fee2e2;
      color: #b91c1c;
      border: none;
      width: 34px;
      height: 34px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.25rem;
      line-height: 1;
      transition: background 0.15s ease-in-out, color 0.15s ease-in-out;
    }

    .remove-range:hover:not(:disabled) {
      background: #fecaca;
      color: #7f1d1d;
    }

    .remove-range:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .add-range {
      margin-top: 8px;
      align-self: flex-start;
      background: #f3f4f6;
      color: #1f2937;
      border: 1px dashed #cbd5f5;
      border-radius: 9999px;
      padding: 8px 16px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease-in-out;
    }

    .add-range:hover:not(:disabled) {
      background: #e0e7ff;
      border-color: #818cf8;
      color: #312e81;
    }

    .add-range:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .task-form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }

    .color-preview {
      margin-top: 8px;
      width: 100%;
      height: 44px;
      border-radius: 10px;
      border: 1px solid rgba(148, 163, 184, 0.4);
    }

    .task-form-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-top: 8px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
    }

    .task-form-actions-right {
      display: flex;
      gap: 12px;
    }

    .task-form-cancel {
      background: #f3f4f6;
      color: #1f2937;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.15s ease-in-out, color 0.15s ease-in-out;
    }

    .task-form-cancel:hover:not(:disabled) {
      background: #e5e7eb;
    }

    .task-form-delete {
      background: #ef4444;
      color: #ffffff;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(239, 68, 68, 0.25);
      transition: filter 0.15s ease-in-out;
    }

    .task-form-delete:hover:not(:disabled) {
      filter: brightness(0.95);
    }

    .task-form-save,
    .task-form-submit {
      background: #3b82f6;
      color: #ffffff;
      border: none;
      padding: 10px 24px;
      border-radius: 9999px;
      cursor: pointer;
      font-weight: 600;
      box-shadow: 0 10px 30px rgba(59, 130, 246, 0.25);
      transition: transform 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
    }

    .task-form-save:hover:not(:disabled),
    .task-form-submit:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 12px 34px rgba(59, 130, 246, 0.3);
    }

    .task-form-save:disabled,
    .task-form-submit:disabled {
      background: #9ca3af;
      cursor: not-allowed;
      box-shadow: none;
    }

    @media (max-width: 640px) {
      .task-form-modal {
        width: 100%;
        height: 100%;
        max-height: none;
        border-radius: 0;
      }

      .task-form {
        padding: 20px;
      }

      .time-range-item {
        flex-direction: column;
        align-items: stretch;
      }

      .time-range-controls {
        grid-template-columns: 1fr;
      }

      .task-form-actions {
        flex-direction: column-reverse;
        align-items: stretch;
      }

      .task-form-actions-right {
        justify-content: flex-end;
      }
    }

    @keyframes task-form-pop {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
  `}</style>
);

export default TaskModalStyles;
