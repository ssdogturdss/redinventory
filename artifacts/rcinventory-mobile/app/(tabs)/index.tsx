import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useGetDashboardSummary } from "@workspace/api-client-react";

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();

  const { data, isLoading, refetch, isRefetching } = useGetDashboardSummary();

  const greeting = currentUser
    ? `Hi, ${currentUser.username}`
    : "Dashboard";

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 100,
        },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: colors.foreground }]}>{greeting}</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {currentUser?.role === "admin" ? "Admin" : "Employee"}
            {currentUser?.storeName ? ` · ${currentUser.storeName}` : ""}
          </Text>
        </View>
        <View style={[styles.avatarWrap, { backgroundColor: colors.primary + "18" }]}>
          <Ionicons name="flask" size={22} color={colors.primary} />
        </View>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Overview</Text>

      {isLoading ? (
        <View style={styles.statsGrid}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.skeletonCard,
                { backgroundColor: colors.muted, flex: 1, minWidth: "45%" },
              ]}
            />
          ))}
        </View>
      ) : !data ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load stats"
          subtitle="Pull down to retry"
        />
      ) : (
        <View style={styles.statsGrid}>
          <StatCard
            label="Stores"
            value={data.totalStores}
            icon="business-outline"
          />
          <StatCard
            label="Chemicals"
            value={data.totalChemicals}
            icon="flask-outline"
          />
          <StatCard
            label="Entries"
            value={data.totalInventoryEntries}
            icon="list-outline"
            accent
          />
          <StatCard
            label="Low Stock"
            value={data.lowStockCount}
            icon="warning-outline"
            warning={data.lowStockCount > 0}
          />
        </View>
      )}

      {data?.topChemicalsByStore && data.topChemicalsByStore.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
            Top Chemicals
          </Text>
          <View style={[styles.topList, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {data.topChemicalsByStore.map((chem, i) => (
              <View
                key={chem.chemicalName}
                style={[
                  styles.topItem,
                  i < data.topChemicalsByStore.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={[styles.topRank, { backgroundColor: colors.primary + "18" }]}>
                  <Text style={[styles.topRankText, { color: colors.primary }]}>{i + 1}</Text>
                </View>
                <Text
                  style={[styles.topName, { color: colors.foreground }]}
                  numberOfLines={1}
                >
                  {chem.chemicalName}
                </Text>
                <Text style={[styles.topQty, { color: colors.mutedForeground }]}>
                  {Number(chem.totalQuantity).toFixed(0)} total
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  greeting: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  skeletonCard: {
    height: 100,
    borderRadius: 12,
    minWidth: "45%",
  },
  topList: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  topItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  topRank: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  topRankText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  topName: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  topQty: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
