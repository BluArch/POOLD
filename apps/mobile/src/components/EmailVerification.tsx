import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { EmailVerification as Verification } from "@poold/contracts";
import { post } from "../api";
import { useSession } from "../session";
import {
  Button,
  ErrorText,
  ResourceState,
  useAction,
  useResource,
  C,
} from "./ui";

export default function EmailVerification({
  onSignOut,
}: {
  onSignOut: () => void;
}) {
  const session = useSession(),
    r = useResource<Verification>("/auth/verification"),
    a = useAction();
  const [code, setCode] = useState(""),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const status = r.data;
  const resendSeconds = Math.max(
    0,
    Math.ceil(
      ((status?.resendAt ? Date.parse(status.resendAt) : 0) - now) / 1000,
    ),
  );
  const expired = !!status?.expiresAt && Date.parse(status.expiresAt) <= now;
  const hasCode =
    !!status && ["pending", "smtp", "outbox"].includes(status.delivery);
  const locked = status?.remainingAttempts === 0;
  const canVerify =
    hasCode &&
    !expired &&
    !locked &&
    code.length === 6 &&
    !a.busy &&
    !r.loading;
  const resend = () =>
    a.run(async () => {
      try {
        const next = await post<Verification>("/auth/resend");
        r.setData(next);
        setCode("");
        setNow(Date.now());
      } catch (error) {
        await r.refresh();
        throw error;
      }
    });
  const confirm = () =>
    a.run(async () => {
      try {
        await session.login("/auth/verify", { code });
      } catch (error) {
        await r.refresh();
        throw error;
      }
    });
  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView
        style={s.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={s.content}
        >
          <Text style={s.brand}>poold</Text>
          <Text accessibilityRole="header" style={s.title}>
            Verify your email.
          </Text>
          <Text style={s.body}>Enter the six-digit verification code for</Text>
          <Text style={s.email}>{session.user?.email}</Text>
          <ResourceState resource={r} />
          {status && (
            <View style={s.note}>
              <Text style={s.body}>{status.message}</Text>
              {status.delivery === "smtp" && (
                <Text style={s.muted}>Check your inbox and spam folder.</Text>
              )}
            </View>
          )}
          <View style={s.field}>
            <Text style={s.label}>Verification code</Text>
            <TextInput
              accessibilityLabel="Six-digit verification code"
              value={code}
              onChangeText={(value) =>
                setCode(value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
              placeholderTextColor="#8793a2"
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={6}
              editable={!a.busy}
              style={s.code}
              onSubmitEditing={() => {
                if (canVerify) void confirm();
              }}
            />
          </View>
          {hasCode && !expired && !locked && (
            <Text style={s.muted}>
              This code expires in 10 minutes and can be used once.
            </Text>
          )}
          {expired && status?.delivery !== "failed" && (
            <Text accessibilityRole="alert" style={s.error}>
              This code has expired. Request a new code below.
            </Text>
          )}
          {locked && (
            <Text accessibilityRole="alert" style={s.error}>
              Too many incorrect attempts. Request a new code to try again.
            </Text>
          )}
          {hasCode && !expired && !locked && status!.remainingAttempts < 5 && (
            <Text style={s.muted}>
              {status!.remainingAttempts} attempts remaining.
            </Text>
          )}
          <ErrorText message={a.error} />
          <Button disabled={!canVerify} onPress={() => void confirm()}>
            {a.busy ? "Please wait…" : "Verify email"}
          </Button>
          <Button
            secondary
            disabled={a.busy || r.loading || !status || resendSeconds > 0}
            onPress={() => void resend()}
          >
            {resendSeconds > 0
              ? `Resend code in ${resendSeconds}s`
              : hasCode || status?.delivery === "failed"
                ? "Resend code"
                : "Send verification code"}
          </Button>
          <Button
            secondary
            disabled={a.busy}
            onPress={() =>
              void a.run(async () => {
                await session.logout();
                onSignOut();
              })
            }
          >
            Use a different account
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#fff" },
  fill: { flex: 1 },
  content: {
    padding: 24,
    gap: 16,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
  },
  brand: {
    fontSize: 30,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 28,
    letterSpacing: -1,
  },
  title: { fontSize: 32, fontWeight: "700", color: C.ink, letterSpacing: -0.7 },
  body: { fontSize: 16, lineHeight: 24, color: C.ink },
  email: { fontSize: 17, fontWeight: "600", color: C.ink, marginTop: -10 },
  muted: { fontSize: 15, lineHeight: 23, color: C.muted },
  note: { backgroundColor: C.soft, padding: 16, borderRadius: 8, gap: 8 },
  field: { gap: 9, marginTop: 8 },
  label: { fontSize: 14, fontWeight: "600", color: C.ink },
  code: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 8,
    padding: 16,
    fontSize: 30,
    letterSpacing: 8,
    textAlign: "center",
    color: C.ink,
    minHeight: 66,
  },
  error: { color: C.red, fontSize: 15, lineHeight: 23 },
});
