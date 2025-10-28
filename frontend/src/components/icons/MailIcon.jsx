import React from 'react';

export function MailIcon({ className = '', ...props }) {
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
      <rect x={3.75} y={6.75} width={16.5} height={10.5} rx={2} />
      <path d="M5.25 8.25 12 13.5l6.75-5.25" />
    </svg>
  );
}
