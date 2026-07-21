import React, { useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from "@expo-google-fonts/manrope";
import * as SplashScreen from "expo-splash-screen";
import AppNavigator from "./src/navigation";
import PhoneFrame from "./src/components/PhoneFrame";
import DisclaimerGate from "./src/components/DisclaimerGate";

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <PhoneFrame>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider onLayout={onLayout}>
          <DisclaimerGate>
            <AppNavigator />
          </DisclaimerGate>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </PhoneFrame>
  );
}
