/**
 * Music provider contract.
 *
 * Four concerns are kept separate on purpose:
 *  A. metadata/discovery  -> searchTracks / getTrack
 *  B. audio playback      -> getPlaybackSource (may legitimately return null)
 *  C. playlists / queues  -> NOT a provider concern; the app's DB owns them
 *  D. licensing / auth    -> getPlaybackAvailability + capabilities
 *
 * A provider that only exposes catalog metadata (e.g. Spotify's Web API) must
 * return `metadata-only` or `external-player-required`, never a fake audio URL.
 */
export interface ProviderTrack {
  providerId: string;
  providerTrackId: string;
  title: string;
  artist: string;
  album?: string | null;
  durationMs: number;
  /** Absolute URL from the provider, or a server-relative path (`/art/x.png`) for our own catalog. */
  artworkUrl?: string | null;
  genre?: string | null;
  isKaraoke?: boolean;
  /** Server-relative path of audio we host and are licensed to play. Never a temporary signed URL. */
  audioPath?: string | null;
}

export type PlaybackAvailability =
  | { status: "playable"; via: "direct-audio" }
  | { status: "external-player-required"; via: string; reason: string }
  | { status: "metadata-only"; reason: string }
  | { status: "unavailable"; reason: string };

export interface PlaybackSource {
  kind: "direct-audio";
  /** Absolute URL, or a server-relative path the client resolves against the server it is connected to. */
  url: string;
  mimeType: string;
  /** Set for temporary URLs; such URLs must not be stored as identifiers. */
  expiresAt?: string | null;
}

export interface ProviderCapabilities {
  canStreamDirectly: boolean;
  supportsSearch: boolean;
  requiresUserAuth: boolean;
}

export interface MusicProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  /** False when required credentials are missing; the registry then keeps the provider disabled. */
  isConfigured(): boolean;
  searchTracks(query: string): Promise<ProviderTrack[]>;
  getTrack(providerTrackId: string): Promise<ProviderTrack | null>;
  getPlaybackAvailability(providerTrackId: string): Promise<PlaybackAvailability>;
  getPlaybackSource(providerTrackId: string): Promise<PlaybackSource | null>;
}

export class ProviderError extends Error {
  constructor(public providerId: string, message: string) {
    super(message);
  }
}
