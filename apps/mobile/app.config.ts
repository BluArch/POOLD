import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "POOLD",
  slug: "poold",
  version: "0.1.0",
  scheme: "poold",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: {
    bundleIdentifier: "ca.poold.mobile",
    supportsTablet: true,
    ...(process.env.GOOGLE_SERVICES_PLIST
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_PLIST }
      : {}),
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: "ca.poold.mobile",
    ...(process.env.GOOGLE_SERVICES_JSON
      ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
      : {}),
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-notifications",
    "expo-image-picker",
    "expo-status-bar",
    ["expo-build-properties", { ios: { useFrameworks: "dynamic" } }],
    ...(process.env.EXPO_PUBLIC_FCM_ENABLED === "true"
      ? ["@react-native-firebase/app", "@react-native-firebase/messaging"]
      : []),
  ],
  web: {
    bundler: "metro",
    output: "single",
    name: "POOLD",
    shortName: "POOLD",
    themeColor: "#FBEFC5",
    backgroundColor: "#F4EDE1",
    favicon: "./public/favicon.png",
  },
  extra: { fcmEnabled: process.env.EXPO_PUBLIC_FCM_ENABLED === "true" },
};
export default config;
