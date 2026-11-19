export type Availability =
  | { status: "playable"; via: "direct-audio" }
  | { status: "external-player-required"; via: string; reason: string }
  | { status: "metadata-only"; reason: string }
  | { status: "unavailable"; reason: string };

export interface Track {
  id: string; providerId: string; providerTrackId: string; title: string; artist: string;
  album: string | null; durationMs: number; artworkUrl: string | null; genre: string | null;
  isKaraoke: boolean; availability: Availability;
}
export type Role = "HOST" | "MODERATOR" | "MEMBER";
export interface Room {
  id: string; code: string; name: string; description: string | null; visibility: "PUBLIC" | "PRIVATE" | "LOCAL";
  hasPassword: boolean; maxMembers: number; queuePolicy: "ANYONE_CAN_ADD" | "MODERATORS_ONLY"; voteOrdering: boolean; hostId: string;
}
export interface RoomListItem extends Room { memberCount: number; onlineCount: number; hostName?: string; myRole?: Role }
export interface Member { userId: string; displayName: string; avatarColor: string; role: Role; online: boolean }
export interface QueueItem {
  id: string; status: "QUEUED" | "PLAYING"; position: number; addedAt: string;
  addedBy: { id: string; displayName: string; avatarColor: string };
  track: Track; score: number; upvoterIds: string[]; downvoterIds: string[];
}
export interface Playback {
  state: "PLAYING" | "PAUSED" | "STOPPED"; positionMs: number; updatedAtMs: number; serverTimeMs: number;
  queueItemId: string | null; trackId: string | null; durationMs: number | null; playerUserId: string | null; version: number;
}
export interface ActivityEntry { id: string; text: string; at: number }
export interface User { id: string; email: string; displayName: string; avatarColor: string; bio?: string | null }
