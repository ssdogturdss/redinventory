import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, storesTable } from "@workspace/db";
import {
  CreateStoreBody,
  GetStoreParams,
  UpdateStoreParams,
  UpdateStoreBody,
  DeleteStoreParams,
  ListStoresResponse,
  GetStoreResponse,
  UpdateStoreResponse,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

router.get("/stores", requireAuth, async (req, res): Promise<void> => {
  const emp = req.employee;
  // Employees only see their assigned store
  if (emp?.role === "employee") {
    if (emp.storeId == null) {
      res.json(ListStoresResponse.parse([]));
      return;
    }
    const stores = await db.select().from(storesTable).where(eq(storesTable.id, emp.storeId));
    res.json(ListStoresResponse.parse(stores));
    return;
  }
  const stores = await db.select().from(storesTable).orderBy(storesTable.name);
  res.json(ListStoresResponse.parse(stores));
});

router.post("/stores", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [store] = await db.insert(storesTable).values(parsed.data).returning();
  res.status(201).json(GetStoreResponse.parse(store));
});

router.get("/stores/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Employees may only access their own store
  const emp = req.employee;
  if (emp?.role === "employee" && emp.storeId !== params.data.id) {
    res.status(403).json({ error: "Access denied to this store" });
    return;
  }
  const [store] = await db.select().from(storesTable).where(eq(storesTable.id, params.data.id));
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  res.json(GetStoreResponse.parse(store));
});

router.patch("/stores/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStoreBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [store] = await db
    .update(storesTable)
    .set(parsed.data)
    .where(eq(storesTable.id, params.data.id))
    .returning();
  if (!store) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  res.json(UpdateStoreResponse.parse(store));
});

router.delete("/stores/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteStoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(storesTable)
    .where(eq(storesTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Store not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
