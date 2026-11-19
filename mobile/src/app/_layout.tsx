import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { PlayerProvider } from "../lib/player";
import { RoomSessionProvider } from "../lib/room-session";
import { colors } from "../lib/theme";

function Gate() {
  const { ready, user } = useAuth();
  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="room/[id]" />
        <Stack.Screen name="create-room" options={{ presentation: "modal" }} />
        <Stack.Screen name="join/index" options={{ presentation: "modal" }} />
        <Stack.Screen name="join/[code]" options={{ presentation: "modal" }} />
        <Stack.Screen name="player" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <RoomSessionProvider>
          <PlayerProvider>
            <Gate />
          </PlayerProvider>
        </RoomSessionProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
