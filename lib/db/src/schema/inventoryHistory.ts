import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { storesTable } from "./stores";
import { chemicalsTable } from "./chemicals";

export const inventoryHistoryTable = pgTable("inventory_history", {
  id: serial("id").primaryKey(),
  storeId: integer("store_id").notNull().references(() => storesTable.id, { onDelete: "cascade" }),
  chemicalId: integer("chemical_id").notNull().references(() => chemicalsTable.id, { onDelete: "cascade" }),
  oldQty: numeric("old_qty", { precision: 10, scale: 2 }),
  newQty: numeric("new_qty", { precision: 10, scale: 2 }),
  source: text("source").notNull().default("manual"),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InventoryHistory = typeof inventoryHistoryTable.$inferSelect;
