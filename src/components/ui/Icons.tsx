import type { SVGProps } from "react";

/**
 * The dashboard's icon set, drawn inline.
 *
 * Every glyph is on the same 24px grid at the same 1.75 stroke weight and takes
 * `currentColor`, so an icon always matches the text it sits beside and no icon
 * needs a colour prop. Inline rather than a package: the app uses a dozen
 * glyphs, and a dozen paths cost less than a dependency plus its tree-shaking
 * caveats.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Decorative by default: these sit next to their own label almost
      // everywhere. The few standalone uses pass an aria-label and override it.
      aria-hidden="true"
      focusable="false"
      className="size-[1.15em] shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconDirectory(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </Icon>
  );
}

export function IconApprovals(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 11.5 11.2 14 15.5 9" />
      <path d="M12 3.5 5 6.5v5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9v-5l-7-3Z" />
    </Icon>
  );
}

export function IconUserPlus(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M18.5 7v6M21.5 10h-6" />
    </Icon>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.7-4.7" />
    </Icon>
  );
}

export function IconSort(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 4v16M7 20l-3-3M7 20l3-3" />
      <path d="M17 20V4M17 4l-3 3M17 4l3 3" />
    </Icon>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function IconArrowUp(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 19V5M12 5l-6 6M12 5l6 6" />
    </Icon>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function IconSync(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20 4v4.5h-4.5" />
    </Icon>
  );
}

export function IconDownload(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5v11M12 14.5 8 10.5M12 14.5l4-4" />
      <path d="M4.5 17v1.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V17" />
    </Icon>
  );
}

export function IconFilter(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5h16l-6.2 7.3V19l-3.6-2v-4.7L4 5Z" />
    </Icon>
  );
}

export function IconSignOut(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M14.5 4.5h-7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" />
      <path d="M15 12h6.5M21.5 12l-3-3M21.5 12l-3 3" />
    </Icon>
  );
}

export function IconExternal(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13.5 4.5H19.5V10.5" />
      <path d="m19.5 4.5-8 8" />
      <path d="M18 14.5v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2h4" />
    </Icon>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function IconAlert(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16h.01" />
    </Icon>
  );
}

export function IconSwap(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h13M17 8l-3.5-3.5M17 8l-3.5 3.5" />
      <path d="M20 16H7M7 16l3.5-3.5M7 16l3.5 3.5" />
    </Icon>
  );
}

export function IconPower(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3.5v8" />
      <path d="M6.8 6.8a7.5 7.5 0 1 0 10.4 0" />
    </Icon>
  );
}

export function IconClock(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </Icon>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.5 8.5 0 1 0 10.2 10.2Z" />
    </Icon>
  );
}

export function IconBell(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 9a6 6 0 0 1 12 0c0 3.2.6 5 1.5 6h-15C5.4 14 6 12.2 6 9Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    </Icon>
  );
}

export function IconInbox(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4" />
      <path d="M5.6 5.5h12.8l2.1 8v3.5a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2V13.5l2.1-8Z" />
    </Icon>
  );
}

/*
 * Form-field glyphs.
 *
 * One per kind of thing being asked for, never one per field: "Nama depan" and
 * "Nama belakang" are both a person and share a mark. An icon that differs
 * where the meaning does not is noise wearing a uniform.
 */

export function IconUser(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </Icon>
  );
}

/** The full name as it appears in the directory — a record, not a person. */
export function IconIdCard(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16a3.2 3.2 0 0 1 6 0" />
      <path d="M14.5 10h4M14.5 13.5h4" />
    </Icon>
  );
}

export function IconMail(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </Icon>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18" />
    </Icon>
  );
}

export function IconBuilding(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20V5.5a1.5 1.5 0 0 1 1.5-1.5h7A1.5 1.5 0 0 1 14 5.5V20" />
      <path d="M14 10h4.5a1.5 1.5 0 0 1 1.5 1.5V20" />
      <path d="M3 20h18" />
      <path d="M7 8h4M7 11.5h4M7 15h4M17 14h.01M17 17h.01" />
    </Icon>
  );
}

/** The approver: a person carrying authority, not just any person. */
export function IconUserCheck(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="m16.5 11.5 2 2 4-4" />
    </Icon>
  );
}

export function IconNote(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 4.5h14v15H5z" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
    </Icon>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}
