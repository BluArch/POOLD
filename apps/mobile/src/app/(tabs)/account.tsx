import React, { useEffect, useState } from "react";
import { View, Text, Image } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { User } from "@poold/contracts";
import { api } from "../../api";
import { useSession } from "../../session";
import { registerPush, unregisterPush } from "../../push";
import {
  Screen,
  styles,
  Button,
  Field,
  ErrorText,
  useAction,
  useResource,
  ResourceState,
} from "../../components/ui";
import { palette as P, type } from "../../theme";
import { useRole } from "../../role";
import { useTour } from "../../components/Tour";
import { setPref } from "../../storage";
type DevMail = { to: string; subject: string; text: string; createdAt: string };
export default function Account() {
  const s = useSession(),
    role = useRole(),
    tour = useTour(),
    a = useAction(),
    r = useResource<User>("/profile"),
    [name, setName] = useState(s.user?.name ?? ""),
    [photo, setPhoto] = useState(s.user?.photo ?? null),
    [message, setMessage] = useState(""),
    [outbox, setOutbox] = useState<DevMail[] | null>(null);
  useEffect(() => {
    if (r.data) {
      setName(r.data.name);
      setPhoto(r.data.photo);
    }
  }, [r.data]);
  return (
    <Screen
      title="Profile"
      roleSwitch
      header={
        <View style={styles.row}>
          {photo ? (
            <Image
              source={{ uri: photo }}
              accessibilityLabel="Your profile photo"
              style={{ width: 72, height: 72, borderRadius: 36 }}
            />
          ) : (
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: role.colors.accent,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={[type.cardTitle, { color: P.white }]}>
                {name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("")}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[type.cardTitle, { color: role.colors.headerText }]}>
              {s.user?.name}
            </Text>
            <Text style={[type.mono, { color: role.colors.headerMuted }]}>
              {s.user?.university ? "Verified UVic email" : "Verified email"} ·{" "}
              {r.data?.completed ?? 0} completed
            </Text>
          </View>
        </View>
      }
    >
      <ResourceState resource={r} />
      {!!r.data?.blockedUntil && (
        <View
          style={[styles.card, { borderWidth: 1.5, borderColor: "#E7B8B3" }]}
        >
          <Text style={styles.h3}>You can’t join new groups right now</Text>
          <Text style={styles.text}>
            You missed {r.data.noShows} pickups in the last 90 days. You can
            join again on{" "}
            {new Date(r.data.blockedUntil).toLocaleDateString("en-CA", {
              month: "short",
              day: "numeric",
            })}
            .
          </Text>
        </View>
      )}
      <View style={[styles.row, { gap: 8 }]}>
        <StatTile
          label="Organizer rating"
          value={
            r.data?.rating ? `★ ${r.data.rating.average.toFixed(1)}` : "New"
          }
          detail={
            r.data?.rating
              ? `${r.data.rating.count} rating${r.data.rating.count === 1 ? "" : "s"}`
              : "No ratings yet"
          }
        />
        <StatTile
          label="Completed"
          value={String(r.data?.completed ?? 0)}
          detail="groups"
        />
        <StatTile
          label="No-shows"
          value={String(r.data?.noShows ?? 0)}
          detail="last 90 days"
        />
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>Your details</Text>
        <Text style={styles.muted}>{s.user?.email}</Text>
        <Field label="Display name" value={name} onChangeText={setName} />
        <Button
          secondary
          disabled={a.busy}
          onPress={() =>
            void a.run(async () => {
              const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.35,
                base64: true,
              });
              if (result.canceled) return;
              const asset = result.assets[0];
              if (!asset.base64)
                throw new Error(
                  "Unable to read this photo. Choose another image.",
                );
              const value = `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
              if (value.length > 180000)
                throw new Error("Choose a smaller image, up to about 130 KB.");
              setPhoto(value);
            })
          }
        >
          Choose profile photo
        </Button>
        {photo && (
          <Button secondary onPress={() => setPhoto(null)}>
            Remove photo
          </Button>
        )}
        <Button
          disabled={a.busy}
          onPress={() =>
            void a.run(async () => {
              await api("/profile", {
                method: "PATCH",
                body: JSON.stringify({ name, photo }),
              });
              await s.refresh();
              await r.refresh();
              setMessage("Profile saved.");
            })
          }
        >
          Save profile
        </Button>
      </View>
      <View style={styles.card}>
        <Text style={styles.h2}>Notifications</Text>
        <Text style={styles.muted}>
          Updates always show in the Updates tab.
        </Text>
        <Button
          secondary
          disabled={a.busy}
          onPress={() =>
            void a.run(async () => setMessage(await registerPush()))
          }
        >
          Turn on push alerts
        </Button>
        <Button
          secondary
          disabled={a.busy}
          onPress={() =>
            void a.run(async () => {
              await unregisterPush();
              setMessage("Push disabled for this account on this device.");
            })
          }
        >
          Turn off push alerts
        </Button>
      </View>
      <ErrorText message={a.error} />
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.text}>
          {message}
        </Text>
      )}
      <Button
        secondary
        icon="document-text-outline"
        onPress={() => router.push("/policies")}
      >
        Payments, refunds and no-shows
      </Button>
      <Button
        secondary
        icon="sparkles-outline"
        onPress={() => {
          role.setRole("buying");
          router.navigate("/(tabs)/community");
          tour.start();
        }}
      >
        Replay the app tour
      </Button>
      <Button
        secondary
        icon="albums-outline"
        onPress={() => void setPref("poold.onboarded", "")}
      >
        Show the intro slides next time
      </Button>
      <Button
        secondary
        danger
        icon="log-out-outline"
        disabled={a.busy}
        onPress={() =>
          void a.run(async () => {
            await unregisterPush();
            await s.logout();
            router.replace("/");
          })
        }
      >
        Sign out
      </Button>
      {s.demoEnabled && (
        <View style={styles.section}>
          <Text style={styles.h3}>Developer: email outbox</Text>
          <Button
            secondary
            onPress={() =>
              void a.run(async () =>
                setOutbox(await api<DevMail[]>("/dev/outbox")),
              )
            }
          >
            Read local outbox
          </Button>
          {outbox?.map((m, n) => (
            <View key={n} style={styles.note}>
              <Text style={styles.label}>
                {m.to} · {m.subject}
              </Text>
              <Text selectable style={styles.muted}>
                {m.text}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <View style={[styles.card, { flex: 1, gap: 2, padding: 12 }]}>
      <Text style={[type.mono, { fontSize: 12 }]}>{label}</Text>
      <Text style={[type.total, { fontSize: 22, lineHeight: 28 }]}>
        {value}
      </Text>
      <Text style={[type.mono, { fontSize: 11 }]}>{detail}</Text>
    </View>
  );
}
