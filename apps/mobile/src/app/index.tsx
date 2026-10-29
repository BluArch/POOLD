import React, { useState } from "react";
import {
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, Redirect } from "expo-router";
import { useSession } from "../session";
import EmailVerification from "../components/EmailVerification";
export default function Home() {
  const s = useSession(),
    query = useLocalSearchParams<{
      order?: string;
      invite?: string;
    }>();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [passwordVisible, setPasswordVisible] = useState(false),
    [name, setName] = useState(""),
    [mode, setMode] = useState<"login" | "register">("login"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (s.loading)
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator accessibilityLabel="Loading session" />
      </SafeAreaView>
    );
  if (s.user?.verified)
    return (
      <Redirect
        href={
          query.order
            ? {
                pathname: "/(tabs)/order/[id]",
                params: {
                  id: query.order,
                  ...(query.invite ? { invite: query.invite } : {}),
                },
              }
            : "/(tabs)/community"
        }
      />
    );
  if (s.user)
    return (
      <EmailVerification
        onSignOut={() => {
          setMessage("");
          setError("");
          setPassword("");
          setMode("login");
        }}
      />
    );
  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.brand}>poold</Text>
          <Text style={styles.title}>Good things, shared.</Text>
          <Text style={styles.muted}>
            Bulk groceries. Portions that fit your life.
          </Text>
          {!!(error || s.error) && (
            <Text accessibilityRole="alert" style={styles.error}>
              {error || s.error}
            </Text>
          )}
          {!!s.error && (
            <Pressable style={styles.link} onPress={() => run(s.refresh)}>
              <Text>Retry connection</Text>
            </Pressable>
          )}
          {!!message && <Text>{message}</Text>}
          {!s.user ? (
            <>
              <Text style={styles.heading}>
                {mode === "login" ? "Sign in" : "Create your account"}
              </Text>
              {mode === "register" && (
                <TextInput
                  style={styles.input}
                  placeholder="Display name"
                  accessibilityLabel="Display name"
                  value={name}
                  onChangeText={setName}
                />
              )}
              <TextInput
                style={styles.input}
                placeholder="Email address"
                accessibilityLabel="Email address"
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
              <View style={styles.passwordField}>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Password"
                  accessibilityLabel="Password"
                  secureTextEntry={!passwordVisible}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    passwordVisible ? "Hide password" : "Show password"
                  }
                  onPress={() => setPasswordVisible((visible) => !visible)}
                  style={styles.passwordToggle}
                >
                  <Ionicons
                    name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                    size={22}
                    color="#576780"
                  />
                </Pressable>
              </View>
              {mode === "register" && (
                <Text style={styles.muted}>
                  Use at least 8 characters for your password.
                </Text>
              )}
              <Pressable
                style={styles.button}
                disabled={busy}
                onPress={() =>
                  run(async () => {
                    if (mode === "register") {
                      const r = await s.login("/auth/register", {
                        name,
                        email,
                        password,
                      });
                      setMessage(r.message ?? "Your account has been created.");
                      setPassword("");
                      setPasswordVisible(false);
                    } else await s.login("/auth/login", { email, password });
                  })
                }
              >
                <Text style={styles.buttonText}>
                  {busy
                    ? "Please wait…"
                    : mode === "login"
                      ? "Sign in"
                      : "Create account"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.link}
                onPress={() => {
                  setError("");
                  setMessage("");
                  setPasswordVisible(false);
                  setMode(mode === "login" ? "register" : "login");
                }}
              >
                <Text>
                  {mode === "login" ? "Create an account" : "Back to sign in"}
                </Text>
              </Pressable>
              {s.demoEnabled && (
                <>
                  <Text style={styles.heading}>Local demo</Text>
                  <Text style={styles.muted}>
                    Explore POOLD with a sample account.
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.link}
                    disabled={busy}
                    onPress={() =>
                      run(() => s.login("/auth/demo", { userId: "demo-maya" }))
                    }
                  >
                    <Text>Continue as Maya</Text>
                  </Pressable>
                </>
              )}
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  content: {
    padding: 24,
    gap: 14,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  brand: {
    fontSize: 30,
    fontWeight: "700",
    color: "#0f1b2a",
    marginBottom: 32,
  },
  title: { fontSize: 32, fontWeight: "700", color: "#0f1b2a" },
  heading: { fontSize: 20, fontWeight: "600", marginTop: 20 },
  muted: { color: "#576780", fontSize: 16, lineHeight: 24 },
  input: {
    borderWidth: 1,
    borderColor: "#cbd2da",
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    // Reset tracking when iOS reuses a verification-code text input.
    letterSpacing: 0,
    minHeight: 48,
  },
  passwordField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd2da",
    borderRadius: 8,
  },
  passwordInput: { flex: 1, minWidth: 0, borderWidth: 0 },
  passwordToggle: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    backgroundColor: "#142234",
    padding: 16,
    borderRadius: 8,
    minHeight: 50,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  link: { paddingVertical: 14, minHeight: 48 },
  error: { color: "#a22222", lineHeight: 22 },
});
