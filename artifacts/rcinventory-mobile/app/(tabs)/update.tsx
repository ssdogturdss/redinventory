import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { LoadingScreen } from "@/components/LoadingScreen";
import { StorePicker } from "@/components/StorePicker";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  customFetch,
  useGetStoreInventory,
  useListChemicals,
  useListStores,
} from "@workspace/api-client-react";

type TxType = "count" | "pull" | "received";

type ChemRow = {
  chemicalId: number;
  name: string;
  unit: string;
  priorQty: number | null;
  quantity: string;
};

const TX_LABELS: Record<TxType, { tab: string; column: string; button: string; hint: string }> = {
  count: {
    tab: "Count",
    column: "New Count",
    button: "Submit Count",
    hint: 'Say counts, e.g. "Bleach 12, Ammonia 4"',
  },
  pull: {
    tab: "Pull",
    column: "Amount Pulled",
    button: "Record Pull",
    hint: 'Say amounts pulled, e.g. "Bleach 2, Ammonia 1"',
  },
  received: {
    tab: "Received",
    column: "Amount Received",
    button: "Record Receipt",
    hint: 'Say amounts received, e.g. "Bleach 10, Floor cleaner 5"',
  },
};

const fmtDate = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtDateDisplay = (d: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (Math.abs(diffMs) < 60000) return "Now";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function UpdateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { currentUser } = useAuth();
  const isEmployee = currentUser?.role === "employee";

  const [txType, setTxType] = useState<TxType>("count");
  const [txDate, setTxDate] = useState<Date>(new Date());
  const [showDateEdit, setShowDateEdit] = useState(false);
  const [dateText, setDateText] = useState(() => fmtDate(new Date()));
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(
    isEmployee && currentUser?.storeId ? currentUser.storeId : null
  );
  const [rows, setRows] = useState<ChemRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<"success" | "error" | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const { data: stores = [] } = useListStores({ query: { enabled: !isEmployee } });
  const { data: chemicals = [], isLoading: chemLoading } = useListChemicals();

  const effectiveStoreId = selectedStoreId ?? 0;
  const { data: inventoryData, isLoading: invLoading } = useGetStoreInventory(
    effectiveStoreId,
    { query: { enabled: effectiveStoreId > 0 && chemicals.length > 0 } }
  );

  useEffect(() => {
    if (!effectiveStoreId || !inventoryData || chemicals.length === 0) return;
    const countMap = new Map(inventoryData.map((e) => [e.chemicalId, Number(e.quantity)]));
    setRows(
      chemicals.map((c) => ({
        chemicalId: c.id,
        name: c.name,
        unit: c.unit,
        priorQty: countMap.has(c.id) ? (countMap.get(c.id) ?? null) : null,
        quantity: "",
      }))
    );
    setSubmitResult(null);
  }, [inventoryData, chemicals, effectiveStoreId]);

  const updateQty = useCallback((chemicalId: number, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.chemicalId === chemicalId ? { ...r, quantity: value } : r))
    );
  }, []);

  const handleDateApply = () => {
    const parsed = new Date(dateText);
    if (!isNaN(parsed.getTime())) {
      setTxDate(parsed);
    }
    setShowDateEdit(false);
  };

  const handleSubmit = async () => {
    if (!effectiveStoreId) {
      setErrorMsg("Please select a store.");
      setSubmitResult("error");
      return;
    }
    const counts = rows
      .filter((r) => r.quantity !== "" && !isNaN(parseFloat(r.quantity)))
      .map((r) => ({ chemicalId: r.chemicalId, quantity: parseFloat(r.quantity) }));
    if (counts.length === 0) {
      setErrorMsg("Enter at least one quantity.");
      setSubmitResult("error");
      return;
    }
    setSubmitting(true);
    setSubmitResult(null);
    try {
      await customFetch<{ ok: boolean; saved: number }>("/api/inventory/submit-count", {
        method: "POST",
        body: JSON.stringify({
          storeId: effectiveStoreId,
          counts,
          type: txType,
          date: txDate.toISOString(),
        }),
      });
      setSubmitResult("success");
      setRows((prev) => prev.map((r) => ({ ...r, quantity: "" })));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit");
      setSubmitResult("error");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSubmitting(false);
    }
  };

  const isLoading = chemLoading || (effectiveStoreId > 0 && invLoading);
  if (isLoading && rows.length === 0) return <LoadingScreen />;

  const labels = TX_LABELS[txType];
  const filledCount = rows.filter((r) => r.quantity !== "").length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 16,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>Update Inventory</Text>

        <View style={[styles.typeToggle, { backgroundColor: colors.muted }]}>
          {(["count", "pull", "received"] as TxType[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.typeBtn,
                txType === t && { backgroundColor: colors.card, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
              ]}
              onPress={() => {
                setTxType(t);
                setSubmitResult(null);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  { color: txType === t ? colors.foreground : colors.mutedForeground },
                ]}
              >
                {TX_LABELS[t].tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {!isEmployee && (
          <StorePicker
            stores={stores}
            selectedId={selectedStoreId}
            onSelect={setSelectedStoreId}
          />
        )}
        {isEmployee && currentUser?.storeName && (
          <View style={[styles.storeTag, { backgroundColor: colors.primary + "14" }]}>
            <Ionicons name="business-outline" size={13} color={colors.primary} />
            <Text style={[styles.storeTagText, { color: colors.primary }]}>
              {currentUser.storeName}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.dateRow, { borderColor: colors.border }]}
          onPress={() => {
            setShowDateEdit((s) => !s);
            setDateText(fmtDate(txDate));
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar-outline" size={14} color={colors.mutedForeground} />
          <Text style={[styles.dateLabel, { color: colors.mutedForeground }]}>
            {fmtDateDisplay(txDate)}
          </Text>
          <TouchableOpacity
            onPress={() => {
              setTxDate(new Date());
              setShowDateEdit(false);
            }}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={[styles.nowBtn, { color: colors.primary }]}>Now</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {showDateEdit && (
          <View style={[styles.dateEditRow, { borderColor: colors.border }]}>
            <TextInput
              style={[styles.dateInput, { color: colors.foreground, borderColor: colors.border }]}
              value={dateText}
              onChangeText={setDateText}
              placeholder="YYYY-MM-DDTHH:MM"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={Platform.OS === "ios" ? "default" : "default"}
              returnKeyType="done"
              onSubmitEditing={handleDateApply}
            />
            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: colors.primary }]}
              onPress={handleDateApply}
            >
              <Text style={styles.applyBtnText}>Apply</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {!effectiveStoreId ? (
        <View style={styles.selectStoreHint}>
          <Ionicons name="business-outline" size={40} color={colors.mutedForeground} />
          <Text style={[styles.selectStoreText, { color: colors.mutedForeground }]}>
            Select a store to begin
          </Text>
        </View>
      ) : (
        <KeyboardAwareScrollViewCompat
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 120 }]}
          showsVerticalScrollIndicator={false}
          bottomOffset={80}
        >
          <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.colChemical, styles.colLabel, { color: colors.mutedForeground }]}>Chemical</Text>
            <Text style={[styles.colPrior, styles.colLabel, { color: colors.mutedForeground }]}>
              {txType === "count" ? "Prior" : "Current"}
            </Text>
            <Text style={[styles.colQty, styles.colLabel, { color: colors.mutedForeground }]}>
              {labels.column}
            </Text>
          </View>

          {rows.map((row) => {
            const isEmpty = row.quantity === "";
            return (
              <View
                key={row.chemicalId}
                style={[
                  styles.chemRow,
                  {
                    backgroundColor: isEmpty ? colors.primary + "10" : colors.card,
                    borderColor: isEmpty ? colors.primary + "30" : colors.border,
                  },
                ]}
              >
                <View style={styles.colChemical}>
                  <Text style={[styles.chemName, { color: colors.foreground }]} numberOfLines={2}>
                    {row.name}
                  </Text>
                  <Text style={[styles.chemUnit, { color: colors.mutedForeground }]}>
                    {row.unit}
                  </Text>
                </View>
                <Text style={[styles.colPrior, styles.priorQty, { color: colors.mutedForeground }]}>
                  {row.priorQty !== null ? String(row.priorQty) : "—"}
                </Text>
                <TextInput
                  style={[
                    styles.qtyInput,
                    {
                      color: colors.foreground,
                      borderColor: isEmpty ? colors.primary + "60" : colors.border,
                      backgroundColor: colors.background,
                    },
                  ]}
                  value={row.quantity}
                  onChangeText={(v) => updateQty(row.chemicalId, v)}
                  keyboardType="decimal-pad"
                  placeholder={row.priorQty !== null ? String(row.priorQty) : "0"}
                  placeholderTextColor={colors.mutedForeground}
                  returnKeyType="done"
                />
              </View>
            );
          })}

          {submitResult === "success" && (
            <View style={[styles.resultBox, { backgroundColor: colors.successBg, borderColor: colors.success + "40" }]}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
              <Text style={[styles.resultText, { color: colors.success }]}>
                {filledCount === 0 ? "Saved successfully" : `${filledCount} chemical${filledCount !== 1 ? "s" : ""} recorded`}
              </Text>
            </View>
          )}

          {submitResult === "error" && (
            <View style={[styles.resultBox, { backgroundColor: colors.destructive + "14", borderColor: colors.destructive + "40" }]}>
              <Ionicons name="alert-circle" size={16} color={colors.destructive} />
              <Text style={[styles.resultText, { color: colors.destructive }]}>{errorMsg}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.submitBtn,
              { backgroundColor: submitting ? colors.primary + "80" : colors.primary },
            ]}
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                <Text style={styles.submitBtnText}>{labels.button}</Text>
              </>
            )}
          </TouchableOpacity>
        </KeyboardAwareScrollViewCompat>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  typeToggle: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 3,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: "center",
  },
  typeBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  storeTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  storeTagText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  dateLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  nowBtn: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  dateEditRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  dateInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  applyBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  applyBtnText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    gap: 6,
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    marginBottom: 2,
  },
  colLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  colChemical: { flex: 1, gap: 1 },
  colPrior: { width: 52, textAlign: "right", marginRight: 8 },
  priorQty: { fontSize: 13, fontFamily: "Inter_400Regular" },
  colQty: { width: 90 },
  chemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
  },
  chemName: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 17,
  },
  chemUnit: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  qtyInput: {
    width: 90,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "right",
  },
  resultBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  resultText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 12,
    marginTop: 8,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  selectStoreHint: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  selectStoreText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
