import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator, Animated, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  View, type StyleProp, type TextInputProps, type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { colors, gradients, radius, space } from "../lib/theme";
import type { Member, Track } from "../lib/types";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Screen({ children, scroll = true, refreshing, onRefresh, padBottom = 24, style }: {
  children: React.ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; padBottom?: number; style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + space.md, paddingHorizontal: space.lg, paddingBottom: padBottom };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: colors.bg }, pad, style]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[pad, { gap: space.lg }, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: colors.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.5 }} accessibilityRole="header">{children}</Text>;
}
export function Muted({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[{ color: colors.muted, fontSize: 13 }, style]}>{children}</Text>;
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: colors.text, fontSize: 19, fontWeight: "700" }} accessibilityRole="header">{title}</Text>
      {action ? <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button"><Text style={{ color: colors.primary, fontWeight: "600" }}>{action}</Text></Pressable> : null}
    </View>
  );
}

export function Button({ title, onPress, icon, variant = "primary", loading, disabled, style }: {
  title: string; onPress: () => void; icon?: IconName; variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  // A disabled gradient button just looks muddy, so disabled primaries go flat.
  const flat = !!disabled && !loading && variant === "primary";
  const inner = (
    <View style={styles.btnInner}>
      {loading ? <ActivityIndicator color="#fff" /> : icon ? <Ionicons name={icon} size={18} color={variant === "ghost" ? colors.primary : "#fff"} /> : null}
      <Text numberOfLines={1} style={[styles.btnText, variant === "ghost" && { color: colors.primary }, flat && { color: colors.muted }]}>{title}</Text>
    </View>
  );
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityState={{ disabled: !!off }} accessibilityLabel={title}
      style={({ pressed }) => [{ opacity: flat ? 1 : off ? 0.5 : pressed ? 0.85 : 1, borderRadius: radius.pill, overflow: "hidden", minHeight: 48 }, style]}>
      {flat ? (
        <View style={[styles.btnFill, { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }]}>{inner}</View>
      ) : variant === "primary" ? (
        <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.btnFill}>{inner}</LinearGradient>
      ) : (
        <View style={[styles.btnFill, variant === "secondary" && { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }, variant === "danger" && { backgroundColor: colors.danger + "33", borderWidth: 1, borderColor: colors.danger }, variant === "ghost" && { backgroundColor: "transparent" }]}>{inner}</View>
      )}
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, size = 24, color = colors.text, disabled, style }: {
  name: IconName; onPress: () => void; label: string; size?: number; color?: string; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} hitSlop={8}
      style={({ pressed }) => [{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }, style]}>
      <Ionicons name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Input(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ color: colors.muted, fontSize: 13, fontWeight: "600" }}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.muted} accessibilityLabel={label} {...rest}
        style={[{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, color: colors.text, paddingHorizontal: 16, minHeight: 50, fontSize: 16 }, style]} />
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, minHeight: 36, borderRadius: radius.pill, backgroundColor: active ? colors.primary : colors.surface2, borderWidth: 1, borderColor: active ? colors.primary : colors.border }}>
      {icon ? <Ionicons name={icon} size={14} color={active ? "#fff" : colors.muted} /> : null}
      <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "600", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const base = [{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.lg }, style];
  return onPress
    ? <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [...base, pressed && { opacity: 0.85 }]}>{children}</Pressable>
    : <View style={base}>{children}</View>;
}

export function Avatar({ member, size = 36, showOnline }: { member: Pick<Member, "displayName" | "avatarColor"> & { online?: boolean }; size?: number; showOnline?: boolean }) {
  return (
    <View accessibilityLabel={`${member.displayName}${showOnline ? (member.online ? ", online" : ", offline") : ""}`}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: member.avatarColor, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: "#fff", fontWeight: "800", fontSize: size * 0.42 }}>{member.displayName.trim().charAt(0).toUpperCase() || "?"}</Text>
      {showOnline ? <View style={{ position: "absolute", right: -1, bottom: -1, width: size * 0.3, height: size * 0.3, borderRadius: size, backgroundColor: member.online ? colors.success : colors.muted, borderWidth: 2, borderColor: colors.bg }} /> : null}
    </View>
  );
}

