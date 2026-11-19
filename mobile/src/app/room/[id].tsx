import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddTracksSheet } from "../../components/AddTracksSheet";
import { InviteSheet } from "../../components/InviteSheet";
import { Toast } from "../../components/Toast";
import { Artwork, Avatar, Button, EmptyState, ErrorBanner, IconButton, Muted, SectionHeader } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { fmtTime, useToast } from "../../lib/hooks";
import { useRoomSession } from "../../lib/room-session";
import { colors, radius, roomColors, space, type } from "../../lib/theme";
import type { Member, QueueItem } from "../../lib/types";

/** Position on the room's shared clock (server time), so every phone shows the same progress. */
function useSharedPosition() {
  const s = useRoomSession();
  const [, tick] = useState(0);
  const playing = s.playback?.state === "PLAYING";
  useEffect(() => { if (!playing) return; const t = setInterval(() => tick((n) => n + 1), 500); return () => clearInterval(t); }, [playing]);
  const pb = s.playback;
  if (!pb) return 0;
  const pos = pb.positionMs + (pb.state === "PLAYING" ? Math.max(0, Date.now() + s.clockOffsetMs - pb.updatedAtMs) : 0);
  return Math.min(pos, pb.durationMs ?? pos);
}

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = useRoomSession();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const pos = useSharedPosition();

  useEffect(() => { if (id && s.roomId !== id) void s.enterRoom(String(id)); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const room = s.room;
  const isMod = s.myRole === "HOST" || s.myRole === "MODERATOR";
  const isHost = s.myRole === "HOST";
  const [c1, c2] = roomColors(room?.code ?? String(id));
  const cur = s.currentItem;
  const pb = s.playback;
  const upcoming = s.queue.filter((q) => q.status === "QUEUED");
  const run = (p: Promise<unknown>, ok?: string) => p.then(() => ok && toast.show(ok)).catch((e) => toast.show(e.message, true));
  const playerName = s.members.find((m) => m.userId === pb?.playerUserId)?.displayName;

  const leave = () => Alert.alert("Leave this room?", isHost ? "You're the host. Hosting passes to another member." : "You can rejoin with the room code.", [
    { text: "Stay", style: "cancel" },
    { text: "Leave room", style: "destructive", onPress: async () => { try { await api.post(`/rooms/${id}/leave`); s.exitRoom(); router.back(); } catch (e: any) { toast.show(e.message, true); } } },
  ]);

  const memberMenu = (m: Member) => {
    if (!isHost || m.userId === s.me?.id) return;
    const opts: any[] = [];
    if (m.role !== "HOST") opts.push({ text: m.role === "MODERATOR" ? "Remove moderator" : "Make moderator", onPress: () => run(s.send("room:setRole", { userId: m.userId, role: m.role === "MODERATOR" ? "MEMBER" : "MODERATOR" })) });
    opts.push({ text: "Play audio on their phone", onPress: () => run(s.send("room:setPlayer", { userId: m.userId })) });
    opts.push({ text: "Cancel", style: "cancel" });
    Alert.alert(m.displayName, undefined, opts);
  };

  if (s.loadError) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, justifyContent: "center", gap: space.lg }}>
      <ErrorBanner message={s.loadError} /><Button title="Go back" variant="secondary" onPress={() => router.back()} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <LinearGradient colors={[c1, c2, colors.bg]} locations={[0, 0.55, 1]} style={{ paddingTop: insets.top + 8, paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <IconButton name="chevron-back" label="Back" onPress={() => router.back()} />
            <View style={{ flexDirection: "row" }}>
              <IconButton name="qr-code-outline" label="Invite friends" onPress={() => setInviting(true)} />
              <IconButton name="exit-outline" label="Leave room" onPress={leave} />
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={{ color: "#fff", ...type.display }} numberOfLines={2}>{room?.name ?? "Joining…"}</Text>
            <Text style={{ color: "#ffffffcc", ...type.small }}>
              {room ? `Code ${room.code} · ${s.members.filter((m) => m.online).length} online of ${s.members.length}` : "Connecting to the room"}
            </Text>
          </View>
          {s.conn !== "online" ? <View style={{ backgroundColor: "#00000066", borderRadius: radius.md, padding: 10 }}><Text style={{ color: "#fff" }}>{s.conn === "reconnecting" ? "Connection lost. Reconnecting…" : "Connecting…"}</Text></View> : null}
        </LinearGradient>

        <View style={{ paddingHorizontal: space.lg, gap: space.xl, marginTop: -space.sm }}>
          {/* Now playing */}
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg, gap: space.md, shadowColor: c1, shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 }}>
            {cur ? (
              <>
                <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
                  <Artwork track={cur.track} size={84} radiusPx={16} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text numberOfLines={2} style={{ color: colors.text, ...type.heading, fontSize: 21 }}>{cur.track.title}</Text>
                    <Text numberOfLines={1} style={{ color: colors.muted }}>{cur.track.artist}</Text>
                    <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>Added by {cur.addedBy.displayName}</Text>
                  </View>
                </View>
                <View style={{ gap: 6 }}>
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: colors.border }}>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: c1, width: `${Math.min(100, (pos / Math.max(1, cur.track.durationMs)) * 100)}%` }} />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Muted>{fmtTime(pos)}</Muted><Muted>{fmtTime(cur.track.durationMs)}</Muted>
                  </View>
                </View>
                {isMod ? (
                  <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: space.xl }}>
                    <IconButton name="play-skip-back" label="Restart track" onPress={() => run(s.send("playback:previous"))} />
                    <Pressable onPress={() => run(s.send(pb?.state === "PLAYING" ? "playback:pause" : "playback:play"))} accessibilityRole="button" accessibilityLabel={pb?.state === "PLAYING" ? "Pause" : "Play"}
                      style={{ width: 64, height: 64, borderRadius: 32, overflow: "hidden" }}>
                      <LinearGradient colors={[c1, c2]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={pb?.state === "PLAYING" ? "pause" : "play"} size={30} color="#fff" />
                      </LinearGradient>
                    </Pressable>
                    <IconButton name="play-skip-forward" label="Next track" onPress={() => run(s.send("playback:next"))} />
                  </View>
                ) : <Muted>The host and moderators control playback.</Muted>}
              </>
            ) : (
              <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.md }}>
                <Text style={{ color: colors.text, ...type.heading }}>Nothing playing</Text>
                <Muted>{upcoming.length ? "Start the queue when everyone's ready." : "Add a track to get the room going."}</Muted>
                {isMod && upcoming.length ? <Button title="Start the queue" icon="play" onPress={() => run(s.send("playback:play"))} /> : null}
              </View>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.md }}>
              <Ionicons name="volume-medium" size={16} color={s.isPlayerDevice ? colors.success : colors.muted} />
              <Text style={{ color: colors.muted, flex: 1, fontSize: 13 }}>
                {s.isPlayerDevice ? "Audio plays on this phone." : playerName ? `Audio plays on ${playerName}'s phone. Phones aren't perfectly in sync, so only that one plays.` : "No phone is playing audio yet."}
              </Text>
              {isMod && !s.isPlayerDevice ? <Button title="Play here" variant="secondary" onPress={() => run(s.send("room:setPlayer", { userId: s.me!.id }), "This phone is now playing the room's audio")} style={{ minHeight: 40 }} /> : null}
            </View>
          </View>

          {/* Members */}
          <View style={{ gap: space.md }}>
            <SectionHeader title={`In the room (${s.members.length})`} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.lg }} style={{ marginHorizontal: -space.lg }}>
              <View style={{ width: space.sm }} />
              {s.members.map((m) => (
                <Pressable key={m.userId} onPress={() => memberMenu(m)} accessibilityRole="button" accessibilityLabel={`${m.displayName}, ${m.role.toLowerCase()}, ${m.online ? "online" : "offline"}`} style={{ alignItems: "center", gap: 6, width: 64, opacity: m.online ? 1 : 0.5 }}>
                  <Avatar member={m} size={48} showOnline />
                  <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>{m.userId === s.me?.id ? "You" : m.displayName}</Text>
                  {m.role !== "MEMBER" ? <Text style={{ color: c1, fontSize: 11, fontWeight: "700" }}>{m.role === "HOST" ? "Host" : "Mod"}</Text> : null}
                </Pressable>
              ))}
              <View style={{ width: space.sm }} />
            </ScrollView>
          </View>

          {/* Queue */}
          <View style={{ gap: space.md }}>
            <SectionHeader title={`Up next (${upcoming.length})`} />
            {room?.queuePolicy === "MODERATORS_ONLY" && !isMod ? <Muted>Only the host and moderators add tracks here. You can still vote.</Muted> : null}
            {room?.voteOrdering ? <Muted>Most-voted track plays next.</Muted> : null}
            <Button title="Add tracks" icon="add" onPress={() => setAdding(true)} disabled={room?.queuePolicy === "MODERATORS_ONLY" && !isMod} />
            {upcoming.length === 0 ? <EmptyState icon="musical-notes-outline" title="The queue is empty" body="Search the catalog and add something everyone will like." /> : upcoming.map((it, i) => (
              <QueueRow key={it.id} item={it} index={i} last={i === upcoming.length - 1} meId={s.me?.id ?? ""} isMod={isMod} canReorder={isMod && !room?.voteOrdering} accent={c1}
                onVote={(v) => run(s.send("queue:vote", { itemId: it.id, value: v }))}
                onRemove={() => run(s.send("queue:remove", { itemId: it.id }))}
                onMove={(to) => run(s.send("queue:reorder", { itemId: it.id, toIndex: to }))} />
            ))}
          </View>

          {/* Host settings */}
          {isHost && room ? (
            <View style={{ gap: space.md }}>
              <SectionHeader title="Room settings" />
              <Row label="Only host and moderators add tracks" value={room.queuePolicy === "MODERATORS_ONLY"} onChange={(v) => run(s.send("room:updateSettings", { queuePolicy: v ? "MODERATORS_ONLY" : "ANYONE_CAN_ADD" }))} />
              <Row label="Most-voted track plays next" value={room.voteOrdering} onChange={(v) => run(s.send("room:updateSettings", { voteOrdering: v }))} />
            </View>
          ) : null}

          {/* Activity */}
          <View style={{ gap: space.sm }}>
            <SectionHeader title="Activity" />
            {s.activity.length === 0 ? <Muted>Nothing yet.</Muted> : [...s.activity].slice(-6).reverse().map((a) => <Text key={a.id} style={{ color: colors.muted }}>{a.text}</Text>)}
          </View>
        </View>
      </ScrollView>

      {room ? <InviteSheet roomId={room.id} roomName={room.name} visible={inviting} onClose={() => setInviting(false)} /> : null}
      <AddTracksSheet visible={adding} onClose={() => setAdding(false)} />
      <Toast msg={toast.msg} />
    </View>
  );
}

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
      <Text style={{ color: colors.text, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel={label} />
    </View>
  );
}

