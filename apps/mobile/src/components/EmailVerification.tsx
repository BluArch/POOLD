import React, { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import type { EmailVerification as Verification } from "@poold/contracts";
import { post } from "../api";
import { useSession } from "../session";
import {
  Button,
  ErrorText,
  ResourceState,
  useAction,
  useResource,
  Screen,
  styles,
} from "./ui";

import { palette as P, type, fonts } from "../theme";

export default function EmailVerification({
  onSignOut,
}: {
  onSignOut: () => void;
}) {
  const session = useSession(),
    r = useResource<Verification>("/auth/verification"),
    a = useAction();
  const [focused, setFocused] = useState(false);
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
    <Screen title="Verify your email" subtitle={session.user?.email}>
      <View style={styles.section}>
        <Text style={styles.text}>Enter your six-digit verification code.</Text>
        <ResourceState resource={r} />
        {status && (
          <View style={styles.note}>
            <Text style={styles.text}>{status.message}</Text>
            {status.delivery === "smtp" && (
              <Text style={styles.muted}>
                Check your inbox and spam folder.
              </Text>
            )}
          </View>
        )}
        <View style={{ gap: 9 }}>
          <Text style={styles.label}>Verification code</Text>
          <View style={{ height: 60 }}>
            <View
              pointerEvents="none"
              accessible={false}
              style={{ flexDirection: "row", gap: 6 }}
            >
              {Array.from({ length: 6 }, (_, i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 60,
                    borderWidth:
                      focused && i === Math.min(code.length, 5) ? 2 : 1.5,
                    borderColor:
                      focused && i === Math.min(code.length, 5)
                        ? P.chalk
                        : P.line,
                    borderRadius: 10,
                    backgroundColor: P.paper,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ ...type.total, fontFamily: fonts.monoMedium }}>
                    {code[i] ?? ""}
                  </Text>
                </View>
              ))}
            </View>
            <TextInput
              accessibilityLabel="Six-digit verification code"
              value={code}
              onChangeText={(value) =>
                setCode(value.replace(/\D/g, "").slice(0, 6))
              }
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              keyboardType="number-pad"
              inputMode="numeric"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={6}
              editable={!a.busy}
              selectionColor="transparent"
              caretHidden
              style={{
                position: "absolute",
                inset: 0,
                color: "transparent",
                backgroundColor: "transparent",
                fontSize: 16,
              }}
              onSubmitEditing={() => {
                if (canVerify) void confirm();
              }}
            />
          </View>
        </View>
        {hasCode && !expired && !locked && (
          <Text style={styles.muted}>
            This code expires in 10 minutes and can be used once.
          </Text>
        )}
        {expired && status?.delivery !== "failed" && (
          <Text accessibilityRole="alert" style={styles.error}>
            This code has expired. Request a new code below.
          </Text>
        )}
        {locked && (
          <Text accessibilityRole="alert" style={styles.error}>
            Too many incorrect attempts. Request a new code to try again.
          </Text>
        )}
        {hasCode && !expired && !locked && status!.remainingAttempts < 5 && (
          <Text style={styles.muted}>
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
      </View>
    </Screen>
  );
}
