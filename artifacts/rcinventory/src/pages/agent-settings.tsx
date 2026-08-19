import { useState, useEffect } from "react";
import { useGetAgentConfig, useUpdateAgentConfig, useResetAgentConfig, getGetAgentConfigQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Bot, RotateCcw } from "lucide-react";

const configSchema = z.object({
  name: z.string().min(1, "Name is required"),
  systemPrompt: z.string().min(1, "System prompt is required"),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export default function AgentSettings() {
  const { data: config, isLoading } = useGetAgentConfig();
  const updateMutation = useUpdateAgentConfig();
  const resetMutation = useResetAgentConfig();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: { name: "", systemPrompt: "" },
  });

  useEffect(() => {
    if (config) {
      form.reset({
        name: config.name,
        systemPrompt: config.systemPrompt,
      });
    }
  }, [config, form]);

  const onSubmit = (data: ConfigFormValues) => {
    updateMutation.mutate(
      { data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetAgentConfigQueryKey() });
          toast({ title: "Agent configuration saved" });
        },
      }
    );
  };

  const handleReset = () => {
    resetMutation.mutate(undefined, {
      onSuccess: (updated) => {
        form.setValue("systemPrompt", updated.systemPrompt);
        form.setValue("name", updated.name);
        queryClient.invalidateQueries({ queryKey: getGetAgentConfigQueryKey() });
        toast({ title: "Reset to default system prompt" });
      },
      onError: () => {
        toast({ title: "Reset failed", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-48 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="space-y-4 max-w-2xl">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Agent Settings</h1>
        <p className="text-muted-foreground">Configure the behavior of the AI reporting agent</p>
      </div>

      <div className="max-w-2xl border rounded-lg p-6 bg-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary/10 rounded-full">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Report Agent Identity</h2>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agent Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormDescription>
                    The name displayed in the chat interface.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="systemPrompt"
              render={({ field }) => (
                <FormItem>
                  <div className="flex justify-between items-center mb-2">
                    <FormLabel className="mb-0">System Prompt</FormLabel>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleReset}
                      disabled={resetMutation.isPending}
                      className="h-8 text-xs"
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      {resetMutation.isPending ? "Resetting..." : "Reset to Default"}
                    </Button>
                  </div>
                  <FormControl>
                    <Textarea 
                      className="min-h-[200px] font-mono text-sm" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Instructions that guide the agent's behavior and knowledge.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Configuration"}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
