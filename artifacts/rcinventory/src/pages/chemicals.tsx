import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useListChemicals,
  useCreateChemical,
  useUpdateChemical,
  useDeleteChemical,
  getListChemicalsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FlaskConical, Plus, Edit2, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

const chemicalSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  unit: z.string().min(1, "Unit is required"),
  notes: z.string().optional(),
});

type ChemicalFormValues = z.infer<typeof chemicalSchema>;

export default function Chemicals() {
  const { data: chemicals, isLoading } = useListChemicals();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingChemId, setEditingChemId] = useState<number | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useCreateChemical();
  const updateMutation = useUpdateChemical();
  const deleteMutation = useDeleteChemical();

  const createForm = useForm<ChemicalFormValues>({
    resolver: zodResolver(chemicalSchema),
    defaultValues: { name: "", category: "", unit: "gallons", notes: "" },
  });

  const editForm = useForm<ChemicalFormValues>({
    resolver: zodResolver(chemicalSchema),
    defaultValues: { name: "", category: "", unit: "", notes: "" },
  });

  const handleCreate = (data: ChemicalFormValues) => {
    createMutation.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChemicalsQueryKey() });
          setIsCreateOpen(false);
          createForm.reset();
          toast({ title: "Chemical added successfully" });
        },
      }
    );
  };

  const handleEdit = (id: number, data: ChemicalFormValues) => {
    updateMutation.mutate(
      { id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChemicalsQueryKey() });
          setEditingChemId(null);
          toast({ title: "Chemical updated successfully" });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListChemicalsQueryKey() });
          toast({ title: "Chemical deleted successfully" });
        },
      }
    );
  };

  const openEdit = (chem: any) => {
    editForm.reset({
      name: chem.name,
      category: chem.category || "",
      unit: chem.unit,
      notes: chem.notes || "",
    });
    setEditingChemId(chem.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chemicals</h1>
          <p className="text-muted-foreground">Manage chemical products catalog</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Chemical
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Chemical</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-4">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Termidor SC" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={createForm.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input placeholder="Insecticide" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={createForm.control}
                    name="unit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Unit of Measure</FormLabel>
                        <FormControl>
                          <Input placeholder="gallons, oz, lbs..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={createForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Handling instructions..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={createMutation.isPending} className="w-full">
                  {createMutation.isPending ? "Creating..." : "Create Chemical"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : chemicals?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-card text-card-foreground">
          <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No chemicals found</h3>
          <p className="text-muted-foreground mt-1">Add your first chemical product to the catalog.</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chemicals?.map((chem) => (
                <TableRow key={chem.id}>
                  <TableCell className="font-medium">{chem.name}</TableCell>
                  <TableCell>{chem.category || "-"}</TableCell>
                  <TableCell>{chem.unit}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Dialog
                        open={editingChemId === chem.id}
                        onOpenChange={(open) => !open && setEditingChemId(null)}
                      >
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(chem)}>
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Edit Chemical</DialogTitle>
                          </DialogHeader>
                          <Form {...editForm}>
                            <form
                              onSubmit={editForm.handleSubmit((data) => handleEdit(chem.id, data))}
                              className="space-y-4"
                            >
                              <FormField
                                control={editForm.control}
                                name="name"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                      <Input {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <div className="grid grid-cols-2 gap-4">
                                <FormField
                                  control={editForm.control}
                                  name="category"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Category</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                                <FormField
                                  control={editForm.control}
                                  name="unit"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel>Unit of Measure</FormLabel>
                                      <FormControl>
                                        <Input {...field} />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                              <FormField
                                control={editForm.control}
                                name="notes"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Notes</FormLabel>
                                    <FormControl>
                                      <Textarea {...field} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <Button
                                type="submit"
                                disabled={updateMutation.isPending}
                                className="w-full"
                              >
                                {updateMutation.isPending ? "Saving..." : "Save Changes"}
                              </Button>
                            </form>
                          </Form>
                        </DialogContent>
                      </Dialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Chemical</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete {chem.name}? This action cannot be
                              undone and will remove all inventory records for this chemical.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(chem.id)}
                              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
