'use client';

import { useId, type ReactNode } from 'react';

/** Original XP-style icons drawn for hood.exe (no Microsoft assets). 32-unit grid, scaled by `size`. */
export type IconProps = { size?: number; className?: string };

function Svg({ size = 32, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      {children}
    </svg>
  );
}

const gid = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, '');

/** The hood.exe brand mark (a raster, unlike the drawn icons below). 256px source, rounded like an app tile. */
export function HoodLogo({ size = 32, className }: IconProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static asset; skips the image optimizer
    <img
      src="/image/hood-exe-logo-256.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
      style={{ borderRadius: Math.round(size * 0.16), flexShrink: 0 }}
    />
  );
}

export function LaunchIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}body`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c9d3df" />
          <stop offset=".45" stopColor="#ffffff" />
          <stop offset="1" stopColor="#9aa8b8" />
        </linearGradient>
        <radialGradient id={`${id}fl`} cx=".5" cy=".2" r=".8">
          <stop offset="0" stopColor="#fff6b0" />
          <stop offset=".45" stopColor="#ffb300" />
          <stop offset="1" stopColor="#ff5a00" />
        </radialGradient>
      </defs>
      <path d="M12.5 23 Q16 31.5 19.5 23 Z" fill={`url(#${id}fl)`} stroke="#c94a00" strokeWidth=".6" />
      <path d="M11 17 L6.5 23 L11.5 22 Z" fill="#d93a1a" stroke="#7a1a07" strokeWidth=".7" strokeLinejoin="round" />
      <path d="M21 17 L25.5 23 L20.5 22 Z" fill="#d93a1a" stroke="#7a1a07" strokeWidth=".7" strokeLinejoin="round" />
      <path
        d="M16 2 C20.5 5.5 22 11 21 23 H11 C10 11 11.5 5.5 16 2 Z"
        fill={`url(#${id}body)`}
        stroke="#4a5868"
        strokeLinejoin="round"
      />
      <path d="M13.3 6.5 Q16 3.6 18.7 6.5 Z" fill="#d93a1a" />
      <circle cx="16" cy="12" r="3" fill="#3d8bea" stroke="#1d4f99" />
      <circle cx="15" cy="11" r="1" fill="#fff" opacity=".8" />
      <rect x="14.6" y="20.5" width="2.8" height="2.5" fill="#d93a1a" />
    </Svg>
  );
}

function Folder({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe9a3" />
          <stop offset="1" stopColor="#f0b93a" />
        </linearGradient>
      </defs>
      <path d="M2.5 7 H11 L13.5 9.5 H27.5 V12 H2.5 Z" fill="#e7a92a" stroke="#a8740d" strokeLinejoin="round" />
      <path d="M2.5 11 H29.5 L27.5 27 H4.5 Z" fill={`url(#${id}f)`} stroke="#a8740d" strokeLinejoin="round" />
      <path d="M3.6 12.2 H28.3" stroke="#fff6d6" strokeWidth="1" />
    </>
  );
}

export function ExploreIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <Folder id={id} />
      <circle cx="18.5" cy="18.5" r="5.2" fill="#d8ecff" fillOpacity=".85" stroke="#2c4f7c" strokeWidth="1.6" />
      <path d="M16.3 16.6 Q17.5 15.2 19.4 15.4" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      <path d="M22.3 22.3 L27.5 27.5" stroke="#2c4f7c" strokeWidth="3" strokeLinecap="round" />
      <path d="M22.3 22.3 L27.5 27.5" stroke="#7c9cc4" strokeWidth="1" strokeLinecap="round" />
    </Svg>
  );
}

export function CalloutsIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd08a" />
          <stop offset=".5" stopColor="#ff8a1f" />
          <stop offset="1" stopColor="#d35a00" />
        </linearGradient>
      </defs>
      <path d="M8 18.5 L10 26.5 H13.5 L12 19 Z" fill="#7d8796" stroke="#3d4450" strokeLinejoin="round" />
      <path d="M4 12 H9 L23 5 V26 L9 19 H4 Z" fill={`url(#${id}m)`} stroke="#8a3a00" strokeLinejoin="round" />
      <rect x="3" y="11.5" width="6" height="8" rx="1" fill="#e8ecf2" stroke="#4a5363" />
      <ellipse cx="23" cy="15.5" rx="2.3" ry="10.5" fill="#ffe2b8" stroke="#8a3a00" />
      <path d="M26.5 10.5 Q29 15.5 26.5 20.5" stroke="#2b6cb0" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M28.6 8 Q32.2 15.5 28.6 23" stroke="#2b6cb0" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".7" />
    </Svg>
  );
}

