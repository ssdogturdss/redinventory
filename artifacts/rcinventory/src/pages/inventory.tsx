import { useState, useEffect } from "react";
import {
  useListInventory,
  useListStores,
  useListChemicals,
  useUpsertInventoryCount,
  useDeleteInventoryCount,
  useGetInventoryHistory,
  getInventoryHistoryQueryKey,
  getListInventoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipboardList, History, ArrowRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function InventoryCell({
  storeId,
  chemicalId,
  initialQuantity,
  readOnly,
}: {
  storeId: number;
  chemicalId: number;
  initialQuantity: number | null;
  readOnly?: boolean;
}) {
  const [value, setValue] = useState(initialQuantity === null ? "" : String(initialQuantity));
  const queryClient = useQueryClient();
  const upsertMutation = useUpsertInventoryCount();
  const deleteMutation = useDeleteInventoryCount();

  useEffect(() => {
    setValue(initialQuantity === null ? "" : String(initialQuantity));
  }, [initialQuantity]);

  const handleBlur = () => {
    if (readOnly) return;
    const numValue = value === "" ? null : Number(value);
    if (numValue === initialQuantity) return;

    if (numValue === null) {
      deleteMutation.mutate(
        { storeId, chemicalId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
            queryClient.invalidateQueries({ queryKey: ['/api/inventory/history'] });
          },
        }
      );
    } else {
      upsertMutation.mutate(
        { storeId, chemicalId, data: { quantity: numValue } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
            queryClient.invalidateQueries({ queryKey: ['/api/inventory/history'] });
          },
        }
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
  };

  return (
    <Input
      type="number"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      readOnly={readOnly}
      className={`w-24 text-right ${readOnly ? "bg-muted cursor-default" : ""}`}
      placeholder="-"
    />
  );
}

function sourceLabel(source: string) {
  if (source === "agent") return <Badge variant="secondary">AI Agent</Badge>;
  if (source === "count-submission") return <Badge variant="outline">Count</Badge>;
  return <Badge variant="outline">Manual</Badge>;
}

function HistoryTab({ stores, chemicals }: { stores: { id: number; name: string }[]; chemicals: { id: number; name: string }[] }) {
  const [filterStore, setFilterStore] = useState<string>("all");
  const [filterChem, setFilterChem] = useState<string>("all");

  const params: { storeId?: number; chemicalId?: number; limit?: number } = { limit: 200 };
  if (filterStore !== "all") params.storeId = Number(filterStore);
  if (filterChem !== "all") params.chemicalId = Number(filterChem);

  const { data: history, isLoading } = useGetInventoryHistory(params, {
    query: { queryKey: getInventoryHistoryQueryKey(params), refetchInterval: 10000 },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <Select value={filterStore} onValueChange={setFilterStore}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All stores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stores</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterChem} onValueChange={setFilterChem}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All chemicals" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All chemicals</SelectItem>
            {chemicals.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !history?.length ? (
        <div className="text-center py-12 border rounded-lg bg-card text-card-foreground">
          <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No changes yet</h3>
          <p className="text-muted-foreground mt-1">
            Edit an inventory quantity and it will appear here.
          </p>
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Chemical</TableHead>
                <TableHead className="text-right">Old Qty</TableHead>
                <TableHead className="text-center w-6"></TableHead>
                <TableHead className="text-right">New Qty</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(row.changedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="font-medium">{row.storeName}</TableCell>
                  <TableCell>
                    <div>{row.chemicalName}</div>
                    <div className="text-xs text-muted-foreground">{row.unit}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.oldQty !== null ? row.oldQty : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    <ArrowRight className="w-3 h-3 inline" />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {row.newQty !== null ? row.newQty : <span className="text-destructive text-xs font-normal">Removed</span>}
                  </TableCell>
                  <TableCell>{sourceLabel(row.source)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function Inventory() {
  const { currentUser } = useAuth();
  const isEmployee = currentUser?.role === "employee";

  const { data: allStores, isLoading: loadingStores } = useListStores();
  const { data: chemicals, isLoading: loadingChemicals } = useListChemicals();
  const { data: inventory, isLoading: loadingInventory } = useListInventory();

  const isLoading = loadingStores || loadingChemicals || loadingInventory;

  // Employees see only their assigned store
  const stores = isEmployee && currentUser?.storeId
    ? allStores?.filter((s) => s.id === currentUser.storeId) ?? []
    : allStores ?? [];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-10 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </div>
    );
  }

  if (!stores.length || !chemicals?.length) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Matrix</h1>
          <p className="text-muted-foreground">
            {isEmployee ? "Your store's stock levels" : "Manage stock levels across all locations"}
          </p>
        </div>
        <div className="text-center py-12 border rounded-lg bg-card text-card-foreground">
          <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">
            {isEmployee ? "No inventory data yet" : "Missing Master Data"}
          </h3>
          <p className="text-muted-foreground mt-1">
            {isEmployee
              ? "No inventory has been recorded for your store yet."
              : "Please add at least one store and one chemical to view the inventory matrix."}
          </p>
        </div>
      </div>
    );
  }

  const inventoryMap = new Map<string, number>();
  inventory?.forEach((entry) => {
    inventoryMap.set(`${entry.storeId}-${entry.chemicalId}`, entry.quantity);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Inventory Matrix</h1>
        <p className="text-muted-foreground">
          {isEmployee
            ? `Stock levels for ${currentUser?.storeName ?? "your store"}`
            : "Manage stock levels across all locations"}
        </p>
      </div>

      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">
            <ClipboardList className="w-4 h-4 mr-2" />
            Matrix
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="w-4 h-4 mr-2" />
            Change History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-4">
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px] sticky left-0 bg-background z-10 border-r">
                    Chemical \ Store
                  </TableHead>
                  {stores.map((store) => (
                    <TableHead key={store.id} className="text-center min-w-[120px]">
                      {store.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {chemicals.map((chem) => (
                  <TableRow key={chem.id}>
                    <TableCell className="font-medium sticky left-0 bg-background z-10 border-r">
                      <div>{chem.name}</div>
                      <div className="text-xs text-muted-foreground font-normal">{chem.unit}</div>
                    </TableCell>
                    {stores.map((store) => {
                      const key = `${store.id}-${chem.id}`;
                      const quantity = inventoryMap.has(key) ? inventoryMap.get(key)! : null;
                      return (
                        <TableCell key={store.id} className="text-center p-2">
                          <div className="flex justify-center">
                            <InventoryCell
                              storeId={store.id}
                              chemicalId={chem.id}
                              initialQuantity={quantity}
                              readOnly={isEmployee}
                            />
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <HistoryTab stores={stores} chemicals={chemicals} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
