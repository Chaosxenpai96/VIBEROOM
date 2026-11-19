import { DemoProvider } from "./demo.js";
import type { MusicProvider } from "./types.js";

/**
 * Add production providers here. A provider whose isConfigured() is false is
 * simply not registered, so the app never pretends an unauthorized integration works.
 *
 * Spotify is intentionally NOT registered yet: its Web API gives catalog metadata
 * but not full-length audio, and playback needs the user's own Spotify Premium
 * through Spotify's own players. See README "Music providers".
 */
export const demoProvider = new DemoProvider();
const all: MusicProvider[] = [demoProvider];

export const providers = new Map(all.filter((p) => p.isConfigured()).map((p) => [p.id, p] as const));
export const getProvider = (id: string) => providers.get(id);
