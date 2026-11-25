import type { SVGProps } from 'react';

// Tiny dependency-free icon set (stroke icons, 24px grid).
const PATHS = {
  building: 'M4 21V5l8-2v18M12 8h8v13M7 9h2M7 13h2M7 17h2M15 12h2M15 16h2M3 21h18',
  branch: 'M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9c0 5-12 2-12 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v1M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 19v-1a4 4 0 0 0-3-3.9M16 4.2a3.5 3.5 0 0 1 0 6.6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  fit: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M9 9h6v6H9z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  pencil: 'M4 20l1-4L16 5l3 3L8 19zM14 7l3 3',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  filter: 'M4 7h16M7 12h10M10 17h4',
  check: 'M5 12l5 5 9-10',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 12h17M12 3c2.4 2.6 3.7 5.7 3.7 9s-1.3 6.4-3.7 9c-2.4-2.6-3.7-5.7-3.7-9S9.6 5.6 12 3z',
  help: 'M9.2 9.2a3 3 0 0 1 5.7 1c0 2-2.9 2.6-2.9 4M12 17.2h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  user: 'M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1',
  layers: 'M12 3.5 21 8l-9 4.5L3 8l9-4.5zM4.5 12.5 12 16.2l7.5-3.7M4.5 16.5 12 20.2l7.5-3.7',
  arrowUpRight: 'M7.5 16.5 16.5 7.5M9 7.5h7.5V15',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  switcher: 'M8.5 9.5 12 6l3.5 3.5M8.5 14.5 12 18l3.5-3.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'dots' ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
