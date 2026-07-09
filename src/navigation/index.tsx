import React, { useRef, useState } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { createStackNavigator, StackScreenProps } from "@react-navigation/stack";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated as RNAnim,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList, TabParamList } from "../types";
import ScanScreen from "../screens/ScanScreen";
import LabelPhotoScreen from "../screens/LabelPhotoScreen";
import HistoryScreen from "../screens/HistoryScreen";
import SettingsScreen from "../screens/SettingsScreen";
import ResultsScreen from "../screens/ResultsScreen";
import AuthScreen from "../screens/AuthScreen";
import ManualUpcModal from "../components/ManualUpcModal";
import { C, F } from "../theme";

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const TAB_ICONS: Record<string, { active: IoniconName; inactive: IoniconName }> = {
  Scan:     { active: "scan",             inactive: "scan-outline" },
  History:  { active: "time",             inactive: "time-outline" },
  Settings: { active: "settings",         inactive: "settings-outline" },
};

// ── Tab item: spring press feedback ─────────────────────────────────────────

function AnimatedTabItem({
  route,
  isFocused,
  onPress,
}: {
  route: { name: string; key: string };
  isFocused: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new RNAnim.Value(1)).current;

  function handlePress() {
    RNAnim.sequence([
      RNAnim.spring(scale, { toValue: 0.80, useNativeDriver: true, speed: 50, bounciness: 0 }),
      RNAnim.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 14, bounciness: 8 }),
    ]).start();
    onPress();
  }

  const icons = TAB_ICONS[route.name] ?? { active: "ellipse", inactive: "ellipse-outline" };
  const iconColor = isFocused ? C.primary : C.muted;
  const iconName = isFocused ? icons.active : icons.inactive;

  return (
    <TouchableOpacity style={s.tabItem} onPress={handlePress} activeOpacity={1}>
      <RNAnim.View style={[s.tabInner, { transform: [{ scale }] }]}>
        <Ionicons name={iconName} size={isFocused ? 26 : 24} color={iconColor} />
        <Text style={[s.tabLabel, { color: iconColor, fontFamily: isFocused ? F.bold : F.semibold }]}>
          {route.name}
        </Text>
      </RNAnim.View>
    </TouchableOpacity>
  );
}

// ── Custom tab bar with FAB (Scan Barcode / Photo Label / Enter UPC) ────────

