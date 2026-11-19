import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, ErrorBanner, Input } from "../components/ui";
import { useAuth } from "../lib/auth";
import { colors, gradients, space } from "../lib/theme";

type Mode = "login" | "register" | "reset";

export default function Login() {
  const { signIn, signUp, serverUrl, setServerUrl, api } = useAuth();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [server, setServer] = useState(serverUrl);
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null); setInfo(null);
    try { await setServerUrl(server); await fn(); } catch (e: any) { setError(e.message ?? "Something went wrong"); } finally { setBusy(false); }
  };

  const submit = () => run(async () => {
    if (mode === "login") await signIn(email.trim(), password);
    else if (mode === "register") await signUp(email.trim(), password, name.trim());
    else if (!resetSent) {
      const r = await api.post<{ devToken?: string }>("/auth/password-reset/request", { email: email.trim() });
      setResetSent(true);
      if (r.devToken) { setToken(r.devToken); setInfo("Development server: the reset token was filled in for you (no email service is configured)."); }
      else setInfo("If that email has an account, a reset link has been sent.");
    } else {
      await api.post("/auth/password-reset/confirm", { token: token.trim(), password });
      setMode("login"); setResetSent(false); setPassword(""); setInfo("Password updated. Sign in with your new password.");
    }
  });

  const title = mode === "login" ? "Welcome back" : mode === "register" ? "Create your account" : "Reset password";
  const cta = mode === "login" ? "Sign in" : mode === "register" ? "Create account" : resetSent ? "Set new password" : "Send reset token";

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: space.xl, paddingTop: insets.top + 48, gap: space.lg, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", gap: space.md, marginBottom: space.lg }}>
          <LinearGradient colors={gradients.primary} style={{ width: 84, height: 84, borderRadius: 26, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="musical-notes" size={44} color="#fff" />
          </LinearGradient>
          <Text style={{ color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: -1 }}>VibeRoom</Text>
          <Text style={{ color: colors.muted }}>Listen together. Sing together.</Text>
        </View>

        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "700" }}>{title}</Text>
        {error ? <ErrorBanner message={error} /> : null}
        {info ? <Text style={{ color: colors.success }}>{info}</Text> : null}

        {mode === "register" ? <Input label="Display name" value={name} onChangeText={setName} placeholder="How friends will see you" maxLength={40} autoCapitalize="words" /> : null}
        <Input label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} editable={!(mode === "reset" && resetSent)} />
        {mode === "reset" && resetSent ? <Input label="Reset token" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} /> : null}
        {mode !== "reset" || resetSent ? (
          <Input label={mode === "reset" ? "New password" : "Password"} value={password} onChangeText={setPassword} placeholder="At least 8 characters" secureTextEntry autoCapitalize="none" />
        ) : null}

        <Button title={cta} onPress={submit} loading={busy} disabled={!email || (mode === "register" && !name.trim()) || (mode !== "reset" && !password) || (mode === "reset" && resetSent && (!token || !password))} />

        <View style={{ gap: space.sm, alignItems: "center" }}>
          {mode !== "login" ? <Pressable onPress={() => { setMode("login"); setError(null); setResetSent(false); }}><Text style={{ color: colors.primary, fontWeight: "600" }}>I already have an account</Text></Pressable> : null}
          {mode !== "register" ? <Pressable onPress={() => { setMode("register"); setError(null); }}><Text style={{ color: colors.primary, fontWeight: "600" }}>Create an account</Text></Pressable> : null}
          {mode === "login" ? <Pressable onPress={() => { setMode("reset"); setError(null); }}><Text style={{ color: colors.muted }}>Forgot password?</Text></Pressable> : null}
        </View>

        <View style={{ marginTop: "auto", gap: space.sm }}>
          <Pressable onPress={() => setShowServer((s) => !s)} style={{ flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", minHeight: 44 }} accessibilityRole="button">
            <Ionicons name="server-outline" size={16} color={colors.muted} />
            <Text style={{ color: colors.muted }}>Server: {serverUrl}</Text>
          </Pressable>
          {showServer ? (
            <View style={{ gap: space.sm }}>
              <Input label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="http://192.168.1.20:4000" />
              <Text style={{ color: colors.muted, fontSize: 12 }}>Use your computer's Wi-Fi address (not localhost) when testing on a phone.</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
