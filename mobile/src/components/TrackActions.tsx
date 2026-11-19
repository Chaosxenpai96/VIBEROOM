import React from "react";
import { View } from "react-native";
import { usePlayer } from "../lib/player";
import { useRoomSession } from "../lib/room-session";
import { colors } from "../lib/theme";
import type { Track } from "../lib/types";
import { IconButton } from "./ui";

/** Play on this phone, add to the room you are in, and favourite. Only offers what can actually work. */
export function TrackActions({ track, favorite, onFavorite, onNotify }: {
  track: Track; favorite: boolean; onFavorite: (t: Track) => void; onNotify: (text: string, error?: boolean) => void;
}) {
  const player = usePlayer();
  const session = useRoomSession();
  const playable = track.availability.status === "playable";
  const inRoom = !!session.roomId;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <IconButton name={favorite ? "heart" : "heart-outline"} color={favorite ? colors.pink : colors.muted} label={favorite ? "Remove from favorites" : "Add to favorites"} size={22} onPress={() => onFavorite(track)} />
      {inRoom ? (
        <IconButton name="add-circle-outline" color={colors.cyan} label={`Add ${track.title} to ${session.room?.name ?? "room"} queue`} size={26} disabled={!playable}
          onPress={() => session.send("queue:add", { trackId: track.id }).then(() => onNotify(`Added "${track.title}" to the queue`)).catch((e) => onNotify(e.message, true))} />
      ) : null}
      <IconButton name="play-circle" color={playable ? colors.primary : colors.muted} label={playable ? `Play ${track.title}` : `${track.title} can't be played`} size={30} disabled={!playable}
        onPress={() => player.playSolo(track).catch((e) => onNotify(e.message, true))} />
    </View>
  );
}
