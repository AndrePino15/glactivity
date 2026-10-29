import type { ReactNode } from "react";
import type { Game } from "@/lib/db/types";
import styles from "./GameIcon.module.css";

/**
 * Small drawn icons that echo each game's look (Wordle's tiles, Connections'
 * colour bars…) without copying their logos. Unknown games get a letter tile.
 */
const ICONS: Record<string, { bg: string; art: ReactNode }> = {
  wordle: {
    bg: "#f4f4ef",
    art: (
      <>
        {[
          ["#787c7e", "#787c7e", "#c9b458"],
          ["#6aaa64", "#c9b458", "#787c7e"],
          ["#6aaa64", "#6aaa64", "#6aaa64"],
        ].flatMap((row, y) =>
          row.map((fill, x) => <rect key={`${x}${y}`} x={8 + x * 8.5} y={8 + y * 8.5} width="7" height="7" rx="1" fill={fill} />),
        )}
      </>
    ),
  },
  connections: {
    bg: "#faf8f2",
    art: (
      <>
        {["#f9df6d", "#a0c35a", "#b0c4ef", "#ba81c5"].map((fill, i) => (
          <rect key={fill} x="8" y={8.5 + i * 6.25} width="24" height="5" rx="1.5" fill={fill} />
        ))}
      </>
    ),
  },
  strands: {
    bg: "#c0ddd9",
    art: (
      <>
        <path d="M10 28 C 14 18, 20 30, 24 20 S 30 12, 31 11" stroke="#3f8f87" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="10" cy="28" r="3.2" fill="#f8cd05" />
        <circle cx="18" cy="23" r="3.2" fill="#f8cd05" />
        <circle cx="25" cy="18" r="3.2" fill="#aedfee" />
        <circle cx="31" cy="11" r="3.2" fill="#aedfee" />
      </>
    ),
  },
  mini: {
    bg: "#95befa",
    art: (
      <>
        <rect x="9" y="9" width="22" height="22" rx="1.5" fill="#fff" />
        {[
          [1, 0],
          [2, 2],
          [0, 3],
        ].map(([x, y]) => (
          <rect key={`${x}${y}`} x={9 + x * 5.5} y={9 + y * 5.5} width="5.5" height="5.5" fill="#1d1d1f" />
        ))}
        <path d="M14.5 9v22M20 9v22M25.5 9v22M9 14.5h22M9 20h22M9 25.5h22" stroke="#1d1d1f" strokeWidth="0.6" />
      </>
    ),
  },
  worldle: {
    bg: "#1f2a37",
    art: (
      <path
        d="M14 12c4-2 9-1 11 2 3 1 5 4 3 7-1 3-4 4-4 7-2 2-6 1-7-2-3-1-6-3-5-7-2-3-1-6 2-7z"
        fill="#5cc27b"
      />
    ),
  },
  globle: {
    bg: "#10203a",
    art: (
      <>
        <circle cx="20" cy="20" r="12" fill="#2c5f8a" />
        <circle cx="23" cy="17" r="5.5" fill="#f2683c" />
        <circle cx="23" cy="17" r="9" fill="#f2683c" opacity="0.35" />
        <ellipse cx="20" cy="20" rx="12" ry="4.5" fill="none" stroke="#9cc3e6" strokeWidth="0.8" opacity="0.6" />
      </>
    ),
  },
  tradle: {
    bg: "#1d2735",
    art: (
      <>
        <rect x="8" y="8" width="13" height="14" rx="1" fill="#4fa3c7" />
        <rect x="22" y="8" width="10" height="8" rx="1" fill="#e7b04a" />
        <rect x="22" y="17" width="10" height="5" rx="1" fill="#d96a5b" />
        <rect x="8" y="23" width="9" height="9" rx="1" fill="#7fc37a" />
        <rect x="18" y="23" width="14" height="9" rx="1" fill="#a07fd0" />
      </>
    ),
  },
  framed: {
    bg: "#151515",
    art: (
      <>
        <rect x="9" y="11" width="22" height="18" rx="1.5" fill="none" stroke="#f2f2f2" strokeWidth="2" />
        {[13, 18, 23, 28].map((x) => (
          <g key={x}>
            <rect x={x - 1.2} y="7.5" width="2.4" height="2" rx="0.5" fill="#f2f2f2" />
            <rect x={x - 1.2} y="30.5" width="2.4" height="2" rx="0.5" fill="#f2f2f2" />
          </g>
        ))}
        <path d="M17 16.5v7l6-3.5z" fill="#f2c14e" />
      </>
    ),
  },
  krillion: {
    bg: "#0d3b58",
    art: (
      <>
        <path d="M11 24c3-6 10-8 16-6" stroke="#ff8f80" strokeWidth="5" strokeLinecap="round" fill="none" />
        <path d="M27 18l4-3M27 18l4 0" stroke="#ff8f80" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="25" cy="17.5" r="1" fill="#0d3b58" />
        <circle cx="13" cy="12" r="1.6" fill="#8fd3f4" opacity="0.8" />
        <circle cx="17" cy="9" r="1" fill="#8fd3f4" opacity="0.7" />
        <circle cx="29" cy="27" r="1.3" fill="#8fd3f4" opacity="0.6" />
      </>
    ),
  },
};

/** Which drawn icon fits a game, from its name or link. */
export function gameIconKey(game: Pick<Game, "name" | "url">): string | null {
  const name = game.name.toLowerCase().replace(/^the\s+/, "");
  const url = game.url.toLowerCase();
  if (name === "wordle" || url.includes("/games/wordle")) return "wordle";
  if (name === "connections" || url.includes("/games/connections")) return "connections";
  if (name === "strands" || url.includes("/games/strands")) return "strands";
  if (name === "mini" || name === "mini crossword" || url.includes("/crosswords/game/mini")) return "mini";
  if (name === "worldle" || url.includes("worldle")) return "worldle";
  if (name === "globle" || url.includes("globle")) return "globle";
  if (name === "tradle" || url.includes("tradle")) return "tradle";
  if (name === "framed" || url.includes("framed.wtf")) return "framed";
  if (name === "krillion" || url.includes("krillion")) return "krillion";
  return null;
}

export function GameIcon({ game, size = 36 }: { game: Pick<Game, "name" | "url">; size?: number }) {
  const key = gameIconKey(game);
  const icon = key ? ICONS[key] : null;
  if (!icon) {
    return (
      <span className={styles.letter} style={{ width: size, height: size, fontSize: size * 0.45 }} aria-hidden>
        {game.name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={styles.icon} aria-hidden>
      <rect width="40" height="40" rx="9" fill={icon.bg} />
      {icon.art}
    </svg>
  );
}
