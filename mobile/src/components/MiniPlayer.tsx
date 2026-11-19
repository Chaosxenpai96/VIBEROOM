import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { usePlayer } from "../lib/player";
import { colors, MINI_PLAYER_HEIGHT, radius } from "../lib/theme";
import { Artwork, IconButton } from "./ui";

/** Persistent mini-player. Shown only while a track is genuinely selected; state mirrors the real audio engine. */
export function MiniPlayer() {
  const p = usePlayer();
  const router = useRouter();
  if (p.mode === "none" || !p.track) return null;
  const pct = p.durationMs > 0 ? Math.min(1, p.positionMs / p.durationMs) : 0;
  const busy = p.status === "loading";
  return (
    <Pressable onPress={() => router.push("/player")} accessibilityRole="button" accessibilityLabel={`Now playing ${p.track.title}. Open player`}
      style={{ height: MINI_PLAYER_HEIGHT, marginHorizontal: 8, marginBottom: 6, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 10 }}>
        <Artwork track={p.track} size={44} radiusPx={8} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: colors.text, fontWeight: "700" }}>{p.track.title}</Text>
          <Text numberOfLines={1} style={{ color: p.status === "error" ? colors.danger : colors.muted, fontSize: 12 }}>
            {p.status === "error" ? p.error ?? "Playback failed" : p.mode === "room" ? `Room · ${p.track.artist}` : p.track.artist}
          </Text>
        </View>
        {busy ? <ActivityIndicator color={colors.primary} style={{ width: 44 }} /> : (
          <IconButton name={p.status === "playing" ? "pause" : "play"} label={p.status === "playing" ? "Pause" : "Play"} onPress={p.toggle} />
        )}
        {p.mode === "room" ? <IconButton name="play-skip-forward" label="Next track" onPress={p.next} size={22} /> : <IconButton name="close" label="Stop" onPress={p.stopSolo} size={22} />}
      </View>
      <View style={{ height: 3, backgroundColor: colors.border }}><View style={{ height: 3, width: `${pct * 100}%`, backgroundColor: colors.primary }} /></View>
    </Pressable>
  );
}

export const _icon = Ionicons; // keeps the icon font bundled with the mini-player chunk
