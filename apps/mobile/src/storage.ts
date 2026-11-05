import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/** Small device-only preferences (role, onboarding seen). Never secrets. */
export async function getPref(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") return window.localStorage.getItem(key);
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string) {
  try {
    if (Platform.OS === "web") window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Preferences are a convenience; the app works without them.
  }
}
