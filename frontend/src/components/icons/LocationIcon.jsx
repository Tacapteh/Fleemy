import React from 'react';

export function LocationIcon({ className = '', ...props }) {
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
      <path d="M12 21c-4.5-5.25-6.75-8.25-6.75-11.25a6.75 6.75 0 1 1 13.5 0c0 3-2.25 6-6.75 11.25z" />
      <circle cx={12} cy={9.75} r={2.25} />
    </svg>
  );
}
