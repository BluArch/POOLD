import React, { useState } from "react";
import { Text, Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, Redirect } from "expo-router";
import { useSession } from "../session";
import EmailVerification from "../components/EmailVerification";
import {
  Screen,
  Button,
  Field,
  Loading,
  ErrorText,
  styles,
} from "../components/ui";
import { palette as P, type } from "../theme";
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
  if (s.loading) return <Loading />;
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
    <Screen
      title={mode === "login" ? "Sign in" : "Create your account"}
      subtitle="Good things, shared."
    >
      <View style={styles.section}>
        <Button secondary onPress={() => setWelcome(true)}>
          What is POOLD?
        </Button>
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
        {mode === "register" && (
          <Text style={styles.muted}>
            Use at least 8 characters for your password.
          </Text>
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
      {s.demoEnabled && (
        <View style={styles.section}>
          <Text style={styles.h2}>Local demo</Text>
          <Text style={styles.muted}>Explore POOLD with a sample account.</Text>
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
    <Screen
      title="Good things, shared."
      titleStyle={{ fontSize: 40, lineHeight: 46 }}
      subtitle="Bulk groceries. Portions that fit your life."
      header={
        <View style={{ minHeight: 76, justifyContent: "center" }}>
          <Text style={[type.body, { color: P.chalkMuted }]}>
            A little market for your campus community.
          </Text>
        </View>
      }
    >
      <View style={{ gap: 20 }}>
        {invited && (
          <View style={styles.note}>
            <Text style={styles.text}>
              You’ve been invited to a group. Sign in or create an account to
              see it.
            </Text>
          </View>
        )}
        {STEPS.map((step) => (
          <View
            key={step.title}
            style={[styles.row, { alignItems: "flex-start" }]}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                backgroundColor: P.track,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name={step.icon} size={26} color={P.chalk} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={type.item}>{step.title}</Text>
              <Text style={styles.muted}>{step.body}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.muted}>
          Going shopping anyway? Start a group and keep your shares, shopping
          list and pickup together.
        </Text>
        <Button onPress={() => onStart("register")}>Get started</Button>
        <Button secondary onPress={() => onStart("login")}>
          I already have an account
        </Button>
      </View>
    </Screen>
  );
}
