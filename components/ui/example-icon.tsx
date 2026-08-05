import * as React from 'react';

/** Small stroke icons shared by the example gallery, agent aside and Overview. */
export type ExampleIconName =
  | 'ai'
  | 'weather'
  | 'eth'
  | 'coin'
  | 'swap'
  | 'dice'
  | 'chart'
  | 'mail'
  | 'vote'
  | 'shield'
  | 'key'
  | 'gas'
  | 'globe'
  | 'mask'
  | 'sliders';

const EXAMPLE_ICON_PATHS: Record<ExampleIconName, React.ReactNode> = {
  ai: <path d="M8 1.8l1.4 3.6 3.6 1.4-3.6 1.4L8 11.8 6.6 8.2 3 6.8l3.6-1.4L8 1.8zM12.8 10.6l.7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7.7-1.7z" />,
  weather: <path d="M4.6 12.5a3.1 3.1 0 010-6.2 4.1 4.1 0 018-1h.6a2.6 2.6 0 010 5.2h-.7M4.6 12.5h7.9" />,
  eth: <path d="M8 1.5l4.5 6.5L8 14.5 3.5 8 8 1.5zM3.5 8h9" />,
  coin: <path d="M13.5 8a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0zM8 2.5v11" />,
  swap: <path d="M3 5.5h9.5L10 3M13 10.5H3.5L6 13" />,
  dice: <path d="M3.4 2.5h9.2a1 1 0 011 1v9.2a1 1 0 01-1 1H3.4a1 1 0 01-1-1V3.5a1 1 0 011-1zM5.7 5.7h.01M10.3 10.3h.01M10.3 5.7h.01M5.7 10.3h.01M8 8h.01" />,
  chart: <path d="M2.5 2.5v11h11M4.8 10.6l2.4-3 2 2 3.1-4.1" />,
  mail: <path d="M2.4 4h11.2a.9.9 0 01.9.9v6.2a.9.9 0 01-.9.9H2.4a.9.9 0 01-.9-.9V4.9a.9.9 0 01.9-.9zM2 5l6 4.3L14 5" />,
  vote: <path d="M4 7h8l1.8 3.5v3H2.2v-3L4 7zM2.2 10.5h11.6M5.6 4.9l2 2 3.6-4" />,
  shield: <path d="M8 1.5l5 1.9v3.8c0 3.4-2.1 5.8-5 7.3-2.9-1.5-5-3.9-5-7.3V3.4l5-1.9zM5.8 7.9l1.6 1.6 2.9-3.2" />,
  key: <path d="M7.3 8a2.7 2.7 0 11-2.7-2.7A2.7 2.7 0 017.3 8zM7.3 8h6.2M11 8v2.3M13.5 8v1.6" />,
  gas: <path d="M3.5 2.5h4.4a1 1 0 011 1v10H2.5v-10a1 1 0 011-1zM2 13.5h8.4M4.3 4.8h2.8M8.9 6.7h1.4a.9.9 0 01.9.9v3.3a1.15 1.15 0 002.3 0V6.4L11.6 4.5" />,
  globe: <path d="M13.5 8a5.5 5.5 0 11-11 0 5.5 5.5 0 0111 0zM2.5 8h11M8 2.5c1.9 2.4 1.9 8.6 0 11M8 2.5c-1.9 2.4-1.9 8.6 0 11" />,
  mask: <path d="M2.5 2.5l11 11M4.9 4.9C3.6 5.7 2.6 6.9 2 8c1.2 2.2 3.4 4 6 4 .9 0 1.8-.2 2.6-.6M6.9 3.4c.4-.1.7-.1 1.1-.1 2.6 0 4.8 1.8 6 4.7-.3.6-.7 1.2-1.2 1.7" />,
  sliders: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11M6.2 4.5a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0zM12 8a1.2 1.2 0 11-2.4 0A1.2 1.2 0 0112 8zM7.5 11.5a1.2 1.2 0 11-2.4 0 1.2 1.2 0 012.4 0z" />,
};

export function ExampleIcon({ name }: { name: ExampleIconName }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
      aria-hidden="true"
    >
      {EXAMPLE_ICON_PATHS[name]}
    </svg>
  );
}
