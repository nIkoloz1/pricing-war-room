// Minimal outline icons (24×24 grid, 2px stroke). Never filled.
const PATHS = {
  briefcase: 'M4 8h16v11H4z M9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8 M4 13h16',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12 M18 6L6 18',
  lock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  unlock: 'M6 11h12v9H6z M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  download: 'M12 4v11 M7.5 10.5L12 15l4.5-4.5 M5 19h14',
  expand: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  play: 'M8 5.5v13l10-6.5z',
  pause: 'M8.5 5v14 M15.5 5v14',
  plus: 'M12 5v14 M5 12h14',
  arrowRight: 'M5 12h14 M13 6l6 6-6 6',
  arrowUp: 'M12 19V5 M6 11l6-6 6 6',
  arrowDown: 'M12 5v14 M6 13l6 6 6-6',
  minus: 'M6 12h12',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  sheet: 'M6 3.5h9l3 3v14H6z M9 10h6 M9 14h6 M9 18h4',
  refresh: 'M4.5 12a7.5 7.5 0 0 1 13-5.1 M19.5 12a7.5 7.5 0 0 1-13 5.1 M17.5 3.5v3.4h-3.4 M6.5 20.5v-3.4h3.4',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 'md', label }: { name: IconName; size?: 'sm' | 'md'; label?: string }) {
  return (
    <svg
      className={`ico${size === 'sm' ? ' sm' : ''}`}
      viewBox="0 0 24 24"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
