import { useState, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Mic, Square, Loader2, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useVoiceRecorder } from "@workspace/integrations-openai-ai-react/audio";
import {
  useListStores,
  useListChemicals,
  useGetStoreInventory,
  getGetStoreInventoryQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useVoiceMatchHistory } from "@/hooks/use-voice-match-history";

type ChemicalRow = {
  chemicalId: number;
  name: string;
  unit: string;
  priorQty: number | null;
  quantity: string;
  autoFilled: boolean;
};

type PendingMatch = {
  chemicalId: number;
  name: string;
  unit: string;
  quantity: number;
  editValue: string;
  accepted: boolean;
};

function fuzzyMatch(
  transcript: string,
  chemicals: Array<{ id: number; name: string; unit: string }>,
  getScore: (id: number) => number = () => 0
): Array<{ chemicalId: number; quantity: number; historyScore: number }> {
  const lower = transcript.toLowerCase();

  const numberWords: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
  };

  const resolveNum = (token: string): number | null => {
    const n = parseFloat(token);
    if (!isNaN(n)) return n;
    if (numberWords[token] !== undefined) return numberWords[token];
    return null;
  };

  const raw: Array<{ chemicalId: number; quantity: number; historyScore: number }> = [];

  for (const chem of chemicals) {
    const chemLower = chem.name.toLowerCase();
    const words = chemLower.split(/\s+/);
    const escapedWords = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = escapedWords.join("[\\s\\-]*");
    const rx = new RegExp(`${pattern}[^a-z0-9]*([\\d.]+|${Object.keys(numberWords).join("|")})`, "i");
    const m = lower.match(rx);
    if (m) {
      const qty = resolveNum(m[1].toLowerCase());
      if (qty !== null) {
        raw.push({ chemicalId: chem.id, quantity: qty, historyScore: getScore(chem.id) });
        continue;
      }
    }
    const rxBefore = new RegExp(`([\\d.]+|${Object.keys(numberWords).join("|")})[^a-z0-9]*${pattern}`, "i");
    const mBefore = lower.match(rxBefore);
    if (mBefore) {
      const qty = resolveNum(mBefore[1].toLowerCase());
      if (qty !== null) {
        raw.push({ chemicalId: chem.id, quantity: qty, historyScore: getScore(chem.id) });
      }
    }
  }

  // Sort: higher history score (more accepted) first, negatives last
  raw.sort((a, b) => b.historyScore - a.historyScore);
  return raw;
}

