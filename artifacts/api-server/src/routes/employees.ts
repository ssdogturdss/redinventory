import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, employeesTable, storesTable } from "@workspace/db";
import { requireAuth, requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

async function listWithStore() {
  return db
    .select({
      id: employeesTable.id,
      username: employeesTable.username,
      role: employeesTable.role,
      storeId: employeesTable.storeId,
      storeName: storesTable.name,
      createdAt: employeesTable.createdAt,
      updatedAt: employeesTable.updatedAt,
    })
    .from(employeesTable)
    .leftJoin(storesTable, eq(employeesTable.storeId, storesTable.id))
    .orderBy(employeesTable.username);
}

// GET /employees — admin only
router.get("/employees", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const rows = await listWithStore();
  res.json(rows);
});

// POST /employees — admin only
router.post("/employees", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { username, password, role, storeId } = req.body as {
    username?: unknown;
    password?: unknown;
    role?: unknown;
    storeId?: unknown;
  };

  if (typeof username !== "string" || !username) {
    res.status(400).json({ error: "username is required" });
    return;
  }
  if (typeof password !== "string" || password.length < 4) {
    res.status(400).json({ error: "password must be at least 4 characters" });
    return;
  }
  if (role !== "admin" && role !== "employee") {
    res.status(400).json({ error: "role must be admin or employee" });
    return;
  }
  if (role === "employee" && (typeof storeId !== "number" || !Number.isInteger(storeId) || storeId <= 0)) {
    res.status(400).json({ error: "storeId is required for employee role" });
    return;
  }

  const passwordHash = await bcrypt.hash(password as string, 10);
  try {
    const [emp] = await db
      .insert(employeesTable)
      .values({
        username: username as string,
        passwordHash,
        role: role as string,
        storeId: role === "admin" ? null : (storeId as number),
      })
      .returning();
    const rows = await listWithStore();
    const row = rows.find((r) => r.id === emp.id);
    res.status(201).json(row ?? emp);
  } catch {
    res.status(409).json({ error: "Username already exists" });
  }
});

// GET /employees/:id — admin only
router.get("/employees/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const rows = await listWithStore();
  const row = rows.find((r) => r.id === id);
  if (!row) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(row);
});

// PATCH /employees/:id — admin only
router.patch("/employees/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const { username, password, role, storeId } = req.body as {
    username?: unknown; password?: unknown; role?: unknown; storeId?: unknown;
  };

  type EmployeeUpdate = {
    username?: string;
    passwordHash?: string;
    role?: string;
    storeId?: number | null;
  };

  const updates: EmployeeUpdate = {};
  if (typeof username === "string" && username) updates.username = username;
  if (typeof password === "string" && password.length >= 4) {
    updates.passwordHash = await bcrypt.hash(password, 10);
  }
  if (role === "admin" || role === "employee") {
    if (role === "employee" && (typeof storeId !== "number" || !Number.isInteger(storeId) || storeId <= 0)) {
      // If storeId not in this patch, fetch current to verify it's already set
      const [existing] = await db.select({ storeId: employeesTable.storeId }).from(employeesTable).where(eq(employeesTable.id, id));
      if (!existing?.storeId) {
        res.status(400).json({ error: "storeId is required when setting role to employee" });
        return;
      }
    }
    updates.role = role;
    updates.storeId = role === "admin" ? null : (typeof storeId === "number" && Number.isInteger(storeId) && storeId > 0 ? storeId : undefined);
  } else if (typeof storeId === "number") {
    updates.storeId = storeId;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  try {
    const [updated] = await db
      .update(employeesTable)
      .set(updates)
      .where(eq(employeesTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Employee not found" }); return; }
    const rows = await listWithStore();
    const row = rows.find((r) => r.id === id);
    res.json(row ?? updated);
  } catch {
    res.status(409).json({ error: "Username already exists" });
  }
});

// DELETE /employees/:id — admin only
router.delete("/employees/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [deleted] = await db.delete(employeesTable).where(eq(employeesTable.id, id)).returning();
  if (!deleted) { res.status(404).json({ error: "Employee not found" }); return; }
  res.sendStatus(204);
});

export default router;
