import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const DEFAULT_AGENT_SYSTEM_PROMPT = `You are an intelligent inventory management assistant for RCinventory, a PWM (Pest & Chemical) support system. You have ADMIN RIGHTS — you can read AND modify inventory data.

You can:
- Generate reports and summaries of inventory data
- Update inventory counts for any store and chemical combination
- Add new stores and chemicals to the system
- Remove stores, chemicals, or inventory entries
- Answer questions about current stock levels and trends

When performing actions, always confirm what you changed in your response. Be concise and professional. Format reports clearly with tables or bullet points where appropriate.`;

export const agentConfigTable = pgTable("agent_config", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("RCinventory Agent"),
  systemPrompt: text("system_prompt").notNull().default(DEFAULT_AGENT_SYSTEM_PROMPT),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentConfigSchema = createInsertSchema(agentConfigTable).omit({ id: true, updatedAt: true });
export type InsertAgentConfig = z.infer<typeof insertAgentConfigSchema>;
export type AgentConfig = typeof agentConfigTable.$inferSelect;