const toLocalDatetimeInput = (d: Date): string =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function CountSubmission() {
  const { currentUser } = useAuth();
  const isEmployee = currentUser?.role === "employee";

  const defaultStoreId = isEmployee && currentUser?.storeId
    ? String(currentUser.storeId)
    : "";

  const [selectedStoreId, setSelectedStoreId] = useState<string>(defaultStoreId);
  const [rows, setRows] = useState<ChemicalRow[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [pendingTranscript, setPendingTranscript] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isRerecording, setIsRerecording] = useState(false);
  const [transactionType, setTransactionType] = useState<"count" | "pull" | "received">("count");
  const [transactionDate, setTransactionDate] = useState<string>(() => toLocalDatetimeInput(new Date()));

  const { toast } = useToast();
  const { getScore, recordOutcomes } = useVoiceMatchHistory();
  const { state: recorderState, startRecording, stopRecording } = useVoiceRecorder();

  const { data: stores = [] } = useListStores();
  const { data: chemicals = [], isLoading: chemicalsLoading } = useListChemicals();
  const storeIdNum = selectedStoreId ? parseInt(selectedStoreId, 10) : 0;
  const { data: inventoryData, isLoading: inventoryLoading } = useGetStoreInventory(
    storeIdNum,
    { query: { queryKey: getGetStoreInventoryQueryKey(storeIdNum), enabled: !!selectedStoreId && chemicals.length > 0 } }
  );

  useEffect(() => {
    if (!selectedStoreId || !inventoryData || chemicals.length === 0) return;
    const countMap = new Map(inventoryData.map((e) => [e.chemicalId, e.quantity]));
    setRows(
      chemicals.map((c) => ({
        chemicalId: c.id,
        name: c.name,
        unit: c.unit,
        priorQty: countMap.has(c.id) ? Number(countMap.get(c.id)) : null,
        quantity: "",
        autoFilled: false,
      }))
    );
    setSubmitSuccess(false);
  }, [inventoryData, chemicals, selectedStoreId]);

  const submitMutation = useMutation({
    mutationFn: async (counts: Array<{ chemicalId: number; quantity: number }>) => {
      return customFetch<{ ok: boolean; saved: number }>("/api/inventory/submit-count", {
        method: "POST",
        body: JSON.stringify({ storeId: Number(selectedStoreId), counts, type: transactionType, date: new Date(transactionDate).toISOString() }),
      });
    },
    onSuccess: () => {
      setSubmitSuccess(true);
      setRows((prev) => prev.map((r) => ({ ...r, autoFilled: false })));
      const titles = { count: "Count submitted", pull: "Pull recorded", received: "Receipt recorded" };
      toast({ title: titles[transactionType], description: "All quantities have been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleStoreChange = (value: string) => {
    setSelectedStoreId(value);
    setRows([]);
    setSubmitSuccess(false);
  };

  const updateQuantity = useCallback((chemicalId: number, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.chemicalId === chemicalId ? { ...r, quantity: value, autoFilled: false } : r))
    );
  }, []);

  const togglePendingMatch = (chemicalId: number) => {
    setPendingMatches((prev) =>
      prev.map((m) => m.chemicalId === chemicalId ? { ...m, accepted: !m.accepted } : m)
    );
  };

  const updatePendingQuantity = (chemicalId: number, value: string) => {
    setPendingMatches((prev) =>
      prev.map((m) => m.chemicalId === chemicalId ? { ...m, editValue: value } : m)
    );
  };

  const toggleAllPending = (accepted: boolean) => {
    setPendingMatches((prev) => prev.map((m) => ({ ...m, accepted })));
  };

  const applyPendingMatches = () => {
    const toApply = pendingMatches.filter((m) => m.accepted);
    const toReject = pendingMatches.filter((m) => !m.accepted);

    recordOutcomes(
      toApply.map((m) => m.chemicalId),
      toReject.map((m) => m.chemicalId)
    );

    if (toApply.length === 0) {
      setConfirmOpen(false);
      return;
    }
    const applyMap = new Map(toApply.map((m) => [m.chemicalId, parseFloat(m.editValue) || m.quantity]));
    setRows((prev) =>
      prev.map((r) =>
        applyMap.has(r.chemicalId)
          ? { ...r, quantity: String(applyMap.get(r.chemicalId)), autoFilled: true }
          : r
      )
    );
    setConfirmOpen(false);
    toast({
      title: `${toApply.length} chemical${toApply.length > 1 ? "s" : ""} filled in`,
      description: toApply.length < pendingMatches.length
        ? `${pendingMatches.length - toApply.length} match${pendingMatches.length - toApply.length > 1 ? "es" : ""} skipped.`
        : "All matched quantities applied.",
    });
  };

  const stopAndTranscribe = async (opts: { keepDialogOpen: boolean }) => {
    setIsTranscribing(true);
    try {
      const blob = await stopRecording();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const result = await customFetch<{ text: string }>("/api/voice/transcribe", {
        method: "POST",
        body: JSON.stringify({ audio: base64 }),
      });
      const text = result.text;

      if (!text?.trim()) {
        toast({ title: "Nothing heard", description: "No speech was detected. Try again.", variant: "destructive" });
        return;
      }

      const matches = fuzzyMatch(text, chemicals, getScore);
      if (matches.length === 0) {
        toast({ title: "No matches", description: `Transcript: "${text}". Could not match any chemical names.`, variant: "destructive" });
        return;
      }

      const chemMap = new Map(chemicals.map((c) => [c.id, c]));
      const pending: PendingMatch[] = matches.flatMap(({ chemicalId, quantity }) => {
        const chem = chemMap.get(chemicalId);
        if (!chem) return [];
        return [{ chemicalId, name: chem.name, unit: chem.unit, quantity, editValue: String(quantity), accepted: true }];
      });

      setPendingMatches(pending);
      setPendingTranscript(text);
      if (!opts.keepDialogOpen) setConfirmOpen(true);
    } catch (err) {
      toast({
        title: "Voice error",
        description: err instanceof Error ? err.message : "Voice processing failed",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
      setIsRerecording(false);
    }
  };

  const handleVoiceToggle = async () => {
    if (recorderState === "recording") {
      await stopAndTranscribe({ keepDialogOpen: false });
    } else {
      try {
        await startRecording();
      } catch {
        toast({ title: "Microphone error", description: "Could not access microphone.", variant: "destructive" });
      }
    }
  };

  const handleRerecordToggle = async () => {
    if (recorderState === "recording") {
      await stopAndTranscribe({ keepDialogOpen: true });
    } else {
      try {
        await startRecording();
        setIsRerecording(true);
      } catch {
        toast({ title: "Microphone error", description: "Could not access microphone.", variant: "destructive" });
      }
    }
  };

  const handleSubmit = () => {
    const counts = rows
      .filter((r) => r.quantity !== "" && !isNaN(parseFloat(r.quantity)))
      .map((r) => ({ chemicalId: r.chemicalId, quantity: parseFloat(r.quantity) }));
    if (counts.length === 0) {
      toast({ title: "Nothing to submit", description: "Enter at least one quantity.", variant: "destructive" });
      return;
    }
    submitMutation.mutate(counts);
  };

  const isRecording = recorderState === "recording";
  const isLoading = chemicalsLoading || inventoryLoading;
  const allAccepted = pendingMatches.length > 0 && pendingMatches.every((m) => m.accepted);
  const noneAccepted = pendingMatches.every((m) => !m.accepted);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inventory Update</h1>
        <p className="text-muted-foreground">Record a count, pull, or received shipment for a store</p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(["count", "pull", "received"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTransactionType(t); setSubmitSuccess(false); }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                  transactionType === t
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "count" ? "Count" : t === "pull" ? "Pull" : "Received"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="tx-date" className="text-sm text-muted-foreground whitespace-nowrap">Date &amp; time</Label>
            <Input
              id="tx-date"
              type="datetime-local"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="h-8 w-[200px] text-sm"
            />
            <button
              type="button"
              onClick={() => setTransactionDate(toLocalDatetimeInput(new Date()))}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              Now
            </button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {transactionType === "count"
            ? "Set the actual quantity on hand — use this for a physical count or baseline."
            : transactionType === "pull"
            ? "Enter the amount pulled for a job. This will be subtracted from current inventory."
            : "Enter the amount received in a shipment. This will be added to current inventory."}
        </p>
      </div>

      {!isEmployee && (
        <Card>
          <CardHeader>
            <CardTitle>Select Store</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <Label htmlFor="store-select">Store</Label>
              <Select value={selectedStoreId} onValueChange={handleStoreChange}>
                <SelectTrigger id="store-select" className="mt-1">
                  <SelectValue placeholder="Choose a store..." />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {isEmployee && currentUser?.storeName && (
        <div className="text-sm text-muted-foreground">
          Submitting count for: <span className="font-medium text-foreground">{currentUser.storeName}</span>
        </div>
      )}

      {selectedStoreId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle>Chemical Quantities</CardTitle>
              <Button
                type="button"
                variant={isRecording ? "destructive" : "secondary"}
                size="sm"
                onClick={handleVoiceToggle}
                disabled={isTranscribing || isLoading}
                className={`gap-2 ${isRecording ? "animate-pulse" : ""}`}
              >
                {isTranscribing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Transcribing...</>
                ) : isRecording ? (
                  <><Square className="w-4 h-4 fill-current" />Stop Recording</>
                ) : (
                  <><Mic className="w-4 h-4" />Voice Input</>
                )}
              </Button>
            </div>
            {isRecording && (
              <p className="text-sm text-muted-foreground">
                {transactionType === "pull"
                  ? `Speak amounts pulled, e.g. "Bleach 2, Ammonia 1"`
                  : transactionType === "received"
                  ? `Speak amounts received, e.g. "Bleach 10, Floor cleaner 5"`
                  : `Speak your count, e.g. "Bleach 12, Ammonia 4, Floor cleaner 7"`}
              </p>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />Loading chemicals...
              </div>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground text-sm py-4">No chemicals found.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_auto_72px_120px] gap-3 text-sm font-medium text-muted-foreground pb-1 border-b">
                  <span>Chemical</span><span>Unit</span>
                  <span className="text-right">{transactionType === "count" ? "Prior" : "Current"}</span>
                  <span>{transactionType === "pull" ? "Amount Pulled" : transactionType === "received" ? "Amount Received" : "New Count"}</span>
                </div>
                {rows.map((row) => (
                  <div
                    key={row.chemicalId}
                    className={`grid grid-cols-[1fr_auto_72px_120px] gap-3 items-center rounded-md transition-colors -mx-2 px-2 py-1 ${
                      row.autoFilled
                        ? "bg-yellow-50 dark:bg-yellow-950/20"
                        : row.quantity === ""
                        ? "bg-sky-50/70 dark:bg-sky-950/20"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-sm font-medium">{row.name}</span>
                      {row.autoFilled && (
                        <Badge variant="outline" className="text-xs shrink-0 border-yellow-400 text-yellow-700 dark:text-yellow-400">
                          voice
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground whitespace-nowrap">{row.unit}</span>
                    <span className="text-sm text-muted-foreground tabular-nums text-right">
                      {row.priorQty !== null ? row.priorQty : <span className="opacity-40">—</span>}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={row.priorQty !== null ? String(row.priorQty) : "—"}
                      value={row.quantity}
                      onChange={(e) => updateQuantity(row.chemicalId, e.target.value)}
                      className={`h-8 text-sm ${
                        row.autoFilled
                          ? "border-yellow-400 focus-visible:ring-yellow-400"
                          : row.quantity === ""
                          ? "border-sky-300 dark:border-sky-700"
                          : ""
                      }`}
                    />
                  </div>
                ))}
              </div>
            )}
            {rows.length > 0 && (
              <div className="mt-6 flex items-center gap-4">
                <Button onClick={handleSubmit} disabled={submitMutation.isPending || isLoading} className="min-w-32">
                  {submitMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" />Saving...</>
                  ) : transactionType === "pull" ? "Record Pull" : transactionType === "received" ? "Record Receipt" : "Submit Count"}
                </Button>
                {submitSuccess && (
                  <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" />Saved successfully
                  </div>
                )}
                {submitMutation.isError && (
                  <div className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertCircle className="w-4 h-4" />{submitMutation.error?.message}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) { setConfirmOpen(false); setIsRerecording(false); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm voice matches</DialogTitle>
            <DialogDescription className="text-xs break-words">
              Heard: &ldquo;{pendingTranscript}&rdquo;
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 py-1">
            <div className="flex items-center justify-between pb-2 border-b">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {pendingMatches.length} match{pendingMatches.length !== 1 ? "es" : ""} found
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => toggleAllPending(true)} disabled={allAccepted}>
                  Select all
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => toggleAllPending(false)} disabled={noneAccepted}>
                  Deselect all
                </Button>
              </div>
            </div>

            <div className="space-y-0.5 max-h-64 overflow-y-auto">
              {pendingMatches.map((match) => (
                <div
                  key={match.chemicalId}
                  className={`flex items-center gap-3 rounded-md px-2 py-2 transition-colors ${
                    match.accepted
                      ? "bg-yellow-50 dark:bg-yellow-950/20"
                      : "hover:bg-muted/50 opacity-60"
                  }`}
                >
                  <Checkbox
                    id={`pm-${match.chemicalId}`}
                    checked={match.accepted}
                    onCheckedChange={() => togglePendingMatch(match.chemicalId)}
                  />
                  <label
                    htmlFor={`pm-${match.chemicalId}`}
                    className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer select-none"
                  >
                    <span className="text-sm font-medium truncate">{match.name}</span>
                    {getScore(match.chemicalId) > 0 && (
                      <span
                        className="shrink-0 text-[10px] font-semibold text-green-600 dark:text-green-400"
                        title={`Accepted ${getScore(match.chemicalId)} more time(s) than rejected`}
                      >
                        ★{getScore(match.chemicalId)}
                      </span>
                    )}
                    {getScore(match.chemicalId) < 0 && (
                      <span
                        className="shrink-0 text-[10px] font-semibold text-red-500 dark:text-red-400"
                        title={`Rejected ${Math.abs(getScore(match.chemicalId))} more time(s) than accepted`}
                      >
                        ↓{Math.abs(getScore(match.chemicalId))}
                      </span>
                    )}
                  </label>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={match.editValue}
                        onChange={(e) => updatePendingQuantity(match.chemicalId, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className={`h-7 w-20 text-sm text-right px-2 transition-colors ${
                          match.editValue !== String(match.quantity)
                            ? "border-blue-500 focus-visible:ring-blue-500 bg-blue-50 dark:bg-blue-950/30"
                            : ""
                        }`}
                        aria-label={`Quantity for ${match.name}`}
                      />
                      <span className="text-sm text-muted-foreground w-10 truncate">{match.unit}</span>
                    </div>
                    {match.editValue !== String(match.quantity) && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        was {match.quantity}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isRerecording || isTranscribing}>
              Dismiss
            </Button>
            <Button
              variant="secondary"
              onClick={handleRerecordToggle}
              disabled={isTranscribing}
              className={`gap-2 ${isRerecording ? "animate-pulse" : ""}`}
            >
              {isTranscribing && isRerecording ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Transcribing...</>
              ) : isRerecording ? (
                <><Square className="w-4 h-4 fill-current" />Stop & Transcribe</>
              ) : (
                <><RotateCcw className="w-4 h-4" />Re-record</>
              )}
            </Button>
            <Button onClick={applyPendingMatches} disabled={noneAccepted || isRerecording || isTranscribing}>
              Apply {pendingMatches.filter((m) => m.accepted).length > 0
                ? `${pendingMatches.filter((m) => m.accepted).length} match${pendingMatches.filter((m) => m.accepted).length !== 1 ? "es" : ""}`
                : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
