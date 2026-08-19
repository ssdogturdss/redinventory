import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const initials = currentUser?.username
    ? currentUser.username.slice(0, 2).toUpperCase()
    : "?";

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 100 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: colors.foreground }]}>Profile</Text>

      <View style={[styles.avatarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.username, { color: colors.foreground }]}>
            {currentUser?.username ?? "—"}
          </Text>
          <View style={[styles.roleBadge, { backgroundColor: colors.primary + "18" }]}>
            <Text style={[styles.roleText, { color: colors.primary }]}>
              {currentUser?.role === "admin" ? "Admin" : "Employee"}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <InfoRow
          icon="business-outline"
          label="Assigned Store"
          value={currentUser?.storeName ?? "All Stores"}
          colors={colors}
        />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <InfoRow
          icon="shield-checkmark-outline"
          label="Access Level"
          value={currentUser?.role === "admin" ? "Full Access" : "Store Access"}
          colors={colors}
        />
      </View>

      <TouchableOpacity
        style={[styles.logoutBtn, { borderColor: colors.destructive + "50" }]}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
        <Text style={[styles.logoutText, { color: colors.destructive }]}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={[styles.versionText, { color: colors.mutedForeground }]}>
        RCinventory Mobile v1.0
      </Text>
    </ScrollView>
  );
}

function InfoRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      <View style={styles.infoText}>
        <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.infoValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  avatarCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  userInfo: {
    flex: 1,
    gap: 6,
  },
  username: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  roleText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  section: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoText: {
    flex: 1,
    gap: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  infoValue: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  versionText: {
    textAlign: "center",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
  },
});
