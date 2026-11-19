import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { Toast } from "../../components/Toast";
import { TrackActions } from "../../components/TrackActions";
import { Chip, EmptyState, ErrorBanner, H1, Muted, Screen, TrackRow, TrackSkeletons } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useDebounced, useFavoriteIds, useQuery, useToast } from "../../lib/hooks";
import { usePlayer } from "../../lib/player";
import { colors, radius, space } from "../../lib/theme";
import type { Track } from "../../lib/types";

export default function Discover() {
  const { api } = useAuth();
  const player = usePlayer();
  const fav = useFavoriteIds();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const dq = useDebounced(q.trim(), 300);
  const res = useQuery(() => api.get<{ tracks: Track[]; providerErrors: { providerId: string; message: string }[] }>(`/tracks/search?q=${encodeURIComponent(dq)}`), [dq]);
  const genres = useMemo(() => [...new Set((res.data?.tracks ?? []).map((t) => t.genre).filter(Boolean) as string[])].sort(), [res.data]);
  const shown = (res.data?.tracks ?? []).filter((t) => !genre || t.genre === genre);
  const onFav = (t: Track) => fav.toggle(t.id).catch((e) => toast.show(e.message, true));

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={false} onRefresh={() => res.reload(true)}>
        <H1>Discover</H1>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 16, minHeight: 50 }}>
          <Ionicons name="search" size={20} color={colors.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Song, artist or album" placeholderTextColor={colors.muted} accessibilityLabel="Search music"
            style={{ flex: 1, color: colors.text, fontSize: 16, minHeight: 48 }} autoCorrect={false} returnKeyType="search" />
          {q ? <Ionicons name="close-circle" size={20} color={colors.muted} onPress={() => setQ("")} accessibilityLabel="Clear search" /> : null}
        </View>

        {genres.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ marginHorizontal: -space.lg }}>
            <View style={{ width: space.lg - space.sm }} />
            <Chip label="All" active={!genre} onPress={() => setGenre(null)} />
            {genres.map((g) => <Chip key={g} label={g} active={genre === g} onPress={() => setGenre(genre === g ? null : g)} />)}
            <View style={{ width: space.lg - space.sm }} />
          </ScrollView>
        ) : null}

        {res.error ? <ErrorBanner message={res.error} onRetry={() => res.reload()} /> : null}
        {res.data?.providerErrors?.map((e) => <ErrorBanner key={e.providerId} message={e.message} />)}
        {res.loading && !res.data ? <TrackSkeletons n={6} /> : shown.length === 0 && !res.error ? (
          <EmptyState icon="search" title={dq ? `Nothing found for "${dq}"` : "No tracks yet"} body="Try a different title, artist or album." />
        ) : (
          <View style={{ gap: space.sm }}>
            <Muted>{shown.length} {shown.length === 1 ? "track" : "tracks"}</Muted>
            {shown.map((t) => (
              <TrackRow key={t.id} track={t} subtitle={t.album ? `${t.artist} · ${t.album}` : t.artist} active={player.track?.id === t.id}
                onPress={() => player.playSolo(t).catch((e) => toast.show(e.message, true))}
                right={<TrackActions track={t} favorite={fav.ids.has(t.id)} onFavorite={onFav} onNotify={toast.show} />} />
            ))}
          </View>
        )}
      </Screen>
      <Toast msg={toast.msg} />
    </View>
  );
}
