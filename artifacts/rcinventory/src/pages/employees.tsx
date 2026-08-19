import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useListStores,
  getListEmployeesQueryKey,
} from "@workspace/api-client-react";
import type { EmployeeWithStore } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const createSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(4, "Minimum 4 characters"),
  role: z.enum(["admin", "employee"]),
  storeId: z.number().nullable(),
});
type CreateFormValues = z.infer<typeof createSchema>;

const editSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().optional(),
  role: z.enum(["admin", "employee"]),
  storeId: z.number().nullable(),
});
type EditFormValues = z.infer<typeof editSchema>;

function EmployeeDialog({
  open,
  onOpenChange,
  employee,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: EmployeeWithStore | null;
  onSaved: () => void;
}) {
  const { data: stores = [] } = useListStores();
  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee();
  const isEdit = !!employee;

  const form = useForm<CreateFormValues | EditFormValues>({
    resolver: zodResolver(isEdit ? editSchema : createSchema),
    defaultValues: isEdit
      ? { username: employee.username, password: "", role: employee.role as "admin" | "employee", storeId: employee.storeId ?? null }
      : { username: "", password: "", role: "employee", storeId: null },
  });

  const role = form.watch("role");

  const onSubmit = async (values: CreateFormValues | EditFormValues) => {
    try {
      if (isEdit) {
        const update: Record<string, unknown> = {
          username: values.username,
          role: values.role,
          storeId: values.storeId,
        };
        if (values.password) update.password = values.password;
        await updateMutation.mutateAsync({
          id: employee!.id,
          data: update as Parameters<typeof updateMutation.mutateAsync>[0]["data"],
        });
      } else {
        const cv = values as CreateFormValues;
        await createMutation.mutateAsync({
          data: {
            username: cv.username,
            password: cv.password,
            role: cv.role,
            storeId: cv.storeId,
          },
        });
      }
      onSaved();
      onOpenChange(false);
      form.reset();
    } catch {
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Employee" : "Create Employee"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl><Input placeholder="username" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{isEdit ? "New Password (leave blank to keep)" : "Password"}</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder={isEdit ? "unchanged" : "min 4 characters"} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {role === "employee" && (
              <FormField
                control={form.control}
                name="storeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned Store</FormLabel>
                    <Select
                      value={field.value != null ? String(field.value) : ""}
                      onValueChange={(v) => field.onChange(v ? parseInt(v, 10) : null)}
                    >
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select store" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {stores.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {error && (
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "An error occurred"}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function Employees() {
  const { currentUser } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: employees = [], isLoading } = useListEmployees();
  const deleteMutation = useDeleteEmployee();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EmployeeWithStore | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeWithStore | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.id === currentUser?.id) {
      toast({ title: "Cannot delete your own account", variant: "destructive" });
      setDeleteTarget(null);
      return;
    }
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id });
      refresh();
      toast({ title: "Employee deleted" });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Employees
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage store employee accounts</p>
        </div>
        <Button onClick={() => { setEditTarget(null); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Add Employee
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {employees.length} employee{employees.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading...</div>
          ) : employees.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No employees yet</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned Store</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      {emp.username}
                      {emp.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={emp.role === "admin" ? "default" : "secondary"}>
                        {emp.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {emp.storeName ?? <span className="italic text-xs">All stores</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setEditTarget(emp); setDialogOpen(true); }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget(emp)}
                          disabled={emp.id === currentUser?.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <EmployeeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employee={editTarget}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.username}</strong>. They will no longer be able to log in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