export function Artwork({ track, size = 52, radiusPx = 12 }: { track: Pick<Track, "artworkUrl" | "title"> | null; size?: number; radiusPx?: number }) {
  const { resolveUrl } = useAuth();
  const uri = resolveUrl(track?.artworkUrl ?? null);
  const [failed, setFailed] = React.useState(false);
  if (uri && !failed) {
    return <Image source={{ uri }} onError={() => setFailed(true)} accessibilityLabel={`Album art for ${track?.title}`} style={{ width: size, height: size, borderRadius: radiusPx, backgroundColor: colors.surface2 }} />;
  }
  return (
    <LinearGradient colors={gradients.cool} style={{ width: size, height: size, borderRadius: radiusPx, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name="musical-notes" size={size * 0.4} color="#ffffffcc" />
    </LinearGradient>
  );
}

export function AvailabilityBadge({ track }: { track: Track }) {
  const a = track.availability;
  if (a.status === "playable") return null;
  const label = a.status === "metadata-only" ? "Info only" : a.status === "external-player-required" ? "External player" : "Unavailable";
  return <View style={{ backgroundColor: colors.warning + "26", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}><Text style={{ color: colors.warning, fontSize: 11, fontWeight: "700" }}>{label}</Text></View>;
}

export function TrackRow({ track, onPress, right, subtitle, active, index }: {
  track: Track; onPress?: () => void; right?: React.ReactNode; subtitle?: string; active?: boolean; index?: number;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${track.title} by ${track.artist}`}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 60, opacity: pressed ? 0.7 : 1 })}>
      {index !== undefined ? <Text style={{ color: colors.muted, width: 18, textAlign: "center", fontWeight: "600" }}>{index}</Text> : null}
      <Artwork track={track} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={1} style={{ color: active ? colors.primary : colors.text, fontSize: 16, fontWeight: "600" }}>{track.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 13, flexShrink: 1 }}>{subtitle ?? track.artist}</Text>
          <AvailabilityBadge track={track} />
        </View>
      </View>
      {right}
    </Pressable>
  );
}

export function Skeleton({ height = 16, width = "100%", style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const o = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 0.4, duration: 700, useNativeDriver: true })]));
    a.start(); return () => a.stop();
  }, [o]);
  return <Animated.View style={[{ height, width, borderRadius: 8, backgroundColor: colors.surface2, opacity: o }, style]} />;
}

export function TrackSkeletons({ n = 5 }: { n?: number }) {
  return <View style={{ gap: space.md }}>{Array.from({ length: n }, (_, i) => (
    <View key={i} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
      <Skeleton height={52} width={52} style={{ borderRadius: 12 }} />
      <View style={{ flex: 1, gap: 8 }}><Skeleton height={14} width="60%" /><Skeleton height={11} width="40%" /></View>
    </View>
  ))}</View>;
}

export function EmptyState({ icon, title, body, action, compact }: { icon: IconName; title: string; body?: string; action?: React.ReactNode; compact?: boolean }) {
  if (compact) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={20} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontWeight: "700" }}>{title}</Text>
          {body ? <Text style={{ color: colors.muted, fontSize: 13 }}>{body}</Text> : null}
        </View>
        {action}
      </View>
    );
  }
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxl, gap: space.sm }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}><Ionicons name={icon} size={30} color={colors.primary} /></View>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{title}</Text>
      {body ? <Text style={{ color: colors.muted, textAlign: "center", maxWidth: 280 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: space.sm }}>{action}</View> : null}
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: colors.danger + "1F", borderColor: colors.danger + "66", borderWidth: 1, borderRadius: radius.md, padding: space.md }}>
      <Ionicons name="alert-circle" size={20} color={colors.danger} />
      <Text style={{ color: colors.text, flex: 1 }}>{message}</Text>
      {onRetry ? <Pressable onPress={onRetry} hitSlop={10} accessibilityRole="button"><Text style={{ color: colors.danger, fontWeight: "700" }}>Retry</Text></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  btnFill: { minHeight: 48, paddingHorizontal: 22, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  btnInner: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
