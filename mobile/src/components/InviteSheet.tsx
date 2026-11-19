import React from "react";
import { Image, Modal, Share, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { useQuery } from "../lib/hooks";
import { colors, radius, space, type } from "../lib/theme";
import { Button, ErrorBanner, IconButton, Muted, Skeleton } from "./ui";

interface Invite { code: string; link: string; hasPassword: boolean; qrDataUrl: string }

export function InviteSheet({ roomId, roomName, visible, onClose }: { roomId: string; roomName: string; visible: boolean; onClose: () => void }) {
  const { api } = useAuth();
  const inv = useQuery(() => (visible ? api.get<Invite>(`/rooms/${roomId}/invite`) : Promise.resolve(null)), [roomId, visible]);
  const d = inv.data;
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, gap: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text, ...type.title }}>Invite friends</Text>
          <IconButton name="close" label="Close" onPress={onClose} />
        </View>
        {inv.error ? <ErrorBanner message={inv.error} onRetry={() => inv.reload()} /> : null}
        {!d ? <Skeleton height={280} style={{ borderRadius: radius.lg }} /> : (
          <View style={{ alignItems: "center", gap: space.lg }}>
            <View style={{ backgroundColor: "#fff", padding: 12, borderRadius: radius.lg }}>
              <Image source={{ uri: d.qrDataUrl }} style={{ width: 240, height: 240 }} accessibilityLabel={`QR code to join ${roomName}`} />
            </View>
            <View style={{ alignItems: "center", gap: 4 }}>
              <Muted>Room code</Muted>
              <Text selectable style={{ color: colors.text, ...type.display, letterSpacing: 4 }}>{d.code}</Text>
              {d.hasPassword ? <Muted>This room has a password. Share it separately.</Muted> : null}
            </View>
            <Button title="Share invite" icon="share-outline" onPress={() => void Share.share({ message: `Join "${roomName}" on VibeRoom. Code: ${d.code}\n${d.link}` })} />
            <Muted style={{ textAlign: "center" }}>Friends open VibeRoom, tap Join, then scan this code or type it in.</Muted>
          </View>
        )}
      </View>
    </Modal>
  );
}
