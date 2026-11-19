import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MiniPlayer } from "../../components/MiniPlayer";
import { colors, TAB_BAR_HEIGHT } from "../../lib/theme";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: Record<string, { title: string; active: IconName; inactive: IconName }> = {
  index: { title: "Home", active: "home", inactive: "home-outline" },
  discover: { title: "Discover", active: "compass", inactive: "compass-outline" },
  rooms: { title: "Rooms", active: "people", inactive: "people-outline" },
  library: { title: "Library", active: "library", inactive: "library-outline" },
  profile: { title: "Profile", active: "person-circle", inactive: "person-circle-outline" },
};

/** Custom tab bar so the persistent mini-player can sit directly above the tabs. */
function TabBarWithPlayer({ state, emitter, navigateToTab }: { state: any; emitter: any; navigateToTab: (key: string) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.bg }}>
      <MiniPlayer />
      <View style={{ flexDirection: "row", height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom, borderTopWidth: 1, borderTopColor: colors.border }}>
        {state.routes.map((route: any, index: number) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          const color = focused ? colors.primary : colors.muted;
          const onPress = () => {
            const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !e?.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable key={route.key} onPress={onPress} accessibilityRole="tab" accessibilityLabel={meta.title} accessibilityState={{ selected: focused }}
              style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2 }}>
              <Ionicons name={focused ? meta.active : meta.inactive} size={24} color={color} />
              <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{meta.title}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBarWithPlayer state={p.state} emitter={p.emitter} navigateToTab={p.navigateToTab} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="discover" options={{ title: "Discover" }} />
      <Tabs.Screen name="rooms" options={{ title: "Rooms" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