export function PortfolioIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c58a4e" />
          <stop offset="1" stopColor="#7b4a1d" />
        </linearGradient>
      </defs>
      <path d="M12 9 V6.5 Q12 5 13.5 5 H18.5 Q20 5 20 6.5 V9" fill="none" stroke="#4d2c0d" strokeWidth="2" />
      <rect x="3" y="9" width="26" height="18" rx="2" fill={`url(#${id}c)`} stroke="#4d2c0d" />
      <path d="M3 15.5 H29" stroke="#4d2c0d" strokeWidth="1" />
      <path d="M4 10.5 H28" stroke="#e6b884" strokeWidth="1" />
      <rect x="14" y="13.5" width="4" height="4.5" rx=".8" fill="#ffd34d" stroke="#8a6200" strokeWidth=".8" />
      <path d="M20.5 24 L23 20.5 L25 22 L27.5 18" stroke="#7ee05a" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function TheoremIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe6ee" />
        </linearGradient>
      </defs>
      <path d="M6 3 H21 L27 9 V29 H6 Z" fill={`url(#${id}p)`} stroke="#5d6b7a" strokeLinejoin="round" />
      <path d="M21 3 V9 H27" fill="#c7d2de" stroke="#5d6b7a" strokeLinejoin="round" />
      <text
        x="15.5"
        y="22.5"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontWeight="700"
        fontSize="15"
        fill="#2b6cb0"
      >
        ∑
      </text>
      <path d="M9 25.5 H23" stroke="#9aa7b4" strokeWidth="1" />
      <circle cx="23" cy="25" r="3.2" fill="#ff6b00" stroke="#9a3f00" strokeWidth=".7" />
      <path d="M21.6 25 L22.7 26.1 L24.6 23.9" stroke="#fff" strokeWidth="1" fill="none" />
    </Svg>
  );
}

function Orb({ id, from, to, stroke }: { id: string; from: string; to: string; stroke: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}o`} cx=".35" cy=".3" r=".8">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </radialGradient>
      </defs>
      <circle cx="16" cy="16" r="13" fill={`url(#${id}o)`} stroke={stroke} />
      <ellipse cx="16" cy="9.5" rx="8" ry="4.5" fill="#fff" opacity=".35" />
    </>
  );
}

export function InfoIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <Orb id={id} from="#8cc4ff" to="#1a5fc8" stroke="#0e3d86" />
      <circle cx="16" cy="9.6" r="2" fill="#fff" />
      <path d="M13.2 13.5 H17.6 V22.5 H19.3 V24.5 H12.8 V22.5 H14.5 V15.5 H13.2 Z" fill="#fff" />
    </Svg>
  );
}

/** A dark tile with an X, for links to hood.exe's X account. */
export function XIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="26" height="26" rx="5" fill="#111" stroke="#000" />
      <path d="M9.5 8.5 H13.6 L22.5 23.5 H18.4 Z" fill="#fff" />
      <path d="M21.2 8.5 H23 L17.1 15.3 L16.1 13.8 Z M14.9 17.2 L15.9 18.7 L10.8 23.5 H9 Z" fill="#fff" />
    </Svg>
  );
}

export function QuestionIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <Orb id={id} from="#8cc4ff" to="#1a5fc8" stroke="#0e3d86" />
      <path
        d="M12 12.5 Q12 8 16.2 8 Q20.5 8 20.5 11.8 Q20.5 14.2 17.6 15.6 Q16.8 16.1 16.8 17.6 V18.6"
        stroke="#fff"
        strokeWidth="2.8"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="16.8" cy="23" r="1.8" fill="#fff" />
    </Svg>
  );
}

export function ErrorIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <Orb id={id} from="#ff9a8a" to="#c91f00" stroke="#7a1200" />
      <path d="M11 11 L21 21 M21 11 L11 21" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
    </Svg>
  );
}

