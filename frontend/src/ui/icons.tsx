import type { ComponentProps, ReactNode } from "react";

/*
 * Inline SVG icons (never imported .svg files: small ones become data: URIs, which the CSP blocks).
 * Shapes follow Lucide (https://lucide.dev), ISC License, Copyright (c) Lucide Contributors.
 */

export type IconProps = Omit<ComponentProps<"svg">, "children"> & {
  size?: 16 | 20;
};

function make(name: string, paths: ReactNode) {
  function Icon({ size = 20, ...rest }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...rest}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const PlusIcon = make("PlusIcon", <path d="M5 12h14M12 5v14" />);
export const ListIcon = make(
  "ListIcon",
  <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
);
export const ArchiveIcon = make(
  "ArchiveIcon",
  <>
    <rect width="20" height="5" x="2" y="3" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4" />
  </>,
);
export const UserIcon = make(
  "UserIcon",
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);
export const SlidersIcon = make(
  "SlidersIcon",
  <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
);
export const SunIcon = make(
  "SunIcon",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>,
);
export const MoonIcon = make(
  "MoonIcon",
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
);
export const MonitorIcon = make(
  "MonitorIcon",
  <>
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </>,
);
export const LogOutIcon = make(
  "LogOutIcon",
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
);
export const ShieldIcon = make(
  "ShieldIcon",
  <path d="M20 13c0 5-3.5 7.5-7.7 8.9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1Z" />,
);
export const SearchIcon = make(
  "SearchIcon",
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </>,
);
export const FilterIcon = make(
  "FilterIcon",
  <path d="M22 3H2l8 9.5V19l4 2v-8.5Z" />,
);
export const SortUpIcon = make(
  "SortUpIcon",
  <path d="m5 12 7-7 7 7M12 19V5" />,
);
export const SortDownIcon = make(
  "SortDownIcon",
  <path d="M12 5v14M19 12l-7 7-7-7" />,
);
export const ChevronUpIcon = make("ChevronUpIcon", <path d="m18 15-6-6-6 6" />);
export const ChevronDownIcon = make(
  "ChevronDownIcon",
  <path d="m6 9 6 6 6-6" />,
);
export const ChevronLeftIcon = make(
  "ChevronLeftIcon",
  <path d="m15 18-6-6 6-6" />,
);
export const ChevronRightIcon = make(
  "ChevronRightIcon",
  <path d="m9 18 6-6-6-6" />,
);
export const XIcon = make("XIcon", <path d="M18 6 6 18M6 6l12 12" />);
export const CheckIcon = make("CheckIcon", <path d="M20 6 9 17l-5-5" />);
export const MoreIcon = make(
  "MoreIcon",
  <>
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
    <circle cx="5" cy="12" r="1" />
  </>,
);
export const ForkKnifeIcon = make(
  "ForkKnifeIcon",
  <path d="M7 2v20M3 2v7c0 1.7 1.8 3 4 3s4-1.3 4-3V2M17 22V2c-2.5 1-4 4-4 8s1.5 6 4 6" />,
);
export const BusIcon = make(
  "BusIcon",
  <>
    <path d="M8 6v6M16 6v6M2 12h19.6M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />
    <circle cx="7" cy="18" r="2" />
    <path d="M9 18h5" />
    <circle cx="16" cy="18" r="2" />
  </>,
);
export const ReceiptIcon = make(
  "ReceiptIcon",
  <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1ZM16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 17.5v-11" />,
);
export const TicketIcon = make(
  "TicketIcon",
  <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM13 5v2M13 17v2M13 11v2" />,
);
export const DevicesIcon = make(
  "DevicesIcon",
  <>
    <path d="M22 8V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8M12 20h-2" />
    <rect width="6" height="10" x="16" y="10" rx="1" />
  </>,
);
export const AlertIcon = make(
  "AlertIcon",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </>,
);
