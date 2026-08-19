import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/EmptyState";
import { LoadingScreen } from "@/components/LoadingScreen";
import { StorePicker } from "@/components/StorePicker";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  useGetStoreInventory,
  useListInventory,
  useListStores,
} from "@workspace/api-client-react";

export default function InventoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const isEmployee = currentUser?.role === "employee";

  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);

  const { data: stores = [] } = useListStores({ query: { enabled: !isEmployee } });

  const { data: allInventory = [], isLoading: allLoading, refetch: refetchAll, isRefetching: refetchingAll } =
    useListInventory({ query: { enabled: isEmployee } });

  const { data: storeInventory = [], isLoading: storeLoading, refetch: refetchStore, isRefetching: refetchingStore } =
    useGetStoreInventory(selectedStoreId ?? 0, {
      query: { enabled: !isEmployee && selectedStoreId !== null },
    });

  const items = isEmployee ? allInventory : storeInventory;
  const isLoading = isEmployee ? allLoading : (selectedStoreId !== null ? storeLoading : false);
  const refetch = isEmployee ? refetchAll : refetchStore;
  const isRefetching = isEmployee ? refetchingAll : refetchingStore;

  if (isLoading) return <LoadingScreen />;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.headerBlock,
          {
            paddingTop: insets.top + 16,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Inventory</Text>
        {isEmployee && currentUser?.storeName ? (
          <Text style={[styles.storeTag, { color: colors.mutedForeground }]}>
            {currentUser.storeName}
          </Text>
        ) : null}
        {!isEmployee && (
          <View style={styles.pickerWrap}>
            <StorePicker
              stores={stores}
              selectedId={selectedStoreId}
              onSelect={setSelectedStoreId}
              placeholder="Filter by store..."
            />
          </View>
        )}
      </View>

      {!isEmployee && selectedStoreId === null ? (
        <EmptyState
          icon="business-outline"
          title="Select a store"
          subtitle="Choose a store above to view its inventory"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.storeId}-${item.chemicalId}`}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              icon="flask-outline"
              title="No inventory yet"
              subtitle="Submit a count to start tracking"
            />
          }
          renderItem={({ item }) => {
            const qty = Number(item.quantity);
            const isZero = qty === 0;
            const isLow = qty > 0 && qty < 5;
            return (
              <View
                style={[
                  styles.row,
                  {
                    backgroundColor: isZero
                      ? colors.destructive + "12"
                      : colors.card,
                    borderColor: isZero ? colors.destructive + "40" : colors.border,
                  },
                ]}
              >
                <View style={styles.rowLeft}>
                  <Text style={[styles.chemName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.chemicalName}
                  </Text>
                  {!isEmployee && (
                    <Text style={[styles.storeName, { color: colors.mutedForeground }]}>
                      {item.storeName}
                    </Text>
                  )}
                </View>
                <View style={styles.rowRight}>
                  <Text
                    style={[
                      styles.qty,
                      {
                        color: isZero
                          ? colors.destructive
                          : isLow
                          ? colors.warning
                          : colors.foreground,
                      },
                    ]}
                  >
                    {qty % 1 === 0 ? qty : qty.toFixed(2)}
                  </Text>
                  <Text style={[styles.unit, { color: colors.mutedForeground }]}>{item.unit}</Text>
                  {isZero && (
                    <Ionicons name="warning" size={13} color={colors.destructive} />
                  )}
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBlock: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  storeTag: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: -4,
  },
  pickerWrap: {
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
    marginRight: 12,
  },
  chemName: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  storeName: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  qty: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
    minWidth: 32,
    textAlign: "right",
  },
  unit: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
