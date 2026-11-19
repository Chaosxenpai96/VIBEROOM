export const colors = {
  bg: "#0B0B12",
  surface: "#14141F",
  surface2: "#1D1D2D",
  border: "#2A2A3D",
  primary: "#8B5CF6",
  primarySoft: "#8B5CF633",
  cyan: "#22D3EE",
  pink: "#EC4899",
  text: "#F4F4F8",
  muted: "#9A9AB2",
  danger: "#F87171",
  success: "#34D399",
  warning: "#FBBF24",
};
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const gradients = {
  primary: ["#8B5CF6", "#EC4899"] as const,
  cool: ["#22D3EE", "#8B5CF6"] as const,
  hero: ["#2A1B5C", "#0B0B12"] as const,
};
export const TAB_BAR_HEIGHT = 58;
export const MINI_PLAYER_HEIGHT = 64;

/** Type scale. System font on purpose: no font download to wait for on a phone; weight and tracking carry the personality. */
export const type = {
  display: { fontSize: 34, fontWeight: "900" as const, letterSpacing: -1 },
  title: { fontSize: 26, fontWeight: "800" as const, letterSpacing: -0.6 },
  heading: { fontSize: 19, fontWeight: "700" as const, letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: "500" as const },
  small: { fontSize: 13, fontWeight: "500" as const },
};

const ROOM_PAIRS: readonly (readonly [string, string])[] = [
  ["#8B5CF6", "#EC4899"], ["#22D3EE", "#8B5CF6"], ["#F472B6", "#FBBF24"], ["#34D399", "#22D3EE"],
  ["#6366F1", "#22D3EE"], ["#EC4899", "#8B5CF6"], ["#F97316", "#EC4899"], ["#14B8A6", "#8B5CF6"],
];

/** Every room gets its own colour identity, derived from its code so it is the same on every phone. */
export function roomColors(code: string): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return ROOM_PAIRS[h % ROOM_PAIRS.length];
}
