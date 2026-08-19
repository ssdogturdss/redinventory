import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, employeesTable } from "@workspace/db";
import { logger } from "./logger";

export async function seedDefaultAdmin(): Promise<void> {
  const [existing] = await db
    .select({ id: employeesTable.id })
    .from(employeesTable)
    .where(eq(employeesTable.username, "admin"));

  if (existing) return;

  const passwordHash = await bcrypt.hash("admin123", 10);
  await db.insert(employeesTable).values({
    username: "admin",
    passwordHash,
    role: "admin",
    storeId: null,
  });

  logger.info("Default admin account created: admin / admin123");
}
