import { Router, type IRouter } from "express";
import { eq, and, sql, desc } from "drizzle-orm";
import { db, inventoryCountsTable, storesTable, chemicalsTable, inventoryHistoryTable } from "@workspace/db";
import {
  GetStoreInventoryParams,
  UpsertInventoryCountParams,
  UpsertInventoryCountBody,
  DeleteInventoryCountParams,
  ListInventoryResponse,
  GetStoreInventoryResponse,
  UpsertInventoryCountResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// POST /inventory/submit-count — batch upsert for a full store count
router.post("/inventory/submit-count", async (req, res): Promise<void> => {
  const { storeId, counts, type, date } = req.body as { storeId: unknown; counts: unknown; type?: unknown; date?: unknown };

  if (typeof storeId !== "number" || !Number.isInteger(storeId) || storeId <= 0) {
    res.status(400).json({ error: "storeId must be a positive integer" });
    return;
  }

  // Store-scope enforcement for employee role
  const emp = req.employee;
  if (emp?.role === "employee" && emp.storeId !== storeId) {
    res.status(403).json({ error: "Access denied to this store" });
    return;
  }

  if (!Array.isArray(counts) || counts.length === 0) {
    res.status(400).json({ error: "counts must be a non-empty array" });
    return;
  }
  for (const entry of counts as Array<unknown>) {
    if (typeof entry !== "object" || entry === null) {
      res.status(400).json({ error: "Each count must have chemicalId (number) and quantity (number >= 0)" });
      return;
    }
    const e = entry as Record<string, unknown>;
    const chemicalId = e.chemicalId;
    const quantity = e.quantity;
    if (
      typeof chemicalId !== "number" ||
      typeof quantity !== "number" ||
      quantity < 0
    ) {
      res.status(400).json({ error: "Each count must have chemicalId (number) and quantity (number >= 0)" });
      return;
    }
  }
  const validCounts = counts as Array<{ chemicalId: number; quantity: number }>;
  const txType = (typeof type === "string" && ["count", "pull", "received"].includes(type))
    ? (type as "count" | "pull" | "received")
    : "count";

  const parsedDate = typeof date === "string" ? new Date(date) : null;
  const txDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : new Date();

  await db.transaction(async (tx) => {
    for (const c of validCounts) {
      const [existing] = await tx
        .select({ quantity: inventoryCountsTable.quantity })
        .from(inventoryCountsTable)
        .where(and(eq(inventoryCountsTable.storeId, storeId), eq(inventoryCountsTable.chemicalId, c.chemicalId)));

      const existingQty = existing ? parseFloat(String(existing.quantity)) : 0;
      let newQty: number;
      if (txType === "pull") {
        newQty = Math.max(0, existingQty - c.quantity);
      } else if (txType === "received") {
        newQty = existingQty + c.quantity;
      } else {
        newQty = c.quantity;
      }

      await tx.insert(inventoryHistoryTable).values({
        storeId,
        chemicalId: c.chemicalId,
        oldQty: existing ? existing.quantity : null,
        newQty: String(newQty),
        source: txType,
        changedAt: txDate,
      });

      await tx
        .insert(inventoryCountsTable)
        .values({ storeId, chemicalId: c.chemicalId, quantity: String(newQty) })
        .onConflictDoUpdate({
          target: [inventoryCountsTable.storeId, inventoryCountsTable.chemicalId],
          set: { quantity: sql`excluded.quantity`, updatedAt: txDate },
        });
    }
  });

  res.json({ ok: true, saved: validCounts.length });
});

// GET /inventory/history — audit log with optional filters
router.get("/inventory/history", async (req, res): Promise<void> => {
  const storeIdRaw = req.query.storeId;
  const chemicalIdRaw = req.query.chemicalId;
  const limitRaw = req.query.limit;

  const storeId = storeIdRaw !== undefined ? Number(storeIdRaw) : undefined;
  const chemicalId = chemicalIdRaw !== undefined ? Number(chemicalIdRaw) : undefined;
  const limitParsed = limitRaw !== undefined ? Number(limitRaw) : 200;
  const limit = Number.isFinite(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 500) : 200;

  if (storeId !== undefined && (!Number.isFinite(storeId) || storeId <= 0)) {
    res.status(400).json({ error: "storeId must be a positive integer" });
    return;
  }
  if (chemicalId !== undefined && (!Number.isFinite(chemicalId) || chemicalId <= 0)) {
    res.status(400).json({ error: "chemicalId must be a positive integer" });
    return;
  }

  const conditions = [];
  if (storeId !== undefined) conditions.push(eq(inventoryHistoryTable.storeId, storeId));
  if (chemicalId !== undefined) conditions.push(eq(inventoryHistoryTable.chemicalId, chemicalId));

  const rows = await db
    .select({
      id: inventoryHistoryTable.id,
      storeId: inventoryHistoryTable.storeId,
      chemicalId: inventoryHistoryTable.chemicalId,
      storeName: storesTable.name,
      chemicalName: chemicalsTable.name,
      unit: chemicalsTable.unit,
      oldQty: inventoryHistoryTable.oldQty,
      newQty: inventoryHistoryTable.newQty,
      source: inventoryHistoryTable.source,
      changedAt: inventoryHistoryTable.changedAt,
    })
    .from(inventoryHistoryTable)
    .innerJoin(storesTable, eq(inventoryHistoryTable.storeId, storesTable.id))
    .innerJoin(chemicalsTable, eq(inventoryHistoryTable.chemicalId, chemicalsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(inventoryHistoryTable.changedAt))
    .limit(limit);

  const mapped = rows.map((r) => ({
    ...r,
    oldQty: r.oldQty !== null ? parseFloat(r.oldQty) : null,
    newQty: r.newQty !== null ? parseFloat(r.newQty) : null,
    changedAt: r.changedAt.toISOString(),
  }));

  res.json(mapped);
});

// GET /inventory — full list with store+chemical names
router.get("/inventory", async (req, res): Promise<void> => {
  const emp = req.employee;

  const query = db
    .select({
      storeId: inventoryCountsTable.storeId,
      chemicalId: inventoryCountsTable.chemicalId,
      quantity: inventoryCountsTable.quantity,
      storeName: storesTable.name,
      chemicalName: chemicalsTable.name,
      unit: chemicalsTable.unit,
      updatedAt: inventoryCountsTable.updatedAt,
    })
    .from(inventoryCountsTable)
    .innerJoin(storesTable, eq(inventoryCountsTable.storeId, storesTable.id))
    .innerJoin(chemicalsTable, eq(inventoryCountsTable.chemicalId, chemicalsTable.id));

  // Employees must have a store assigned; no storeId means account is misconfigured
  if (emp?.role === "employee") {
    if (emp.storeId == null) {
      res.status(403).json({ error: "Account has no store assigned — contact an admin" });
      return;
    }
    const rows = await query.where(eq(inventoryCountsTable.storeId, emp.storeId)).orderBy(chemicalsTable.name);
    const mapped = rows.map((r) => ({ ...r, quantity: parseFloat(r.quantity) }));
    res.json(ListInventoryResponse.parse(mapped));
    return;
  }

  const rows = await query.orderBy(storesTable.name, chemicalsTable.name);

  const mapped = rows.map((r) => ({ ...r, quantity: parseFloat(r.quantity) }));
  res.json(ListInventoryResponse.parse(mapped));
});

// GET /inventory/:storeId — counts for one store
router.get("/inventory/:storeId", async (req, res): Promise<void> => {
  const params = GetStoreInventoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Store-scope enforcement
  const emp = req.employee;
  if (emp?.role === "employee" && emp.storeId !== params.data.storeId) {
    res.status(403).json({ error: "Access denied to this store" });
    return;
  }

  const rows = await db
    .select({
      storeId: inventoryCountsTable.storeId,
      chemicalId: inventoryCountsTable.chemicalId,
      quantity: inventoryCountsTable.quantity,
      storeName: storesTable.name,
      chemicalName: chemicalsTable.name,
      unit: chemicalsTable.unit,
      updatedAt: inventoryCountsTable.updatedAt,
    })
    .from(inventoryCountsTable)
    .innerJoin(storesTable, eq(inventoryCountsTable.storeId, storesTable.id))
    .innerJoin(chemicalsTable, eq(inventoryCountsTable.chemicalId, chemicalsTable.id))
    .where(eq(inventoryCountsTable.storeId, params.data.storeId))
    .orderBy(chemicalsTable.name);

  const mapped = rows.map((r) => ({ ...r, quantity: parseFloat(r.quantity) }));
  res.json(GetStoreInventoryResponse.parse(mapped));
});

// PUT /inventory/:storeId/:chemicalId
router.put("/inventory/:storeId/:chemicalId", async (req, res): Promise<void> => {
  const params = UpsertInventoryCountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Store-scope enforcement
  const emp = req.employee;
  if (emp?.role === "employee" && emp.storeId !== params.data.storeId) {
    res.status(403).json({ error: "Access denied to this store" });
    return;
  }

  const parsed = UpsertInventoryCountBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { storeId, chemicalId } = params.data;
  const { quantity } = parsed.data;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ quantity: inventoryCountsTable.quantity })
      .from(inventoryCountsTable)
      .where(and(eq(inventoryCountsTable.storeId, storeId), eq(inventoryCountsTable.chemicalId, chemicalId)));

    await tx.insert(inventoryHistoryTable).values({
      storeId,
      chemicalId,
      oldQty: existing ? existing.quantity : null,
      newQty: String(quantity),
      source: "manual",
    });

    await tx
      .insert(inventoryCountsTable)
      .values({ storeId, chemicalId, quantity: String(quantity) })
      .onConflictDoUpdate({
        target: [inventoryCountsTable.storeId, inventoryCountsTable.chemicalId],
        set: { quantity: String(quantity), updatedAt: new Date() },
      });
  });

  const [enriched] = await db
    .select({
      storeId: inventoryCountsTable.storeId,
      chemicalId: inventoryCountsTable.chemicalId,
      quantity: inventoryCountsTable.quantity,
      storeName: storesTable.name,
      chemicalName: chemicalsTable.name,
      unit: chemicalsTable.unit,
      updatedAt: inventoryCountsTable.updatedAt,
    })
    .from(inventoryCountsTable)
    .innerJoin(storesTable, eq(inventoryCountsTable.storeId, storesTable.id))
    .innerJoin(chemicalsTable, eq(inventoryCountsTable.chemicalId, chemicalsTable.id))
    .where(and(eq(inventoryCountsTable.storeId, storeId), eq(inventoryCountsTable.chemicalId, chemicalId)));

  res.json(UpsertInventoryCountResponse.parse({ ...enriched, quantity: parseFloat(enriched.quantity) }));
});

