import React from "react";
import { useFonts } from "expo-font";
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit/600SemiBold";
import { Outfit_700Bold } from "@expo-google-fonts/outfit/700Bold";
import { Outfit_800ExtraBold } from "@expo-google-fonts/outfit/800ExtraBold";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { Loading, ErrorText } from "../components/ui";
import { palette } from "../theme";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../session";
import { RoleProvider } from "../role";
export default function Layout() {
  const [ready, error] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });
  if (error)
    return (
      <ErrorText message="Could not load fonts. Please restart the app." />
    );
  if (!ready) return <Loading />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <RoleProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: palette.kraft },
            }}
          />
        </RoleProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
