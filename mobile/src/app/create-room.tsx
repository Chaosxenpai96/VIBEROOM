import { useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from "react-native";
import { Button, Chip, ErrorBanner, Input, Muted } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useRoomSession } from "../lib/room-session";
import { colors, space, type } from "../lib/theme";
import type { Room } from "../lib/types";

export default function CreateRoom() {
  const { api } = useAuth();
  const router = useRouter();
  const session = useRoomSession();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"PUBLIC" | "PRIVATE">("PUBLIC");
  const [password, setPassword] = useState("");
  const [max, setMax] = useState(20);
  const [modsOnly, setModsOnly] = useState(false);
  const [votes, setVotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const { room } = await api.post<{ room: Room }>("/rooms", {
        name: name.trim(), description: description.trim() || undefined, visibility, password: password || undefined,
        maxMembers: max, queuePolicy: modsOnly ? "MODERATORS_ONLY" : "ANYONE_CAN_ADD", voteOrdering: votes,
      });
      await session.enterRoom(room.id);
      router.replace(`/room/${room.id}`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.lg }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.text, ...type.title }}>Create a room</Text>
        {error ? <ErrorBanner message={error} /> : null}
        <Input label="Room name" value={name} onChangeText={setName} placeholder="Friday night mix" maxLength={60} />
        <Input label="Description (optional)" value={description} onChangeText={setDescription} maxLength={240} />

        <View style={{ gap: space.sm }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Who can find it</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Chip label="Public" icon="earth" active={visibility === "PUBLIC"} onPress={() => setVisibility("PUBLIC")} />
            <Chip label="Private" icon="lock-closed" active={visibility === "PRIVATE"} onPress={() => setVisibility("PRIVATE")} />
          </View>
          <Muted>{visibility === "PUBLIC" ? "Listed under Open rooms. Anyone can join." : "Hidden from the list. People need your code or QR."}</Muted>
        </View>

        <Input label="Password (optional)" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder="At least 4 characters" />

        <View style={{ gap: space.sm }}>
          <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>Maximum people</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>{[5, 10, 20, 50].map((n) => <Chip key={n} label={String(n)} active={max === n} onPress={() => setMax(n)} />)}</View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "600" }}>Only host and moderators add tracks</Text><Muted>Everyone else can still vote.</Muted></View>
          <Switch value={modsOnly} onValueChange={setModsOnly} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel="Only host and moderators add tracks" />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <View style={{ flex: 1 }}><Text style={{ color: colors.text, fontWeight: "600" }}>Most-voted track plays next</Text><Muted>Otherwise tracks play in the order added.</Muted></View>
          <Switch value={votes} onValueChange={setVotes} trackColor={{ true: colors.primary, false: colors.border }} accessibilityLabel="Most-voted track plays next" />
        </View>

        <Button title="Create room" onPress={create} loading={busy} disabled={!name.trim() || (!!password && password.length < 4)} />
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