// DELETE /inventory/:storeId/:chemicalId
router.delete("/inventory/:storeId/:chemicalId", async (req, res): Promise<void> => {
  const params = DeleteInventoryCountParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Store-scope enforcement
  const emp = req.employee;
  if (emp?.role === "employee" && emp.storeId !== params.data.storeId) {
    res.status(403).json({ error: "Access denied to this store" });
    return;
  }

  const { storeId, chemicalId } = params.data;

  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ quantity: inventoryCountsTable.quantity })
      .from(inventoryCountsTable)
      .where(and(eq(inventoryCountsTable.storeId, storeId), eq(inventoryCountsTable.chemicalId, chemicalId)));

    if (existing) {
      await tx.insert(inventoryHistoryTable).values({
        storeId,
        chemicalId,
        oldQty: existing.quantity,
        newQty: null,
        source: "manual",
      });
    }

    await tx
      .delete(inventoryCountsTable)
      .where(and(eq(inventoryCountsTable.storeId, storeId), eq(inventoryCountsTable.chemicalId, chemicalId)));
  });

  res.sendStatus(204);
});

// GET /dashboard/summary
router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const emp = req.employee;
  const isEmployee = emp?.role === "employee" && emp.storeId != null;
  const storeFilter = isEmployee ? eq(inventoryCountsTable.storeId, emp!.storeId!) : undefined;
  const storeTableFilter = isEmployee ? eq(storesTable.id, emp!.storeId!) : undefined;

  const storeCountQuery = db.select({ count: sql<number>`count(*)::int` }).from(storesTable);
  const [storeCount] = await (storeTableFilter ? storeCountQuery.where(storeTableFilter) : storeCountQuery);

  const [chemicalCount] = await db.select({ count: sql<number>`count(*)::int` }).from(chemicalsTable);
  const inventoryCountQuery = db.select({ count: sql<number>`count(*)::int` }).from(inventoryCountsTable);
  const [inventoryCount] = await (storeFilter ? inventoryCountQuery.where(storeFilter) : inventoryCountQuery);

  const lowStockQuery = db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryCountsTable)
    .where(sql`${inventoryCountsTable.quantity}::numeric < 5`);
  const [lowStock] = await (storeFilter
    ? db.select({ count: sql<number>`count(*)::int` }).from(inventoryCountsTable)
        .where(and(storeFilter, sql`${inventoryCountsTable.quantity}::numeric < 5`))
    : lowStockQuery);

  const topChemicalsQuery = db
    .select({
      chemicalName: chemicalsTable.name,
      totalQuantity: sql<number>`sum(${inventoryCountsTable.quantity}::numeric)`,
      storeCount: sql<number>`count(distinct ${inventoryCountsTable.storeId})::int`,
    })
    .from(inventoryCountsTable)
    .innerJoin(chemicalsTable, eq(inventoryCountsTable.chemicalId, chemicalsTable.id));

  const topChemicals = await (storeFilter
    ? topChemicalsQuery.where(storeFilter)
    : topChemicalsQuery
  ).groupBy(chemicalsTable.name)
    .orderBy(sql`sum(${inventoryCountsTable.quantity}::numeric) desc`)
    .limit(5);

  const summary = {
    totalStores: storeCount?.count ?? 0,
    totalChemicals: chemicalCount?.count ?? 0,
    totalInventoryEntries: inventoryCount?.count ?? 0,
    lowStockCount: lowStock?.count ?? 0,
    topChemicalsByStore: topChemicals.map((r) => ({
      chemicalName: r.chemicalName,
      totalQuantity: Number(r.totalQuantity ?? 0),
      storeCount: r.storeCount,
    })),
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

export default router;
