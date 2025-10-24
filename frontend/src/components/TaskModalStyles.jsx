import React from 'react';

const TaskModalStyles = () => (
  <style>{`
    .weekly-task-modal {
      max-width: 640px;
      width: 100%;
    }

    .weekly-task-header {
      margin-bottom: 24px;
    }

    .weekly-task-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: #212529;
    }

    .weekly-task-form {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .weekly-task-fieldset {
      border: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .weekly-task-alert {
      border-radius: 8px;
      padding: 12px 16px;
      font-size: 14px;
      line-height: 1.5;
    }

    .weekly-task-alert-info {
      background: #e9f5ff;
      border: 1px solid #b6daff;
      color: #0b5ed7;
    }

    .weekly-task-alert-error {
      background: #fde2e1;
      border: 1px solid #f1aeb5;
      color: #b02a37;
    }

    .weekly-task-hint {
      display: block;
      margin-top: 6px;
      font-size: 12px;
      color: #6c757d;
    }

    .weekly-task-hint-inline {
      font-size: 12px;
      color: #6c757d;
      font-weight: 400;
    }

    .weekly-task-time-ranges {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .weekly-task-range {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
    }

    .weekly-task-range-controls {
      flex: 1;
      display: grid;
      grid-template-columns: minmax(140px, 1.3fr) auto minmax(140px, 1.3fr);
      gap: 12px;
      align-items: center;
    }

    .weekly-task-range-controls .form-input {
      margin: 0;
    }

    .weekly-task-separator {
      font-weight: 600;
      color: #6c757d;
      text-align: center;
    }

    .weekly-task-remove {
      background: #f8d7da;
      color: #b02a37;
      border: none;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      transition: background 0.2s ease, color 0.2s ease;
    }

    .weekly-task-remove:not(:disabled):hover {
      background: #f1aeb5;
      color: #842029;
    }

    .weekly-task-remove:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .weekly-task-add {
      margin-top: 8px;
    }

    .weekly-task-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }

    .weekly-task-icon-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .weekly-task-icon-button {
      background: #f1f3f5;
      border: 2px solid transparent;
      border-radius: 10px;
      width: 44px;
      height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .weekly-task-icon-button:hover {
      background: #e9ecef;
    }

    .weekly-task-icon-button.is-selected {
      border-color: #0d6efd;
      background: #dbeafe;
      color: #0d6efd;
    }

    .weekly-task-icon-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .weekly-task-color-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .weekly-task-color-swatch {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3px solid transparent;
      cursor: pointer;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .weekly-task-color-swatch:hover {
      transform: scale(1.05);
    }

    .weekly-task-color-swatch.is-selected {
      border-color: #212529;
      box-shadow: 0 0 0 3px rgba(33, 37, 41, 0.18);
    }

    .weekly-task-color-swatch:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .weekly-task-color-preview {
      margin-top: 10px;
      height: 44px;
      border-radius: 10px;
      border: 1px solid rgba(206, 212, 218, 0.8);
    }

    .weekly-task-color-label {
      display: block;
      margin-top: 6px;
      font-size: 13px;
      color: #495057;
    }

    .weekly-task-actions {
      justify-content: space-between;
      align-items: center;
    }

    .weekly-task-actions .action-group {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    @media (max-width: 600px) {
      .weekly-task-modal {
        max-width: 100%;
      }

      .weekly-task-range {
        flex-direction: column;
        align-items: stretch;
      }

      .weekly-task-range-controls {
        grid-template-columns: 1fr;
      }

      .weekly-task-separator {
        display: none;
      }

      .weekly-task-actions {
        flex-direction: column-reverse;
        align-items: stretch;
      }

      .weekly-task-actions .action-group {
        justify-content: flex-end;
      }
    }
  `}</style>
);

export default TaskModalStyles;
