import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chemicalsTable = pgTable("chemicals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  unit: text("unit").notNull().default("units"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertChemicalSchema = createInsertSchema(chemicalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChemical = z.infer<typeof insertChemicalSchema>;
export type Chemical = typeof chemicalsTable.$inferSelect;
