import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { api } from "./api";
const configured = () => Constants.expoConfig?.extra?.fcmEnabled === true;
async function messaging() {
  if (!configured())
    throw new Error(
      "Firebase is not configured in this build. In-app updates remain available.",
    );
  const [{ getApp }, m] = await Promise.all([
    import("@react-native-firebase/app"),
    import("@react-native-firebase/messaging"),
  ]);
  return { m, client: m.getMessaging(getApp()) };
}
export async function registerPush() {
  const { m, client } = await messaging();
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("orders", {
      name: "Order updates",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted")
    throw new Error(
      "Notifications are disabled. You can still read all updates in the app.",
    );
  if (Platform.OS === "ios") await m.registerDeviceForRemoteMessages(client);
  const raw = await m.getToken(client);
  await api("/devices", {
    method: "PUT",
    body: JSON.stringify({ token: raw, platform: Platform.OS }),
  });
  await SecureStore.setItemAsync("poold.device", raw);
  return "Push notifications enabled for this device.";
}
export async function unregisterPush() {
  const raw = await SecureStore.getItemAsync("poold.device");
  if (raw)
    await api("/devices", {
      method: "DELETE",
      body: JSON.stringify({ token: raw }),
    });
  await SecureStore.deleteItemAsync("poold.device");
}
export function listenForPush(onOrder: (id: string) => void) {
  let disposed = false;
  const stops: (() => void)[] = [];
  if (configured())
    void messaging()
      .then(async ({ m, client }) => {
        if (disposed) return;
        stops.push(
          m.onTokenRefresh(client, async (token) => {
            if (await SecureStore.getItemAsync("poold.device")) {
              await api("/devices", {
                method: "PUT",
                body: JSON.stringify({ token, platform: Platform.OS }),
              });
              await SecureStore.setItemAsync("poold.device", token);
            }
          }),
        );
        stops.push(
          m.onNotificationOpenedApp(client, (message) => {
            if (typeof message.data?.orderId === "string")
              onOrder(message.data.orderId);
          }),
        );
        const initial = await m.getInitialNotification(client);
        if (!disposed && typeof initial?.data?.orderId === "string")
          onOrder(initial.data.orderId);
      })
      .catch((e) => console.warn("Push setup:", e.message));
  return () => {
    disposed = true;
    stops.forEach((stop) => stop());
  };
}
