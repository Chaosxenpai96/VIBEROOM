import React, { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Toast } from "../../components/Toast";
import { TrackActions } from "../../components/TrackActions";
import { Button, Card, EmptyState, ErrorBanner, H1, IconButton, Input, Muted, Screen, SectionHeader, TrackRow, TrackSkeletons } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useFavoriteIds, useQuery, useToast } from "../../lib/hooks";
import { usePlayer } from "../../lib/player";
import { colors, space, type } from "../../lib/theme";
import type { Track } from "../../lib/types";

interface PlaylistItem { id: string; name: string; trackCount: number }

export default function Library() {
  const { api } = useAuth();
  const player = usePlayer();
  const toast = useToast();
  const fav = useFavoriteIds();
  const favs = useQuery(() => api.get<{ tracks: Track[] }>("/library/favorites").then((r) => r.tracks), []);
  const recent = useQuery(() => api.get<{ tracks: Track[] }>("/library/recent").then((r) => r.tracks), []);
  const lists = useQuery(() => api.get<{ playlists: PlaylistItem[] }>("/library/playlists").then((r) => r.playlists), []);
  const [open, setOpen] = useState<string | null>(null);
  const [openTracks, setOpenTracks] = useState<Track[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const onFav = async (t: Track) => { try { await fav.toggle(t.id); void favs.reload(true); } catch (e: any) { toast.show(e.message, true); } };
  const play = (t: Track) => player.playSolo(t).catch((e) => toast.show(e.message, true));
  const reloadAll = () => { void favs.reload(true); void recent.reload(true); void lists.reload(true); void fav.reload(); };

  const loadList = async (id: string) => {
    try { setOpenTracks((await api.get<{ tracks: Track[] }>(`/library/playlists/${id}`)).tracks); setOpen(id); } catch (e: any) { toast.show(e.message, true); }
  };
  const toggleList = async (id: string) => { if (open === id) setOpen(null); else await loadList(id); };
  const create = async () => {
    setCreating(true);
    try { await api.post("/library/playlists", { name: name.trim() }); setName(""); await lists.reload(true); toast.show("Playlist created"); }
    catch (e: any) { toast.show(e.message, true); } finally { setCreating(false); }
  };
  const addTo = async (playlistId: string, t: Track) => {
    try { await api.post(`/library/playlists/${playlistId}/tracks`, { trackId: t.id }); toast.show(`Added "${t.title}"`); void lists.reload(true); }
    catch (e: any) { toast.show(e.message, true); }
  };
  const removeList = (p: PlaylistItem) => Alert.alert(`Delete "${p.name}"?`, "This removes the playlist but not the tracks.", [
    { text: "Cancel", style: "cancel" },
    { text: "Delete playlist", style: "destructive", onPress: async () => { try { await api.del(`/library/playlists/${p.id}`); setOpen(null); void lists.reload(true); } catch (e: any) { toast.show(e.message, true); } } },
  ]);

  const row = (t: Track, extra?: React.ReactNode) => (
    <TrackRow key={t.id} track={t} active={player.track?.id === t.id} onPress={() => play(t)}
      right={<View style={{ flexDirection: "row", alignItems: "center" }}>{extra}<TrackActions track={t} favorite={fav.ids.has(t.id)} onFavorite={onFav} onNotify={toast.show} /></View>} />
  );

  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={false} onRefresh={reloadAll}>
        <H1>Library</H1>
        <Muted>Your playlists are personal. A room's queue is separate and shared with everyone in it.</Muted>

        <SectionHeader title="Playlists" />
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}><Input value={name} onChangeText={setName} placeholder="New playlist name" maxLength={60} /></View>
          <Button title="Create" onPress={create} disabled={!name.trim()} loading={creating} />
        </View>
        {lists.error ? <ErrorBanner message={lists.error} onRetry={() => lists.reload()} /> : null}
        {lists.loading && !lists.data ? <TrackSkeletons n={2} /> : (lists.data ?? []).length === 0 ? (
          <EmptyState compact icon="albums-outline" title="No playlists yet" body="Name one above, then add tracks from your favorites." />
        ) : (
          <View style={{ gap: space.md }}>
            {lists.data!.map((p) => (
              <Card key={p.id} onPress={() => toggleList(p.id)}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text numberOfLines={1} style={{ color: colors.text, ...type.heading }}>{p.name}</Text>
                    <Muted>{p.trackCount} {p.trackCount === 1 ? "track" : "tracks"}</Muted>
                  </View>
                  <IconButton name="trash-outline" label={`Delete playlist ${p.name}`} color={colors.muted} size={20} onPress={() => removeList(p)} />
                </View>
                {open === p.id ? (
                  <View style={{ gap: space.sm, marginTop: space.md }}>
                    {openTracks.length === 0 ? <Muted>Empty. Add tracks from your favorites below.</Muted> : openTracks.map((t) => row(t))}
                    {(favs.data ?? []).filter((f) => !openTracks.some((o) => o.id === f.id)).slice(0, 5).map((f) => (
                      <Button key={f.id} title={`Add "${f.title}"`} icon="add" variant="ghost" onPress={() => addTo(p.id, f).then(() => loadList(p.id))} />
                    ))}
                  </View>
                ) : null}
              </Card>
            ))}
          </View>
        )}

        <SectionHeader title="Favorites" />
        {favs.error ? <ErrorBanner message={favs.error} onRetry={() => favs.reload()} /> : null}
        {favs.loading && !favs.data ? <TrackSkeletons n={3} /> : (favs.data ?? []).length === 0 ? (
          <EmptyState compact icon="heart-outline" title="No favorites yet" body="Tap the heart on any track to keep it here." />
        ) : <View style={{ gap: space.sm }}>{favs.data!.map((t) => row(t))}</View>}

        <SectionHeader title="Recently played" />
        {recent.loading && !recent.data ? <TrackSkeletons n={3} /> : (recent.data ?? []).length === 0 ? (
          <EmptyState compact icon="time-outline" title="Nothing played yet" body="Tracks you play on this phone or in a room show up here." />
        ) : <View style={{ gap: space.sm }}>{recent.data!.map((t) => row(t))}</View>}
      </Screen>
      <Toast msg={toast.msg} />
    </View>
  );
}
