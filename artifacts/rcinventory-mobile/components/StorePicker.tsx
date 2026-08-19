import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useColors } from "@/hooks/useColors";

type Store = { id: number; name: string };

type Props = {
  stores: Store[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  placeholder?: string;
};

export function StorePicker({ stores, selectedId, onSelect, placeholder = "Select store..." }: Props) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const selected = stores.find((s) => s.id === selectedId);

  return (
    <>
      <TouchableOpacity
        style={[
          styles.trigger,
          {
            backgroundColor: colors.card,
            borderColor: selectedId ? colors.primary : colors.border,
          },
        ]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Ionicons
          name="business-outline"
          size={16}
          color={selectedId ? colors.primary : colors.mutedForeground}
        />
        <Text
          style={[
            styles.triggerText,
            { color: selected ? colors.foreground : colors.mutedForeground },
          ]}
          numberOfLines={1}
        >
          {selected ? selected.name : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>Select Store</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Ionicons name="close" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={stores}
              keyExtractor={(s) => String(s.id)}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.storeItem,
                    { borderBottomColor: colors.border },
                    item.id === selectedId && { backgroundColor: colors.primary + "12" },
                  ]}
                  onPress={() => {
                    onSelect(item.id);
                    setOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.storeName,
                      {
                        color:
                          item.id === selectedId ? colors.primary : colors.foreground,
                        fontFamily:
                          item.id === selectedId
                            ? "Inter_600SemiBold"
                            : "Inter_400Regular",
                      },
                    ]}
                  >
                    {item.name}
                  </Text>
                  {item.id === selectedId && (
                    <Ionicons name="checkmark" size={16} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: colors.mutedForeground }]}>
                  No stores found
                </Text>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    maxHeight: 400,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  sheetTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  list: {
    maxHeight: 320,
  },
  storeItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  storeName: {
    fontSize: 14,
    flex: 1,
  },
  empty: {
    textAlign: "center",
    padding: 24,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
