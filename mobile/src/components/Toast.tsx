import React from "react";
import { Text, View } from "react-native";
import { colors, radius, TAB_BAR_HEIGHT } from "../lib/theme";

export function Toast({ msg }: { msg: { text: string; error: boolean } | null }) {
  if (!msg) return null;
  return (
    <View pointerEvents="none" accessibilityLiveRegion="polite" style={{ position: "absolute", left: 16, right: 16, bottom: TAB_BAR_HEIGHT + 90, alignItems: "center" }}>
      <View style={{ backgroundColor: msg.error ? colors.danger : colors.surface2, borderColor: msg.error ? colors.danger : colors.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 11, maxWidth: "100%" }}>
        <Text style={{ color: "#fff", fontWeight: "600" }}>{msg.text}</Text>
      </View>
    </View>
  );
}
