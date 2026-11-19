import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { useDebounced, useQuery } from "../lib/hooks";
import { useRoomSession } from "../lib/room-session";
import { colors, radius, space, type } from "../lib/theme";
import type { Track } from "../lib/types";
import { Button, EmptyState, ErrorBanner, IconButton, TrackRow, TrackSkeletons } from "./ui";

/** Search the catalog and add to the room's shared queue. Server decides whether each add is allowed. */
export function AddTracksSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { api } = useAuth();
  const session = useRoomSession();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 300);
  const res = useQuery(() => api.get<{ tracks: Track[] }>(`/tracks/search?q=${encodeURIComponent(dq)}`).then((r) => r.tracks), [dq, visible]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const queued = new Set(session.queue.map((i) => i.track.id));

  const add = async (t: Track) => {
    setBusyId(t.id); setMsg(null);
    try { await session.send("queue:add", { trackId: t.id }); setMsg({ text: `Added "${t.title}"`, error: false }); }
    catch (e: any) { setMsg({ text: e.message, error: true }); } finally { setBusyId(null); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg }}>
          <Text style={{ color: colors.text, ...type.title }}>Add to queue</Text>
          <IconButton name="close" label="Close" onPress={onClose} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: 50, margin: space.lg }}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Song, artist or album" placeholderTextColor={colors.muted} accessibilityLabel="Search music" autoCorrect={false}
            style={{ flex: 1, color: colors.text, fontSize: 16, minHeight: 48 }} />
        </View>
        {msg ? <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>{msg.error ? <ErrorBanner message={msg.text} /> : <Text style={{ color: colors.success, fontWeight: "600" }}>{msg.text}</Text>}</View> : null}
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: insets.bottom + space.xl, gap: space.sm }} keyboardShouldPersistTaps="handled">
          {res.error ? <ErrorBanner message={res.error} onRetry={() => res.reload()} /> : null}
          {res.loading && !res.data ? <TrackSkeletons n={6} /> : (res.data ?? []).length === 0 && !res.error ? (
            <EmptyState icon="search" title="No matches" body="Try a different title, artist or album." />
          ) : (res.data ?? []).map((t) => {
            const inQueue = queued.has(t.id);
            const playable = t.availability.status === "playable";
            return (
              <TrackRow key={t.id} track={t} subtitle={!playable && "reason" in t.availability ? t.availability.reason : t.artist}
                right={inQueue ? <Text style={{ color: colors.muted, fontSize: 13, paddingHorizontal: 8 }}>In queue</Text>
                  : <Button title="Add" onPress={() => add(t)} disabled={!playable} loading={busyId === t.id} variant="secondary" style={{ minWidth: 76 }} />} />
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}
