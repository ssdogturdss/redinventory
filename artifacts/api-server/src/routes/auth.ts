import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, employeesTable, storesTable } from "@workspace/db";
import { requireAuth, signToken, type AuthEmployee } from "../middleware/auth";

const router: IRouter = Router();

async function getEmployeeWithStore(id: number) {
  const [row] = await db
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
    .where(eq(employeesTable.id, id));
  return row ?? null;
}

// POST /auth/login
router.post("/auth/login", async (req, res): Promise<void> => {
  const { username, password } = req.body as { username?: unknown; password?: unknown };
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }

  const [emp] = await db
    .select()
    .from(employeesTable)
    .where(eq(employeesTable.username, username));

  if (!emp || !(await bcrypt.compare(password, emp.passwordHash))) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const payload: AuthEmployee = {
    id: emp.id,
    username: emp.username,
    role: emp.role as "admin" | "employee",
    storeId: emp.storeId ?? null,
  };
  const token = signToken(payload);
  const employee = await getEmployeeWithStore(emp.id);
  res.json({ token, employee });
});

// GET /auth/me
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const employee = await getEmployeeWithStore(req.employee!.id);
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json(employee);
});

// POST /auth/logout (stateless — client just drops the token)
router.post("/auth/logout", (_req, res): void => {
  res.json({ ok: true });
});

export default router;
