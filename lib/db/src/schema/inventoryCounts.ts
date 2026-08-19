import { pgTable, integer, numeric, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { storesTable } from "./stores";
import { chemicalsTable } from "./chemicals";

export const inventoryCountsTable = pgTable("inventory_counts", {
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  chemicalId: integer("chemical_id").notNull().references(() => chemicalsTable.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [primaryKey({ columns: [t.storeId, t.chemicalId] })]);

export const insertInventoryCountSchema = createInsertSchema(inventoryCountsTable).omit({ updatedAt: true });
export type InsertInventoryCount = z.infer<typeof insertInventoryCountSchema>;
export type InventoryCount = typeof inventoryCountsTable.$inferSelect;
