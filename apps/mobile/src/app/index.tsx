import React, { useEffect, useState } from "react";
import { Text, Pressable, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, Redirect, router } from "expo-router";
import { isUvicEmail } from "@poold/contracts";
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
import { palette as P, type, brand, roles, fonts, shadow } from "../theme";
import { Segmented } from "../components/Sections";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
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
    // Signed-out flow: landing page → one-time walkthrough → sign in / sign up.
    [stage, setStage] = useState<"landing" | "intro" | "form">("landing"),
    // After the walkthrough: open the form, or sign straight into the demo.
    [afterIntro, setAfterIntro] = useState<"form" | "demo">("form"),
    [seenIntro, setSeenIntro] = useState<boolean | null>(null),
    [forgot, setForgot] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void getPref("poold.onboarded").then((v) => setSeenIntro(v === "yes"));
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
  if (s.loading || seenIntro === null) return <Loading />;
  const demo = () => run(() => s.login("/auth/demo", { userId: "demo-maya" }));
  /** Leave the landing page; the walkthrough shows only the first time. */
  const next = (then: "login" | "register" | "demo") => {
    setError("");
    setMessage("");
    if (then !== "demo") setMode(then);
    setAfterIntro(then === "demo" ? "demo" : "form");
    if (!seenIntro) setStage("intro");
    else if (then === "demo") void demo();
    else setStage("form");
  };
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
  if (stage === "landing" && !s.error)
    return (
      <Landing
        invited={!!query.order}
        demoEnabled={s.demoEnabled}
        busy={busy}
        error={error}
        onNext={next}
      />
    );
  if (stage === "intro")
    return (
      <Onboarding
        doneLabel={
          afterIntro === "demo"
            ? "Open the demo"
            : mode === "login"
              ? "Continue to sign in"
              : "Create my account"
        }
        onDone={() => {
          void setPref("poold.onboarded", "yes");
          setSeenIntro(true);
          setStage("form");
          if (afterIntro === "demo") void demo();
        }}
      />
    );
  return (
    <Screen
      title={mode === "login" ? "Welcome back" : "Create your account"}
      subtitle={
        mode === "login"
          ? "Sign in to see your groups."
          : "POOLD is for UVic students, so use your @uvic.ca email."
      }
      stamp={
        <Pressable
          accessibilityRole="button"
          onPress={() => setStage("landing")}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text style={styles.label}>Back</Text>
        </Pressable>
      }
      header={
        <Segmented<"login" | "register">
          options={[
            { value: "login", label: "Sign in" },
            { value: "register", label: "Create account" },
          ]}
          value={mode}
          onChange={(m) => {
            setError("");
            setMessage("");
            setPasswordVisible(false);
            setMode(m);
          }}
        />
      }
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
          label="UVic email"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@uvic.ca"
          style={{ letterSpacing: 0 }}
        />
        {!!email.trim() && email.includes("@") && !isUvicEmail(email) && (
          <Text style={[styles.muted, { color: P.beet }]}>
            POOLD is for UVic students. Use your @uvic.ca email.
          </Text>
        )}
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
          <Text style={styles.muted}>
            At least 8 characters. By creating an account you agree to{" "}
            <Text
              accessibilityRole="link"
              onPress={() => router.push("/policies")}
              style={{ color: P.carrot, textDecorationLine: "underline" }}
            >
              how POOLD works
            </Text>
            .
          </Text>
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
                // New account: show the app tour once they're in.
                await setPref("poold.tour", "pending");
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
      </View>
      {s.demoEnabled && <DemoCard busy={busy} onPress={() => void demo()} />}
      <Pressable
        accessibilityRole="link"
        onPress={() => setStage("intro")}
        style={{ alignSelf: "center", minHeight: 44, justifyContent: "center" }}
      >
        <Text style={[styles.label, { color: P.muted }]}>
          How does POOLD work?
        </Text>
      </Pressable>
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

/** Big, obvious way to look around without an account. */
function DemoCard({ busy, onPress }: { busy: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Try the demo as Maya, no account needed"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: 22,
        borderWidth: 2,
        borderColor: brand.orange,
        borderStyle: "dashed",
        backgroundColor: "#FFF7F2",
        padding: 16,
        gap: 12,
        opacity: busy ? 0.6 : pressed ? 0.85 : 1,
      })}
    >
      <View style={[styles.row, { gap: 12 }]}>
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            backgroundColor: brand.orange,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{ fontFamily: fonts.title, fontSize: 20, color: P.white }}
          >
            M
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              type.mono,
              { color: brand.orangeDeep, fontFamily: fonts.label },
            ]}
          >
            NO ACCOUNT NEEDED
          </Text>
          <Text style={type.cardTitle}>Try the demo as Maya</Text>
          <Text style={type.mono}>Sample groups are ready to explore.</Text>
        </View>
      </View>
      <View
        style={{
          backgroundColor: P.ink,
          borderRadius: 999,
          minHeight: 48,
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="play" size={16} color={P.white} />
        <Text style={[type.label, { color: P.white, fontSize: 15 }]}>
          {busy ? "Opening…" : "Open the demo"}
        </Text>
      </View>
    </Pressable>
  );
}

/** First screen for signed-out visitors. */
function Landing({
  invited,
  demoEnabled,
  busy,
  error,
  onNext,
}: {
  invited: boolean;
  demoEnabled: boolean;
  busy: boolean;
  error: string;
  onNext: (then: "login" | "register" | "demo") => void;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: roles.buying.header }}>
      <ScrollView
        style={{ backgroundColor: P.kraft }}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        <View
          style={{
            backgroundColor: roles.buying.header,
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 28,
            gap: 14,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 600,
              alignSelf: "center",
              gap: 14,
            }}
          >
            <Text
              style={{
                fontFamily: fonts.title,
                fontSize: 26,
                letterSpacing: -0.8,
                color: P.ink,
              }}
            >
              poold
            </Text>
            <Text style={[type.title, { fontSize: 40, lineHeight: 44 }]}>
              Good things, shared.
            </Text>
            <Text
              style={[
                type.body,
                { fontSize: 16, color: roles.buying.headerMuted },
              ]}
            >
              Split bulk groceries with students near you. Take only the share
              you need.
            </Text>
            <View style={[styles.row, { gap: 8, flexWrap: "wrap" }]}>
              {[
                ["people-outline", "Join a group"],
                ["pie-chart-outline", "Pick a share"],
                ["bag-check-outline", "Pick it up"],
              ].map(([icon, label]) => (
                <View
                  key={label}
                  style={[
                    styles.row,
                    {
                      gap: 6,
                      backgroundColor: P.paper,
                      borderRadius: 999,
                      paddingVertical: 7,
                      paddingHorizontal: 12,
                      ...shadow,
                      shadowOpacity: 0.05,
                    },
                  ]}
                >
                  <Ionicons
                    name={icon as React.ComponentProps<typeof Ionicons>["name"]}
                    size={15}
                    color={P.ink}
                  />
                  <Text style={[type.label, { fontSize: 13 }]}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        <View
          style={{
            width: "100%",
            maxWidth: 600,
            alignSelf: "center",
            padding: 20,
            gap: 12,
          }}
        >
          {invited && (
            <View style={styles.note}>
              <Text style={styles.text}>
                You’ve been invited to a group. Sign in or create an account to
                see it.
              </Text>
            </View>
          )}
          {demoEnabled && (
            <DemoCard busy={busy} onPress={() => onNext("demo")} />
          )}
          <ErrorText message={error} />
          <Button onPress={() => onNext("register")}>Get started</Button>
          <Button secondary onPress={() => onNext("login")}>
            I already have an account
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
