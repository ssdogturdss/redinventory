import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, agentConfigTable, DEFAULT_AGENT_SYSTEM_PROMPT } from "@workspace/db";
import {
  UpdateAgentConfigBody,
  GetAgentConfigResponse,
  UpdateAgentConfigResponse,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

async function ensureAgentConfig() {
  const [existing] = await db.select().from(agentConfigTable).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(agentConfigTable)
    .values({ name: "RCinventory Agent", systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT })
    .returning();
  return created;
}

router.get("/agent-config", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const config = await ensureAgentConfig();
  res.json(GetAgentConfigResponse.parse(config));
});

router.post("/agent-config/reset", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const config = await ensureAgentConfig();
  const [updated] = await db
    .update(agentConfigTable)
    .set({ systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT })
    .where(eq(agentConfigTable.id, config.id))
    .returning();
  res.json(UpdateAgentConfigResponse.parse(updated));
});

router.put("/agent-config", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateAgentConfigBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const config = await ensureAgentConfig();
  const [updated] = await db
    .update(agentConfigTable)
    .set(parsed.data)
    .where(eq(agentConfigTable.id, config.id))
    .returning();
  res.json(UpdateAgentConfigResponse.parse(updated));
});

export default router;
