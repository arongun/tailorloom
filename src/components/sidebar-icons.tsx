interface IconProps {
  className?: string;
  strokeWidth?: number;
}

export function DashboardIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g className="sb-dash-bar sb-dash-bar-1">
        <rect width="7" height="9" x="3" y="3" rx="1" />
      </g>
      <g className="sb-dash-bar sb-dash-bar-2">
        <rect width="7" height="5" x="14" y="3" rx="1" />
      </g>
      <g className="sb-dash-bar sb-dash-bar-3">
        <rect width="7" height="9" x="14" y="12" rx="1" />
      </g>
      <g className="sb-dash-bar sb-dash-bar-4">
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </g>
    </svg>
  );
}

export function CustomersIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g className="sb-users-heads">
        <circle className="sb-cu-head1" cx="9" cy="7" r="4" />
        <path className="sb-cu-head2" d="M16 3.128a4 4 0 0 1 0 7.744" />
      </g>
      <g className="sb-users-bodies">
        <path className="sb-cu-body1" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <path className="sb-cu-body2" d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </g>
    </svg>
  );
}

export function UploadIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g className="sb-upload-arrow">
        <path className="sb-ul-line" d="M12 3v12" />
        <path className="sb-ul-chev" d="M17 8 12 3 7 8" />
      </g>
      <g className="sb-upload-tray">
        <path className="sb-ul-tray" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      </g>
    </svg>
  );
}

export function ImportsIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g className="sb-history-circle">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </g>
      <g className="sb-history-hands">
        <path d="M12 7v5l4 2" />
      </g>
    </svg>
  );
}

export function ConflictsIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g className="sb-alert-all">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </g>
    </svg>
  );
}

export function SunIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g className="sb-sun-center">
        <circle cx="12" cy="12" r="4" />
      </g>
      <g className="sb-sun-rays">
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </g>
    </svg>
  );
}

export function MoonIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g className="sb-moon-all">
        <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
      </g>
    </svg>
  );
}

export function LogOutIcon({ className, strokeWidth = 2 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g className="sb-logout-door">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      </g>
      <g className="sb-logout-arrow">
        <path className="sb-lo-chev" d="M16 17 21 12 16 7" />
        <path className="sb-lo-line" d="M21 12H9" />
      </g>
    </svg>
  );
}
