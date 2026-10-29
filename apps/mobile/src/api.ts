import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { ApiError } from "@poold/contracts";
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000/api";
let nativeToken: string | null = null;
export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function restoreSession() {
  if (Platform.OS !== "web")
    nativeToken = await SecureStore.getItemAsync("poold.session");
}
export async function saveSession(value: string | null) {
  nativeToken = value;
  if (Platform.OS !== "web") {
    if (value) await SecureStore.setItemAsync("poold.session", value);
    else await SecureStore.deleteItemAsync("poold.session");
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(nativeToken ? { Authorization: `Bearer ${nativeToken}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new ApiFailure(
      0,
      "OFFLINE",
      "Unable to reach POOLD. Check your connection and retry.",
    );
  }
  const body = await response.json();
  if (!response.ok) {
    const e = body as ApiError;
    throw new ApiFailure(
      response.status,
      e.error?.code ?? "UNKNOWN",
      e.error?.message ?? "Something went wrong. Retry.",
    );
  }
  return body;
}
export const post = <T>(path: string, body: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });
