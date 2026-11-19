/** In-memory presence: which users currently have a live socket subscribed to a room. Single-process only (see README: scaling). */
const rooms = new Map<string, Map<string, Set<string>>>();

export function addPresence(roomId: string, userId: string, socketId: string): boolean {
  let users = rooms.get(roomId);
  if (!users) rooms.set(roomId, (users = new Map()));
  let sockets = users.get(userId);
  const first = !sockets || sockets.size === 0;
  if (!sockets) users.set(userId, (sockets = new Set()));
  sockets.add(socketId);
  return first;
}

/** Returns true when this was the user's last socket in the room. */
export function removePresence(roomId: string, userId: string, socketId: string): boolean {
  const users = rooms.get(roomId);
  const sockets = users?.get(userId);
  if (!users || !sockets) return false;
  sockets.delete(socketId);
  if (sockets.size > 0) return false;
  users.delete(userId);
  if (users.size === 0) rooms.delete(roomId);
  return true;
}

export const onlineUserIds = (roomId: string): string[] => [...(rooms.get(roomId)?.keys() ?? [])];
export const isOnline = (roomId: string, userId: string) => rooms.get(roomId)?.has(userId) ?? false;
export const onlineCount = (roomId: string) => rooms.get(roomId)?.size ?? 0;
export const resetPresence = () => rooms.clear();