export function WarningIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff2a0" />
          <stop offset="1" stopColor="#f2b600" />
        </linearGradient>
      </defs>
      <path d="M16 3 L30 28 H2 Z" fill={`url(#${id}w)`} stroke="#8a6400" strokeLinejoin="round" />
      <path d="M16 11 V19.5" stroke="#000" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="24" r="1.8" fill="#000" />
    </Svg>
  );
}

export function HelpIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}k`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1d4fa8" />
          <stop offset="1" stopColor="#4f8de6" />
        </linearGradient>
      </defs>
      <path d="M7 4 H25 Q27 4 27 6 V27 H9 Q7 27 7 25 Z" fill={`url(#${id}k)`} stroke="#0d2c66" />
      <path d="M9 27 Q7 27 7 25 Q7 23 9 23 H27 V27 Z" fill="#f4f1e4" stroke="#0d2c66" />
      <path d="M8.5 4 V23" stroke="#0d2c66" strokeWidth="1.4" />
      <path
        d="M13.5 10 Q13.5 7 17 7 Q20.5 7 20.5 10 Q20.5 12 18 13.2 Q17.3 13.6 17.3 15"
        stroke="#ffd34d"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="17.3" cy="18.5" r="1.4" fill="#ffd34d" />
    </Svg>
  );
}

export function RecycleBinIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c8dde8" />
          <stop offset=".5" stopColor="#f4fbff" />
          <stop offset="1" stopColor="#a9c3d3" />
        </linearGradient>
      </defs>
      <path d="M6 8 H26 L23.5 29 H8.5 Z" fill={`url(#${id}r)`} fillOpacity=".9" stroke="#5c7a8e" strokeLinejoin="round" />
      <ellipse cx="16" cy="8" rx="10" ry="2.6" fill="#e3f0f7" stroke="#5c7a8e" />
      <path d="M11 12 L12 26 M16 12 V26 M21 12 L20 26" stroke="#8fb0c2" strokeWidth="1" />
      <path
        d="M13 17.5 L15 15 L17 17.5 M19.2 19.5 L18.3 22.4 L15.3 22 M12.4 21.8 L13.2 19 L11.5 18.7"
        stroke="#2f9a3a"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe07a" />
          <stop offset="1" stopColor="#d09400" />
        </linearGradient>
      </defs>
      <path d="M10 14 V10 Q10 4 16 4 Q22 4 22 10 V14" fill="none" stroke="#8b96a3" strokeWidth="3" />
      <path d="M10 14 V10 Q10 4 16 4 Q22 4 22 10 V14" fill="none" stroke="#d6dde5" strokeWidth="1" />
      <rect x="6" y="13.5" width="20" height="15" rx="2" fill={`url(#${id}l)`} stroke="#7a5600" />
      <circle cx="16" cy="19.5" r="2.2" fill="#5a3f00" />
      <path d="M16 20.5 V24.5" stroke="#5a3f00" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10.5" cy="12" r="6.5" fill="#ffd34d" stroke="#8a6200" strokeWidth="1.2" />
      <circle cx="9" cy="10.5" r="2" fill="#fff6c8" stroke="#8a6200" />
      <path d="M15 16 L26 27 M21.5 22.5 L24 20 M24 25 L26.5 22.5" stroke="#8a6200" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M15 16 L26 27" stroke="#ffd34d" strokeWidth="1" strokeLinecap="round" />
    </Svg>
  );
}

function PowerSquare({ id, from, to, stroke, children }: { id: string; from: string; to: string; stroke: string; children: ReactNode }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="5" fill={`url(#${id}s)`} stroke={stroke} />
      <path d="M4 7 Q4 4 7 4 H25 Q28 4 28 7 V12 Q16 15 4 12 Z" fill="#fff" opacity=".3" />
      {children}
    </>
  );
}

const powerGlyph = (
  <>
    <path d="M11.2 10.5 A7.5 7.5 0 1 0 20.8 10.5" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" />
    <path d="M16 7 V16" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" />
  </>
);

export function TurnOffIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <PowerSquare id={id} from="#ff8d6b" to="#c42a0c" stroke="#7a1700">
        {powerGlyph}
      </PowerSquare>
    </Svg>
  );
}

export function StandByIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <PowerSquare id={id} from="#ffe27a" to="#d99a00" stroke="#7a5600">
        <path d="M19.5 8.5 A8 8 0 1 0 23.5 20 A6.4 6.4 0 0 1 19.5 8.5 Z" fill="#fff" />
      </PowerSquare>
    </Svg>
  );
}