function CustomTabBar({
  state,
  navigation,
  onEnterUpc,
}: BottomTabBarProps & { onEnterUpc: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnim  = useRef(new RNAnim.Value(0)).current;
  const fabRotate = useRef(new RNAnim.Value(0)).current;
  const fabScale  = useRef(new RNAnim.Value(1)).current;

  function openMenu() {
    setMenuOpen(true);
    RNAnim.parallel([
      RNAnim.spring(menuAnim,  { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }),
      RNAnim.spring(fabRotate, { toValue: 1, useNativeDriver: true, speed: 24, bounciness: 0 }),
    ]).start();
  }

  function closeMenu(andThen?: () => void) {
    RNAnim.parallel([
      RNAnim.timing(menuAnim,  { toValue: 0, useNativeDriver: true, duration: 180 }),
      RNAnim.timing(fabRotate, { toValue: 0, useNativeDriver: true, duration: 180 }),
    ]).start(() => {
      setMenuOpen(false);
      andThen?.();
    });
  }

  function handleFabPress() {
    RNAnim.sequence([
      RNAnim.spring(fabScale, { toValue: 0.86, useNativeDriver: true, speed: 60, bounciness: 0 }),
      RNAnim.spring(fabScale, { toValue: 1,    useNativeDriver: true, speed: 18, bounciness: 14 }),
    ]).start();
    if (menuOpen) closeMenu();
    else openMenu();
  }

  const rotate        = fabRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });
  const menuOpacity   = menuAnim;
  const menuTranslate = menuAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  const visibleTabs = state.routes.filter((r) => r.name !== "LabelPhoto");

  return (
    <View style={s.tabBarWrapper}>
      <Modal transparent visible={menuOpen} animationType="none" onRequestClose={() => closeMenu()}>
        <View style={{ flex: 1 }}>
          <TouchableOpacity
            style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(15,42,67,0.40)" }]}
            activeOpacity={1}
            onPress={() => closeMenu()}
          />
          <RNAnim.View
            style={[s.fabMenu, { opacity: menuOpacity, transform: [{ translateY: menuTranslate }] }]}
          >
            <TouchableOpacity
              style={s.fabMenuItem}
              activeOpacity={0.75}
              onPress={() => closeMenu(() => navigation.navigate("Scan" as any))}
            >
              <View style={[s.fabMenuIcon, { backgroundColor: C.primary }]}>
                <Ionicons name="scan" size={18} color="#fff" />
              </View>
              <View>
                <Text style={s.fabMenuLabel}>Scan Barcode</Text>
                <Text style={s.fabMenuSub}>Instant database lookup</Text>
              </View>
            </TouchableOpacity>
            <View style={s.fabMenuDivider} />
            <TouchableOpacity
              style={s.fabMenuItem}
              activeOpacity={0.75}
              onPress={() => closeMenu(() => navigation.navigate("LabelPhoto" as any))}
            >
              <View style={[s.fabMenuIcon, { backgroundColor: C.secondary }]}>
                <Ionicons name="camera" size={18} color="#fff" />
              </View>
              <View>
                <Text style={s.fabMenuLabel}>Photo Label</Text>
                <Text style={s.fabMenuSub}>Read Supplement Facts</Text>
              </View>
            </TouchableOpacity>
            <View style={s.fabMenuDivider} />
            <TouchableOpacity
              style={s.fabMenuItem}
              activeOpacity={0.75}
              onPress={() => closeMenu(onEnterUpc)}
            >
              <View style={[s.fabMenuIcon, { backgroundColor: C.muted }]}>
                <Ionicons name="keypad" size={18} color="#fff" />
              </View>
              <View>
                <Text style={s.fabMenuLabel}>Enter UPC</Text>
                <Text style={s.fabMenuSub}>Type the barcode number</Text>
              </View>
            </TouchableOpacity>
          </RNAnim.View>
        </View>
      </Modal>

      <View style={s.tabBar}>
        {visibleTabs.map((route) => {
          const isFocused = state.routes[state.index].name === route.name;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name as any);
          };
          return (
            <AnimatedTabItem key={route.key} route={route} isFocused={isFocused} onPress={onPress} />
          );
        })}
      </View>

      <TouchableOpacity style={s.fab} onPress={handleFabPress} activeOpacity={1}>
        <RNAnim.View style={[s.fabInner, { transform: [{ scale: fabScale }, { rotate }] }]}>
          <Ionicons name="add" size={30} color="#fff" />
        </RNAnim.View>
      </TouchableOpacity>
    </View>
  );
}

function MainTabs({ navigation }: StackScreenProps<RootStackParamList, "MainTabs">) {
  const [showUpcModal, setShowUpcModal] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Tab.Navigator
        tabBar={(props) => (
          <CustomTabBar {...props} onEnterUpc={() => setShowUpcModal(true)} />
        )}
        screenOptions={{ headerShown: false }}
      >
        <Tab.Screen name="Scan" component={ScanScreen} />
        <Tab.Screen name="History" component={HistoryScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
        <Tab.Screen name="LabelPhoto" component={LabelPhotoScreen} options={{ tabBarButton: () => null }} />
      </Tab.Navigator>
      <ManualUpcModal
        visible={showUpcModal}
        onClose={() => setShowUpcModal(false)}
        onSubmit={(upc) => {
          setShowUpcModal(false);
          navigation.navigate("Results", { upc });
        }}
      />
    </View>
  );
}

export default function AppNavigator() {
  const navTheme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: "transparent" } };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator initialRouteName="MainTabs" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="Results" component={ResultsScreen} options={{ presentation: "modal" }} />
        <Stack.Screen name="Auth" component={AuthScreen} options={{ presentation: "modal" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  tabBarWrapper: { position: "relative", backgroundColor: C.card, overflow: "visible" },
  tabBar: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderTopColor: C.border,
    borderTopWidth: 1,
    paddingBottom: 16,
    height: 76,
  },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 8 },
  tabInner: { alignItems: "center", gap: 3 },
  tabLabel: { fontSize: 11 },
  fab: { position: "absolute", right: 16, bottom: 82, zIndex: 100 },
  fabInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: C.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: C.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  fabMenu: {
    position: "absolute",
    right: 16,
    bottom: 155,
    backgroundColor: C.card,
    borderRadius: 20,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
    minWidth: 210,
  },
  fabMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fabMenuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  fabMenuLabel: { fontSize: 15, fontFamily: F.bold, color: C.text },
  fabMenuSub: { fontSize: 11, fontFamily: F.semibold, color: C.muted, marginTop: 1 },
  fabMenuDivider: { height: 1, backgroundColor: C.border, marginHorizontal: 16 },
});
