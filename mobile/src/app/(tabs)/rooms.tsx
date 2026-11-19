import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";
import { RoomCard } from "../../components/RoomCard";
import { Button, Chip, EmptyState, ErrorBanner, H1, Input, Screen, TrackSkeletons } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useQuery } from "../../lib/hooks";
import { space } from "../../lib/theme";
import type { RoomListItem } from "../../lib/types";

export default function Rooms() {
  const { api } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<"public" | "mine">("public");
  const [code, setCode] = useState("");
  const list = useQuery(() => api.get<{ rooms: RoomListItem[] }>(`/rooms/${tab}`).then((r) => r.rooms), [tab]);
  const cleaned = code.trim().toUpperCase();

  return (
    <Screen refreshing={false} onRefresh={() => list.reload(true)}>
      <H1>Rooms</H1>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
        <View style={{ flex: 1 }}><Input label="Have a room code?" value={code} onChangeText={setCode} placeholder="Enter code" autoCapitalize="characters" autoCorrect={false} maxLength={12} /></View>
        <Button title="Join" onPress={() => router.push(`/join/${cleaned}`)} disabled={cleaned.length < 4} />
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Chip label="Open rooms" icon="earth" active={tab === "public"} onPress={() => setTab("public")} />
        <Chip label="My rooms" icon="person" active={tab === "mine"} onPress={() => setTab("mine")} />
      </View>
      {list.error ? <ErrorBanner message={list.error} onRetry={() => list.reload()} /> : null}
      {list.loading && !list.data ? <TrackSkeletons n={3} /> : (list.data ?? []).length === 0 && !list.error ? (
        <EmptyState icon="people-outline" title={tab === "public" ? "No open rooms right now" : "You're not in any rooms"}
          body={tab === "public" ? "Start one and friends can join with your code." : "Create a room or join one with a code."}
          action={<Button title="Create a room" icon="add" onPress={() => router.push("/create-room")} />} />
      ) : (
        <View style={{ gap: space.md }}>
          {(list.data ?? []).map((r) => <RoomCard key={r.id} room={r} onPress={() => router.push(tab === "mine" ? `/room/${r.id}` : `/join/${r.code}`)} />)}
        </View>
      )}
      <Button title="Create a room" icon="add" variant="secondary" onPress={() => router.push("/create-room")} />
    </Screen>
  );
}
