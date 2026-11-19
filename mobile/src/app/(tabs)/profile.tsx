import React, { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Toast } from "../../components/Toast";
import { Avatar, Button, Card, H1, Input, Muted, Screen, SectionHeader } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { useToast } from "../../lib/hooks";
import { colors, space, type } from "../../lib/theme";

const SWATCHES = ["#8B5CF6", "#EC4899", "#22D3EE", "#34D399", "#FBBF24", "#F97316", "#6366F1", "#14B8A6"];

export default function Profile() {
  const { user, updateProfile, signOut, serverUrl, setServerUrl } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user?.displayName ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [color, setColor] = useState(user?.avatarColor ?? SWATCHES[0]);
  const [server, setServer] = useState(serverUrl);
  const [saving, setSaving] = useState(false);
  if (!user) return null;
  const dirty = name.trim() !== user.displayName || bio.trim() !== (user.bio ?? "") || color !== user.avatarColor;

  const save = async () => {
    setSaving(true);
    try { await updateProfile({ displayName: name.trim(), bio: bio.trim(), avatarColor: color }); toast.show("Profile saved"); }
    catch (e: any) { toast.show(e.message, true); } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <H1>Profile</H1>
        <View style={{ alignItems: "center", gap: space.sm }}>
          <Avatar member={{ displayName: name || user.displayName, avatarColor: color }} size={96} />
          <Muted>{user.email}</Muted>
        </View>

        <Text style={{ color: colors.text, ...type.heading }}>Avatar color</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md }}>
          {SWATCHES.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} accessibilityRole="button" accessibilityLabel={`Avatar color ${c}`} accessibilityState={{ selected: color === c }}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: "#fff" }} />
          ))}
        </View>

        <Input label="Display name" value={name} onChangeText={setName} maxLength={40} />
        <Input label="Bio" value={bio} onChangeText={setBio} maxLength={160} multiline placeholder="What do you listen to?" style={{ minHeight: 80, paddingTop: 12, textAlignVertical: "top" }} />
        <Button title="Save changes" onPress={save} disabled={!dirty || !name.trim()} loading={saving} />

        <SectionHeader title="Server" />
        <Card>
          <Input label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <View style={{ height: space.md }} />
          <Button title="Use this server" variant="secondary" disabled={server.trim() === serverUrl} onPress={() => Alert.alert("Switch server?", "You'll stay signed in only if this server knows your account.", [
            { text: "Cancel", style: "cancel" }, { text: "Switch server", onPress: () => void setServerUrl(server).then(() => toast.show("Server updated")) },
          ])} />
        </Card>

        <Button title="Sign out" variant="danger" icon="log-out-outline" onPress={() => void signOut()} />
      </Screen>
      <Toast msg={toast.msg} />
    </View>
  );
}
