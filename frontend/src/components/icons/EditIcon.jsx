import React from 'react';

export function EditIcon({ className = '', ...props }) {
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
      <path d="M15.53 5.03 18.97 8.47 9.44 18H6v-3.44l9.53-9.53z" />
      <path d="M13.5 6.75 17.25 10.5" />
    </svg>
  );
}
