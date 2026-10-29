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
type DevMail = { to: string; subject: string; text: string; createdAt: string };
export default function Account() {
  const s = useSession(),
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
    <Screen title="A familiar face." subtitle="Your POOLD account." back>
      <ResourceState resource={r} />
      {photo && (
        <Image
          source={{ uri: photo }}
          accessibilityLabel="Your profile photo"
          style={{ width: 88, height: 88, borderRadius: 44 }}
        />
      )}
      <Text style={styles.text}>{s.user?.email}</Text>
      <Text style={styles.muted}>
        {s.user?.university ? "Verified UVic email" : "Verified email"} ·{" "}
        {r.data?.completed ?? 0} completed orders
      </Text>
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
      <View style={styles.section}>
        <Text style={styles.h2}>Order updates</Text>
        <Text style={styles.muted}>
          Updates are always saved in the app. Push alerts are optional on
          configured native builds.
        </Text>
        <Button
          secondary
          disabled={a.busy}
          onPress={() =>
            void a.run(async () => setMessage(await registerPush()))
          }
        >
          Enable push on this device
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
          Disable push on this device
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
          <Text style={styles.h3}>Local development email outbox</Text>
          <Text style={styles.muted}>
            These messages are saved locally. No external email is sent unless
            SMTP is configured.
          </Text>
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
