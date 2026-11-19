import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { colors, radius, roomColors, type } from "../lib/theme";
import type { RoomListItem } from "../lib/types";

/** The room's own two-colour identity is the one expressive element here; the rest stays quiet. */
export function RoomCard({ room, onPress, width }: { room: RoomListItem; onPress: () => void; width?: number }) {
  const [a, b] = roomColors(room.code);
  const full = room.memberCount >= room.maxMembers;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${room.name}, ${room.onlineCount} online of ${room.memberCount} members${room.hasPassword ? ", password protected" : ""}`}
      style={({ pressed }) => ({ width, borderRadius: radius.lg, overflow: "hidden", opacity: pressed ? 0.88 : 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface })}>
      <LinearGradient colors={[a, b]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ height: 78, justifyContent: "flex-end", padding: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: room.onlineCount > 0 ? "#fff" : "#ffffff55" }} />
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{room.onlineCount} online</Text>
        </View>
      </LinearGradient>
      <View style={{ padding: 12, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ color: colors.text, ...type.heading, fontSize: 17, flexShrink: 1 }}>{room.name}</Text>
          {room.hasPassword ? <Ionicons name="lock-closed" size={13} color={colors.muted} /> : null}
        </View>
        <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13 }}>
          {room.hostName ? `Hosted by ${room.hostName}` : room.myRole === "HOST" ? "You host this room" : room.description ?? "Shared queue"}
        </Text>
        <Text style={{ color: full ? colors.warning : colors.muted, fontSize: 12 }}>{full ? "Room is full" : `${room.memberCount} of ${room.maxMembers} members`}</Text>
      </View>
    </Pressable>
  );
}
