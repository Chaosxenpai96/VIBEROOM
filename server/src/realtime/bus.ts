import { EventEmitter } from "node:events";

export type Part = "room" | "members" | "queue" | "playback";
/** Services publish here; the Socket.IO layer subscribes. Keeps services free of transport code. */
export const bus = new EventEmitter();
export const roomChanged = (roomId: string, parts: Part[]) => bus.emit("changed", roomId, parts);
export const roomActivity = (roomId: string, text: string) => bus.emit("activity", roomId, text);
export const hostChanged = (roomId: string, hostId: string) => bus.emit("host", roomId, hostId);
