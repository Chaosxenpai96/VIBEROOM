// Original compositions synthesized by scripts/generate-demo-audio.ts.
// Chords are MIDI note triads. Nothing here is third-party material.
export interface DemoTrackSpec {
  id: string; title: string; artist: string; album: string; genre: string;
  durationMs: number; bpm: number; lead: "sine" | "tri" | "saw";
  progression: number[][]; colors: [string, string];
}

export const DEMO_TRACKS: DemoTrackSpec[] = [
  { id: "neon-drive", title: "Neon Drive", artist: "VibeRoom Studio", album: "Demo Sessions", genre: "Synthwave",
    durationMs: 48000, bpm: 100, lead: "saw", colors: ["#8B5CF6", "#22D3EE"],
    progression: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]] },
  { id: "midnight-lobby", title: "Midnight Lobby", artist: "VibeRoom Studio", album: "Demo Sessions", genre: "Lo-fi",
    durationMs: 45000, bpm: 80, lead: "sine", colors: ["#EC4899", "#8B5CF6"],
    progression: [[50, 53, 57], [55, 58, 62], [48, 52, 55], [53, 57, 60]] },
  { id: "glass-skyline", title: "Glass Skyline", artist: "Aurora Loop", album: "Demo Sessions", genre: "Electronic",
    durationMs: 50000, bpm: 118, lead: "tri", colors: ["#22D3EE", "#3B82F6"],
    progression: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]] },
  { id: "sunset-karaoke", title: "Sunset Karaoke", artist: "Aurora Loop", album: "Sing Along", genre: "Pop",
    durationMs: 52000, bpm: 96, lead: "tri", colors: ["#F59E0B", "#EC4899"],
    progression: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]] },
  { id: "pocket-groove", title: "Pocket Groove", artist: "Kiwi Circuit", album: "Sing Along", genre: "Funk",
    durationMs: 46000, bpm: 108, lead: "saw", colors: ["#10B981", "#22D3EE"],
    progression: [[45, 48, 52], [50, 53, 57], [43, 47, 50], [52, 56, 59]] },
];
