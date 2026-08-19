import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, chemicalsTable } from "@workspace/db";
import {
  CreateChemicalBody,
  GetChemicalParams,
  UpdateChemicalParams,
  UpdateChemicalBody,
  DeleteChemicalParams,
  ListChemicalsResponse,
  GetChemicalResponse,
  UpdateChemicalResponse,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

router.get("/chemicals", requireAuth, async (_req, res): Promise<void> => {
  const chemicals = await db.select().from(chemicalsTable).orderBy(chemicalsTable.name);
  res.json(ListChemicalsResponse.parse(chemicals));
});

router.post("/chemicals", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateChemicalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [chemical] = await db.insert(chemicalsTable).values(parsed.data).returning();
  res.status(201).json(GetChemicalResponse.parse(chemical));
});

router.get("/chemicals/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetChemicalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [chemical] = await db.select().from(chemicalsTable).where(eq(chemicalsTable.id, params.data.id));
  if (!chemical) {
    res.status(404).json({ error: "Chemical not found" });
    return;
  }
  res.json(GetChemicalResponse.parse(chemical));
});

router.patch("/chemicals/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateChemicalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateChemicalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [chemical] = await db
    .update(chemicalsTable)
    .set(parsed.data)
    .where(eq(chemicalsTable.id, params.data.id))
    .returning();
  if (!chemical) {
    res.status(404).json({ error: "Chemical not found" });
    return;
  }
  res.json(UpdateChemicalResponse.parse(chemical));
});

router.delete("/chemicals/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteChemicalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(chemicalsTable)
    .where(eq(chemicalsTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Chemical not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