export function RestartIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <PowerSquare id={id} from="#8be07a" to="#2e8c1f" stroke="#1d5a12">
        <path d="M22.5 12 A7.5 7.5 0 1 0 23.5 18" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        <path d="M24.5 7 V13 H18.5" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </PowerSquare>
    </Svg>
  );
}

export function WalletIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b9be8" />
          <stop offset="1" stopColor="#1d4f9e" />
        </linearGradient>
      </defs>
      <path d="M5 9 L21 4.5 L23 9" fill="#e9eef5" stroke="#4a5868" strokeLinejoin="round" />
      <rect x="3" y="9" width="26" height="18" rx="2.5" fill={`url(#${id}v)`} stroke="#0e2f66" />
      <path d="M4.5 10.5 H27.5" stroke="#9cc4f5" strokeWidth="1" />
      <rect x="20" y="14.5" width="9" height="7" rx="1.5" fill="#cfe0f7" stroke="#0e2f66" />
      <circle cx="23.2" cy="18" r="1.5" fill="#ff6b00" />
    </Svg>
  );
}

export function SpeakerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12 H10 L17 6 V26 L10 20 H5 Z" fill="#e8ecf2" stroke="#2c3440" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M21 12 Q23.5 16 21 20" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M24 9 Q28.5 16 24 23" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/** Two fanned playing cards: Solitaire. */
export function SolitaireIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <g transform="rotate(-14 12 18)">
        <rect x="4" y="6" width="15" height="21" rx="2" fill="#2f5fc8" stroke="#16337a" />
        <path d="M6.5 8.5 H16.5 V24.5 H6.5 Z" fill="none" stroke="#9fc0ff" strokeWidth=".8" />
        <path d="M7 11 L16 22 M16 11 L7 22" stroke="#9fc0ff" strokeWidth=".7" />
      </g>
      <g transform="rotate(10 20 18)">
        <rect x="12" y="5" width="15" height="21" rx="2" fill="#fff" stroke="#555" />
        <text x="14" y="11.5" fontSize="6" fontWeight="700" fontFamily="Tahoma, sans-serif" fill="#c91f00">A</text>
        <path d="M19.5 13 C17 10.5 14.5 13 16.5 15.5 L19.5 19 L22.5 15.5 C24.5 13 22 10.5 19.5 13 Z" fill="#c91f00" />
      </g>
    </Svg>
  );
}

/** A mine with a spark: Minesweeper. */
export function MinesweeperIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <radialGradient id={`${id}m`} cx=".38" cy=".35" r=".7">
          <stop offset="0" stopColor="#8a8a8a" />
          <stop offset=".45" stopColor="#2a2a2a" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
      </defs>
      <path d="M16 3 V29 M3 16 H29 M7 7 L25 25 M25 7 L7 25" stroke="#111" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="8.5" fill={`url(#${id}m)`} />
      <circle cx="13" cy="13" r="2.2" fill="#fff" fillOpacity=".85" />
    </Svg>
  );
}

/** A yellow folder with a card peeking out: the Games folder. */
export function GamesFolderIcon(props: IconProps) {
  const id = gid(useId());
  return (
    <Svg {...props}>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe68a" />
          <stop offset="1" stopColor="#e8b22e" />
        </linearGradient>
      </defs>
      <path d="M3 8 Q3 6 5 6 H12 L14.5 8.5 H27 Q29 8.5 29 10.5 V12 H3 Z" fill="#d79c1c" stroke="#9a6a08" />
      <rect x="9" y="4" width="10" height="13" rx="1.2" fill="#fff" stroke="#555" transform="rotate(-8 14 10)" />
      <path d="M14.2 7.6 C12.9 6.3 11.6 7.6 12.6 8.9 L14.2 10.8 L15.8 8.9 C16.8 7.6 15.5 6.3 14.2 7.6 Z" fill="#c91f00" transform="rotate(-8 14 10)" />
      <path d="M3 12 H29 L27.5 26 Q27.3 27.5 25.8 27.5 H6.2 Q4.7 27.5 4.5 26 Z" fill={`url(#${id}f)`} stroke="#9a6a08" />
    </Svg>
  );
}
