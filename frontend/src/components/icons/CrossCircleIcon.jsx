import React from 'react';

export function CrossCircleIcon({ className = '', ...props }) {
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
      <circle cx={12} cy={12} r={8.25} />
      <path d="M9.75 9.75 14.25 14.25" />
      <path d="M14.25 9.75 9.75 14.25" />
    </svg>
  );
}
