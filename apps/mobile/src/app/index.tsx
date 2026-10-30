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
    // First screen for signed-out visitors: what POOLD is, before the form.
    [welcome, setWelcome] = useState(true),
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
  if (welcome && !s.error)
    return (
      <Welcome
        invited={!!query.order}
        onStart={(next) => {
          setMode(next);
          setError("");
          setMessage("");
          setWelcome(false);
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
          <Pressable
            accessibilityRole="button"
            style={styles.backLink}
            onPress={() => setWelcome(true)}
          >
            <Ionicons name="arrow-back-outline" size={18} color="#576780" />
            <Text style={styles.muted}>What is POOLD?</Text>
          </Pressable>
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
const STEPS: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  body: string;
}[] = [
  {
    icon: "people-outline",
    title: "Join a group",
    body: "Find a group near campus that’s heading to a bulk store like Costco.",
  },
  {
    icon: "pie-chart-outline",
    title: "Take only your share",
    body: "Claim just the part you want, like 2 cans from an 8-pack, at the bulk price.",
  },
  {
    icon: "bag-check-outline",
    title: "Pick it up on campus",
    body: "Collect your bag at a public pickup spot with a one-time code.",
  },
];

/** Short introduction shown before sign-in. */
function Welcome({
  invited,
  onStart,
}: {
  invited: boolean;
  onStart: (mode: "login" | "register") => void;
}) {
  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>poold</Text>
        <Text style={styles.title}>Good things, shared.</Text>
        <Text style={styles.lead}>
          POOLD lets students split bulk groceries and household items, so you
          get bulk prices without buying more than you need.
        </Text>
        {invited && (
          <View style={styles.invite}>
            <Ionicons name="mail-open-outline" size={20} color="#0f1b2a" />
            <Text style={[styles.muted, { flex: 1, color: "#0f1b2a" }]}>
              You’ve been invited to a group. Sign in or create an account to
              see it.
            </Text>
          </View>
        )}
        <View style={styles.steps}>
          {STEPS.map((step, i) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepIcon}>
                <Ionicons name={step.icon} size={22} color="#0f1b2a" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.stepTitle}>
                  {i + 1}. {step.title}
                </Text>
                <Text style={styles.muted}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.organizer}>
          <Ionicons name="storefront-outline" size={20} color="#576780" />
          <Text style={[styles.muted, { flex: 1 }]}>
            Going shopping anyway? Organize a group and POOLD keeps track of
            shares, the shopping list and pickup for you.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => onStart("register")}
        >
          <Text style={styles.buttonText}>Get started</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.secondaryButton}
          onPress={() => onStart("login")}
        >
          <Text style={styles.secondaryText}>I already have an account</Text>
        </Pressable>
      </ScrollView>
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
  lead: { color: "#2b3a4d", fontSize: 18, lineHeight: 27 },
  steps: { gap: 18, marginTop: 16, marginBottom: 4 },
  step: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  stepIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f4f6f8",
    alignItems: "center",
    justifyContent: "center",
  },
  stepTitle: { fontSize: 17, fontWeight: "600", color: "#0f1b2a" },
  organizer: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    borderTopWidth: 1,
    borderTopColor: "#d5dce4",
    paddingTop: 16,
    marginBottom: 12,
  },
  invite: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    backgroundColor: "#f4f6f8",
    padding: 14,
    borderRadius: 8,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#cbd2da",
    padding: 16,
    borderRadius: 8,
    minHeight: 50,
    alignItems: "center",
  },
  secondaryText: { color: "#0f1b2a", fontWeight: "600", fontSize: 16 },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
  },
});
