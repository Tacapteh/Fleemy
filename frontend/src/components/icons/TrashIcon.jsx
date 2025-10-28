import React from 'react';

export function TrashIcon({ className = '', ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M6.75 8.25v9A1.5 1.5 0 0 0 8.25 18.75h7.5A1.5 1.5 0 0 0 17.25 17.25v-9" />
      <path d="M5.25 6.75h13.5" />
      <path d="M9.75 6.75V5.25a1.5 1.5 0 0 1 1.5-1.5h1.5a1.5 1.5 0 0 1 1.5 1.5v1.5" />
      <path d="M10.5 11.25v4.5" />
      <path d="M13.5 11.25v4.5" />
    </svg>
  );
}
