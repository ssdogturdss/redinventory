import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type Props = {
  label: string;
  value: number | string;
  icon: keyof typeof Ionicons.glyphMap;
  accent?: boolean;
  warning?: boolean;
};

export function StatCard({ label, value, icon, accent, warning }: Props) {
  const colors = useColors();

  const bgColor = warning
    ? colors.warningBg
    : accent
    ? colors.primary + "18"
    : colors.card;

  const iconColor = warning
    ? colors.warning
    : accent
    ? colors.primary
    : colors.mutedForeground;

  const valueColor = warning
    ? colors.warning
    : accent
    ? colors.primary
    : colors.foreground;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: bgColor,
          borderColor: colors.border,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconColor + "22" }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "45%",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  value: {
    fontSize: 26,
    fontWeight: "700",
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.2,
  },
});