function QueueRow({ item, index, last, meId, isMod, canReorder, accent, onVote, onRemove, onMove }: {
  item: QueueItem; index: number; last: boolean; meId: string; isMod: boolean; canReorder: boolean; accent: string;
  onVote: (v: 1 | -1) => void; onRemove: () => void; onMove: (to: number) => void;
}) {
  const up = item.upvoterIds.includes(meId), down = item.downvoterIds.includes(meId);
  const canRemove = isMod || item.addedBy.id === meId;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.sm }}>
      <Artwork track={item.track} size={48} radiusPx={10} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: colors.text, fontWeight: "700" }}>{item.track.title}</Text>
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{item.track.artist} · added by {item.addedBy.id === meId ? "you" : item.addedBy.displayName}</Text>
      </View>
      <View style={{ alignItems: "center" }}>
        <IconButton name={up ? "chevron-up-circle" : "chevron-up-circle-outline"} color={up ? accent : colors.muted} label="Upvote" size={22} onPress={() => onVote(1)} style={{ height: 36 }} />
        <Text style={{ color: item.score > 0 ? accent : colors.muted, fontWeight: "800", fontSize: 13 }} accessibilityLabel={`Score ${item.score}`}>{item.score}</Text>
        <IconButton name={down ? "chevron-down-circle" : "chevron-down-circle-outline"} color={down ? colors.pink : colors.muted} label="Downvote" size={22} onPress={() => onVote(-1)} style={{ height: 36 }} />
      </View>
      <View>
        {canReorder ? <IconButton name="arrow-up" label="Move up" size={18} disabled={index === 0} onPress={() => onMove(index - 1)} style={{ height: 34 }} /> : null}
        {canRemove ? <IconButton name="close" label={`Remove ${item.track.title}`} size={18} color={colors.muted} onPress={onRemove} style={{ height: 34 }} /> : null}
        {canReorder ? <IconButton name="arrow-down" label="Move down" size={18} disabled={last} onPress={() => onMove(index + 1)} style={{ height: 34 }} /> : null}
      </View>
    </View>
  );
}
