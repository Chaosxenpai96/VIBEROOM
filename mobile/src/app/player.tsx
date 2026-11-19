import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Artwork, ErrorBanner, IconButton } from "../components/ui";
import { fmtTime } from "../lib/hooks";
import { usePlayer } from "../lib/player";
import { useRoomSession } from "../lib/room-session";
import { colors, gradients, space } from "../lib/theme";

export default function PlayerScreen() {
  const p = usePlayer();
  const session = useRoomSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const t = p.track;
  const canControl = p.mode === "solo" || session.myRole === "HOST" || session.myRole === "MODERATOR";
  const guard = (fn: () => void) => () => { if (!canControl) { setNote("Only the host and moderators control playback in a room."); return; } setNote(null); fn(); };
  const pct = p.durationMs > 0 ? Math.min(1, p.positionMs / p.durationMs) : 0;

  const onSeek = (x: number) => { if (width > 0 && p.durationMs > 0) p.seek((x / width) * p.durationMs); };
  const status = p.status === "loading" ? "Loading…" : p.status === "error" ? "Couldn't play" : p.mode === "room" ? (session.isPlayerDevice ? "Playing on this device" : "Playing on the room's player device") : "Playing on this device";

  return (
    <LinearGradient colors={gradients.hero} style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16, paddingHorizontal: space.xl }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <IconButton name="chevron-down" label="Close player" onPress={() => router.back()} />
        <Text style={{ color: colors.muted, fontWeight: "600" }}>{p.mode === "room" ? session.room?.name ?? "Room" : "Solo listening"}</Text>
        <View style={{ width: 44 }} />
      </View>

      {!t ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><Text style={{ color: colors.muted }}>Nothing is playing.</Text></View>
      ) : (
        <View style={{ flex: 1, justifyContent: "center", gap: space.xl }}>
          <View style={{ alignItems: "center" }}><Artwork track={t} size={300} radiusPx={24} /></View>
          <View style={{ gap: 4 }}>
            <Text numberOfLines={2} style={{ color: colors.text, fontSize: 26, fontWeight: "800" }}>{t.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 16 }}>{t.artist}{t.album ? ` · ${t.album}` : ""}</Text>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginTop: 4 }}>
              {p.status === "loading" ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name={p.status === "error" ? "alert-circle" : "volume-medium"} size={14} color={p.status === "error" ? colors.danger : colors.cyan} />}
              <Text style={{ color: p.status === "error" ? colors.danger : colors.cyan, fontSize: 12 }}>{status}</Text>
            </View>
          </View>
          {p.status === "error" && p.error ? <ErrorBanner message={p.error} /> : null}
          {note ? <Text style={{ color: colors.warning }}>{note}</Text> : null}

          <View>
            <Pressable onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} onPress={(e) => (canControl ? onSeek(e.nativeEvent.locationX) : setNote("Only the host and moderators control playback in a room."))}
              accessibilityRole="adjustable" accessibilityLabel="Seek" accessibilityValue={{ min: 0, max: Math.round(p.durationMs / 1000), now: Math.round(p.positionMs / 1000) }}
              style={{ height: 28, justifyContent: "center" }}>
              <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.border }}>
                <View style={{ height: 5, borderRadius: 3, width: `${pct * 100}%`, backgroundColor: colors.primary }} />
              </View>
              <View style={{ position: "absolute", left: `${pct * 100}%`, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: "#fff" }} />
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{fmtTime(p.positionMs)}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{fmtTime(p.durationMs)}</Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.xl }}>
            <IconButton name="play-skip-back" label="Restart track" size={30} onPress={guard(p.previous)} />
            <Pressable onPress={guard(p.toggle)} accessibilityRole="button" accessibilityLabel={p.status === "playing" ? "Pause" : "Play"}
              style={{ width: 76, height: 76, borderRadius: 38, overflow: "hidden" }}>
              <LinearGradient colors={gradients.primary} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                {p.status === "loading" ? <ActivityIndicator color="#fff" /> : <Ionicons name={p.status === "playing" ? "pause" : "play"} size={36} color="#fff" />}
              </LinearGradient>
            </Pressable>
            <IconButton name="play-skip-forward" label={p.mode === "room" ? "Next track" : "Stop"} size={30} onPress={guard(p.next)} />
          </View>
        </View>
      )}
    </LinearGradient>
  );
}
