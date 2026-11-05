import React, { useEffect, useState } from "react";
import { Text, Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, Redirect } from "expo-router";
import { useSession } from "../session";
import { post } from "../api";
import EmailVerification from "../components/EmailVerification";
import {
  Screen,
  Button,
  Field,
  Loading,
  ErrorText,
  styles,
} from "../components/ui";
import { palette as P } from "../theme";
import { Onboarding } from "../components/Onboarding";
import { getPref, setPref } from "../storage";
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
    // Intro slides: shown once on first open, then straight to sign-in.
    [intro, setIntro] = useState<boolean | null>(null),
    [forgot, setForgot] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void getPref("poold.onboarded").then((v) => setIntro(v !== "yes"));
  }, []);
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
  if (s.loading || intro === null) return <Loading />;
  if (forgot)
    return (
      <ForgotPassword
        initialEmail={email}
        onBack={() => {
          setForgot(false);
          setError("");
        }}
      />
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
  if (intro && !s.error)
    return (
      <Onboarding
        onDone={(next) => {
          void setPref("poold.onboarded", "yes");
          setMode(next);
          setError("");
          setMessage("");
          setIntro(false);
        }}
      />
    );
  return (
    <Screen
      title={mode === "login" ? "Welcome back" : "Create your account"}
      subtitle="Split bulk groceries with students near you."
    >
      {!!query.order && (
        <View style={styles.note}>
          <Text style={styles.text}>
            You’ve been invited to a group. Sign in to see it.
          </Text>
        </View>
      )}
      <View style={styles.card}>
        <ErrorText message={error || s.error} />
        {!!s.error && (
          <Button secondary onPress={() => void run(s.refresh)}>
            Retry connection
          </Button>
        )}
        {!!message && <Text style={styles.text}>{message}</Text>}
        {mode === "register" && (
          <Field label="Display name" value={name} onChangeText={setName} />
        )}
        <Field
          label="Email address"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          style={{ letterSpacing: 0 }}
        />
        <View>
          <Field
            label="Password"
            secureTextEntry={!passwordVisible}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            value={password}
            onChangeText={setPassword}
            style={{ paddingRight: 56 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              passwordVisible ? "Hide password" : "Show password"
            }
            onPress={() => setPasswordVisible(!passwordVisible)}
            style={{
              position: "absolute",
              right: 4,
              bottom: 2,
              width: 44,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name={passwordVisible ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={P.muted}
            />
          </Pressable>
        </View>
        {mode === "register" ? (
          <Text style={styles.muted}>At least 8 characters.</Text>
        ) : (
          <Pressable
            accessibilityRole="link"
            onPress={() => setForgot(true)}
            style={{
              alignSelf: "flex-end",
              minHeight: 36,
              justifyContent: "center",
            }}
          >
            <Text style={[styles.label, { color: P.carrot }]}>
              Forgot password?
            </Text>
          </Pressable>
        )}
        <Button
          disabled={busy}
          onPress={() =>
            void run(async () => {
              if (mode === "register") {
                const result = await s.login("/auth/register", {
                  name,
                  email,
                  password,
                });
                setMessage(result.message ?? "Your account has been created.");
                setPassword("");
                setPasswordVisible(false);
              } else await s.login("/auth/login", { email, password });
            })
          }
        >
          {busy
            ? "Please wait…"
            : mode === "login"
              ? "Sign in"
              : "Create account"}
        </Button>
        <Button
          secondary
          onPress={() => {
            setError("");
            setMessage("");
            setPasswordVisible(false);
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "Create an account" : "Back to sign in"}
        </Button>
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => setIntro(true)}
        style={{ alignSelf: "center", minHeight: 44, justifyContent: "center" }}
      >
        <Text style={[styles.label, { color: P.muted }]}>What is POOLD?</Text>
      </Pressable>
      {s.demoEnabled && (
        <View style={styles.section}>
          <Text style={styles.h3}>Try the demo</Text>
          <Button
            secondary
            disabled={busy}
            onPress={() =>
              void run(() => s.login("/auth/demo", { userId: "demo-maya" }))
            }
          >
            Continue as Maya
          </Button>
        </View>
      )}
    </Screen>
  );
}

/** Email a six-digit code, then set a new password with it. */
function ForgotPassword({
  initialEmail,
  onBack,
}: {
  initialEmail: string;
  onBack: () => void;
}) {
  const s = useSession();
  const [email, setEmail] = useState(initialEmail),
    [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [sent, setSent] = useState(""),
    [error, setError] = useState(""),
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
  return (
    <Screen
      title="Reset password"
      subtitle={
        sent ? "Check your email for the code." : "We’ll email you a code."
      }
    >
      <View style={styles.card}>
        <Field
          label="Email address"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />
        {!!sent && (
          <>
            <Text style={styles.muted}>{sent}</Text>
            <Field
              label="Six-digit code"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, ""))}
            />
            <Field
              label="New password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              value={password}
              onChangeText={setPassword}
            />
            <Text style={styles.muted}>At least 8 characters.</Text>
          </>
        )}
        <ErrorText message={error} />
        {sent ? (
          <>
            <Button
              disabled={busy || code.length !== 6 || password.length < 8}
              onPress={() =>
                void run(() =>
                  s.login("/auth/reset", { email, code, password }),
                )
              }
            >
              {busy ? "Please wait…" : "Set new password"}
            </Button>
            <Button
              secondary
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const r = await post<{ message: string }>("/auth/forgot", {
                    email,
                  });
                  setSent(r.message);
                })
              }
            >
              Send a new code
            </Button>
          </>
        ) : (
          <Button
            disabled={busy || !email.trim()}
            onPress={() =>
              void run(async () => {
                const r = await post<{ message: string }>("/auth/forgot", {
                  email,
                });
                setSent(r.message);
              })
            }
          >
            {busy ? "Sending…" : "Send code"}
          </Button>
        )}
        <Button secondary onPress={onBack}>
          Back to sign in
        </Button>
      </View>
    </Screen>
  );
}
