import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Button, ErrorBanner, Input, Muted } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useRoomSession } from "../../lib/room-session";
import { colors, space, type } from "../../lib/theme";
import type { Room } from "../../lib/types";

export default function JoinRoom() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const session = useRoomSession();
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const join = async () => {
    setBusy(true); setError(null);
    try {
      const { room } = await api.post<{ room: Room }>("/rooms/join", { code: String(code), password: password || undefined });
      await session.enterRoom(room.id);
      router.replace(`/room/${room.id}`);
    } catch (e: any) {
      if (/password/i.test(e.message)) setNeedsPassword(true);
      setError(e.message);
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, gap: space.lg, justifyContent: "center" }}>
      <View style={{ gap: 4 }}>
        <Muted>Room code</Muted>
        <Text style={{ color: colors.text, ...type.display, letterSpacing: 4 }}>{String(code).toUpperCase()}</Text>
      </View>
      {error ? <ErrorBanner message={error} /> : null}
      {needsPassword ? <Input label="Room password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" /> : null}
      <Button title="Join room" onPress={join} loading={busy} disabled={needsPassword && !password} />
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </View>
  );
}
