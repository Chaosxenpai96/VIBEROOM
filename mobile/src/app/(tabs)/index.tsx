import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { RoomCard } from "../../components/RoomCard";
import { Toast } from "../../components/Toast";
import { TrackActions } from "../../components/TrackActions";
import { Button, EmptyState, ErrorBanner, H1, Muted, Screen, SectionHeader, TrackRow, TrackSkeletons } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useFavoriteIds, useQuery, useToast } from "../../lib/hooks";
import { usePlayer } from "../../lib/player";
import { colors, space, type } from "../../lib/theme";
import type { RoomListItem, Track } from "../../lib/types";

export default function Home() {
  const { api, user } = useAuth();
  const router = useRouter();
  const player = usePlayer();
  const fav = useFavoriteIds();
  const toast = useToast();
  const mine = useQuery(() => api.get<{ rooms: RoomListItem[] }>("/rooms/mine").then((r) => r.rooms), []);
  const live = useQuery(() => api.get<{ rooms: RoomListItem[] }>("/rooms/public").then((r) => r.rooms), []);
  const picks = useQuery(() => api.get<{ tracks: Track[] }>("/tracks/search?q=").then((r) => r.tracks.slice(0, 6)), []);
  const refreshing = mine.loading || live.loading || picks.loading;
  const reloadAll = () => { void mine.reload(true); void live.reload(true); void picks.reload(true); };
  const onFav = (t: Track) => fav.toggle(t.id).catch((e) => toast.show(e.message, true));

  const joinable = (live.data ?? []).filter((r) => !(mine.data ?? []).some((m) => m.id === r.id));

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={false} onRefresh={reloadAll}>
        <View style={{ gap: 4 }}>
          <Muted>Hi {user?.displayName}</Muted>
          <H1>Listen together</H1>
        </View>

        <View style={{ flexDirection: "row", gap: space.md }}>
          <Button title="New room" icon="add" onPress={() => router.push("/create-room")} style={{ flex: 1 }} />
          <Button title="Join" icon="enter-outline" variant="secondary" onPress={() => router.push("/join")} style={{ flex: 1 }} />
        </View>

        <SectionHeader title="Your rooms" />
        {mine.error ? <ErrorBanner message={mine.error} onRetry={() => mine.reload()} /> : null}
        {mine.loading && !mine.data ? <TrackSkeletons n={2} /> : (mine.data ?? []).length === 0 ? (
          <EmptyState compact icon="people-outline" title="No rooms yet" body="Create one, or join a friend's." />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md }} style={{ marginHorizontal: -space.lg }} contentInsetAdjustmentBehavior="never">
            <View style={{ width: space.lg - space.md }} />
            {mine.data!.map((r) => <RoomCard key={r.id} room={r} width={230} onPress={() => router.push(`/room/${r.id}`)} />)}
            <View style={{ width: space.lg - space.md }} />
          </ScrollView>
        )}

        <SectionHeader title="Open to join" action="See all" onAction={() => router.push("/rooms")} />
        {live.error ? <ErrorBanner message={live.error} onRetry={() => live.reload()} /> : null}
        {live.loading && !live.data ? <TrackSkeletons n={2} /> : joinable.length === 0 ? (
          <Muted>No other open rooms right now.</Muted>
        ) : (
          <View style={{ gap: space.md }}>{joinable.slice(0, 3).map((r) => <RoomCard key={r.id} room={r} onPress={() => router.push(`/join/${r.code}`)} />)}</View>
        )}

        <SectionHeader title="From the demo catalog" />
        <Text style={{ color: colors.muted, ...type.small }}>Original tracks made for VibeRoom. Tap play to listen on this phone.</Text>
        {picks.error ? <ErrorBanner message={picks.error} onRetry={() => picks.reload()} /> : null}
        {picks.loading && !picks.data ? <TrackSkeletons n={4} /> : (
          <View style={{ gap: space.sm }}>
            {(picks.data ?? []).map((t) => (
              <TrackRow key={t.id} track={t} active={player.track?.id === t.id} onPress={() => player.playSolo(t).catch((e) => toast.show(e.message, true))}
                right={<TrackActions track={t} favorite={fav.ids.has(t.id)} onFavorite={onFav} onNotify={toast.show} />} />
            ))}
          </View>
        )}
      </Screen>
      <Toast msg={toast.msg} />
    </View>
  );
}
