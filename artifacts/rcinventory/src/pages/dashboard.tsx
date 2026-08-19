import { useGetDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Package, Store, TestTube } from "lucide-react";

export default function Dashboard() {
  const { data, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">System Overview</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Stores</CardTitle>
            <Store className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalStores}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Chemicals</CardTitle>
            <TestTube className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalChemicals}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inventory Records</CardTitle>
            <Package className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalInventoryEntries}</div>
          </CardContent>
        </Card>

        <Card className={data.lowStockCount > 0 ? "border-destructive/50 bg-destructive/5" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className={`text-sm font-medium ${data.lowStockCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
              Low Stock Alerts
            </CardTitle>
            <AlertCircle className={`w-4 h-4 ${data.lowStockCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${data.lowStockCount > 0 ? "text-destructive" : ""}`}>
              {data.lowStockCount}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Top Volume Chemicals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.topChemicalsByStore.map((chem) => (
                <div key={chem.chemicalName} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{chem.chemicalName}</p>
                    <p className="text-sm text-muted-foreground">Across {chem.storeCount} locations</p>
                  </div>
                  <div className="font-bold text-primary">
                    {chem.totalQuantity} units
                  </div>
                </div>
              ))}
              {data.topChemicalsByStore.length === 0 && (
                <p className="text-muted-foreground text-sm py-4 text-center">No inventory data available.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
