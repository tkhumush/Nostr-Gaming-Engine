export function BoltIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" fill="currentColor" />
    </svg>
  );
}

export function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="10" width="16" height="12" rx="2" fill="currentColor" />
      <path
        d="M7 10V7a5 5 0 1 1 10 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function KeyIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="15" r="5" fill="currentColor" />
      <circle cx="8" cy="15" r="2" fill="#1a1a2e" />
      <rect x="12" y="13" width="10" height="4" rx="1" fill="currentColor" />
      <rect x="18" y="17" width="2" height="3" fill="currentColor" />
      <rect x="14" y="17" width="2" height="2" fill="currentColor" />
    </svg>
  );
}

export function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"
        fill="currentColor"
      />
      <circle cx="12" cy="13" r="4" fill="#1a1a2e" />
    </svg>
  );
}

export function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5" y="4" width="14" height="18" rx="2" fill="currentColor" />
      <rect
        x="8"
        y="2"
        width="8"
        height="4"
        rx="1"
        fill="currentColor"
        stroke="#1a1a2e"
        strokeWidth="1.5"
      />
    </svg>
  );
}
