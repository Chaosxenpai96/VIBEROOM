import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import { Text, View } from "react-native";
import { Button, Input, Muted } from "../../components/ui";
import { colors, radius, space, type } from "../../lib/theme";

/** Accepts a bare code or a viberoom://join/CODE link. */
export const parseCode = (raw: string) => {
  const m = raw.trim().match(/join\/([A-Za-z0-9]{4,12})\/?$/);
  return (m ? m[1] : raw.trim()).toUpperCase();
};

export default function JoinIndex() {
  const router = useRouter();
  const [perm, requestPerm] = useCameraPermissions();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const handled = useRef(false);

  const go = (c: string) => { if (c.length >= 4) router.replace(`/join/${c}`); };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.xl, gap: space.lg }}>
      <Text style={{ color: colors.text, ...type.title }}>Join a room</Text>
      <Input label="Room code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="Enter code" autoCapitalize="characters" autoCorrect={false} maxLength={40} />
      <Button title="Join room" onPress={() => go(parseCode(code))} disabled={parseCode(code).length < 4} />

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: space.sm }} />

      {!scanning ? (
        <View style={{ gap: space.sm }}>
          <Button title="Scan a QR code" icon="qr-code-outline" variant="secondary" onPress={async () => {
            if (!perm?.granted) { const r = await requestPerm(); if (!r.granted) return; }
            handled.current = false; setScanning(true);
          }} />
          {perm && !perm.granted && !perm.canAskAgain ? <Muted>Camera access is off. Turn it on in your phone's settings to scan, or type the code above.</Muted> : null}
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <View style={{ height: 300, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, borderColor: colors.border }}>
            <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => { if (handled.current) return; const c = parseCode(data); if (c.length >= 4) { handled.current = true; go(c); } }} />
          </View>
          <Muted>Point the camera at the QR code on the host's phone.</Muted>
          <Button title="Stop scanning" variant="ghost" onPress={() => setScanning(false)} />
        </View>
      )}
      <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
    </View>
  );
}
