import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { db, agentConfigTable, storesTable, chemicalsTable, inventoryCountsTable, inventoryHistoryTable, DEFAULT_AGENT_SYSTEM_PROMPT } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

type ChatTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const allTools: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "list_stores",
      description: "List all stores in the system",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_chemicals",
      description: "List all chemicals in the system",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory",
      description: "Get inventory counts, optionally filtered by store or chemical",
      parameters: {
        type: "object",
        properties: {
          storeId: { type: "number", description: "Filter by store ID (optional)" },
          chemicalId: { type: "number", description: "Filter by chemical ID (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "upsert_inventory",
      description: "Set the quantity of a chemical at a store (create or update)",
      parameters: {
        type: "object",
        properties: {
          storeId: { type: "number" },
          chemicalId: { type: "number" },
          quantity: { type: "number" },
        },
        required: ["storeId", "chemicalId", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_inventory",
      description: "Remove an inventory entry for a chemical at a store",
      parameters: {
        type: "object",
        properties: {
          storeId: { type: "number" },
          chemicalId: { type: "number" },
        },
        required: ["storeId", "chemicalId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_store",
      description: "Add a new store to the system",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          address: { type: "string" },
          phone: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_store",
      description: "Remove a store from the system by ID",
      parameters: {
        type: "object",
        properties: { storeId: { type: "number" } },
        required: ["storeId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_chemical",
      description: "Add a new chemical to the system",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          unit: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_chemical",
      description: "Remove a chemical from the system by ID",
      parameters: {
        type: "object",
        properties: { chemicalId: { type: "number" } },
        required: ["chemicalId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description: "Get a high-level summary of total stores, chemicals, inventory entries and low-stock count",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_inventory_history",
      description: "Get the raw history of inventory count changes ordered by date (newest first). Use this to see individual count entries and how quantities changed over time.",
      parameters: {
        type: "object",
        properties: {
          storeId: { type: "number", description: "Filter by store ID (optional)" },
          chemicalId: { type: "number", description: "Filter by chemical ID (optional)" },
          since: { type: "string", description: "ISO 8601 date string — only return records on or after this date (optional)" },
          until: { type: "string", description: "ISO 8601 date string — only return records on or before this date (optional)" },
          limit: { type: "number", description: "Max rows to return (default 100, max 500)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_usage_report",
      description: "Get a pre-computed usage and receipt summary per store and chemical. Explicit 'pull' transactions count as usage; explicit 'received' transactions count as receipts. Legacy count-based entries use the heuristic: decrease = used, increase = received. Returns totalUsed, totalReceived, and net change for each store+chemical combination.",
      parameters: {
        type: "object",
        properties: {
          storeId: { type: "number", description: "Filter by store ID (optional)" },
          chemicalId: { type: "number", description: "Filter by chemical ID (optional)" },
          since: { type: "string", description: "ISO 8601 date string — only include history from this date onward (optional)" },
          until: { type: "string", description: "ISO 8601 date string — only include history up to this date (optional)" },
        },
      },
    },
  },
];

// Tools available to employees: read-only, no store/chemical management
const ADMIN_ONLY_TOOLS = new Set(["create_store", "delete_store", "create_chemical", "delete_chemical"]);

type ToolArgs = Record<string, unknown>;

type EmployeeCtx = { role: string; storeId: number | null } | undefined;

async function executeTool(name: string, args: ToolArgs, emp: EmployeeCtx): Promise<unknown> {
  // Block admin-only tools for employees
  if (emp?.role === "employee" && ADMIN_ONLY_TOOLS.has(name)) {
    return { error: "Permission denied: this action requires admin role" };
  }

  switch (name) {
    case "list_stores":
      // Employees only see their own store
      if (emp?.role === "employee" && emp.storeId != null) {
        return db.select().from(storesTable).where(eq(storesTable.id, emp.storeId));
      }
      return db.select().from(storesTable).orderBy(storesTable.name);

    case "list_chemicals":
      return db.select().from(chemicalsTable).orderBy(chemicalsTable.name);

    case "get_inventory": {
      const conditions = [];
      // Employees can only query their own store
      if (emp?.role === "employee") {
        if (emp.storeId == null) return { error: "Account has no store assigned" };
        conditions.push(eq(inventoryCountsTable.storeId, emp.storeId));
      } else {
        if (args.storeId) conditions.push(eq(inventoryCountsTable.storeId, Number(args.storeId)));
      }
      if (args.chemicalId) conditions.push(eq(inventoryCountsTable.chemicalId, Number(args.chemicalId)));
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
        .where(conditions.length ? and(...(conditions as [typeof conditions[0], ...typeof conditions])) : undefined)
        .orderBy(storesTable.name, chemicalsTable.name);
      return rows.map((r) => ({ ...r, quantity: parseFloat(r.quantity) }));
    }

    case "upsert_inventory": {
      const targetStoreId = Number(args.storeId);
      const chemicalId = Number(args.chemicalId);
      const quantity = Number(args.quantity);
      if (emp?.role === "employee") {
        if (emp.storeId == null) return { error: "Account has no store assigned" };
        if (emp.storeId !== targetStoreId) return { error: "Permission denied: cannot modify another store's inventory" };
      }
      const [existing] = await db
        .select({ quantity: inventoryCountsTable.quantity })
        .from(inventoryCountsTable)
        .where(and(eq(inventoryCountsTable.storeId, targetStoreId), eq(inventoryCountsTable.chemicalId, chemicalId)));
      await db.insert(inventoryHistoryTable).values({
        storeId: targetStoreId,
        chemicalId,
        oldQty: existing ? existing.quantity : null,
        newQty: String(quantity),
        source: "agent",
      });
      const [row] = await db
        .insert(inventoryCountsTable)
        .values({ storeId: targetStoreId, chemicalId, quantity: String(quantity) })
        .onConflictDoUpdate({
          target: [inventoryCountsTable.storeId, inventoryCountsTable.chemicalId],
          set: { quantity: String(quantity), updatedAt: new Date() },
        })
        .returning();
      return { ...row, quantity: parseFloat(row.quantity) };
    }

    case "delete_inventory": {
      const targetStoreId = Number(args.storeId);
      const chemicalId = Number(args.chemicalId);
      if (emp?.role === "employee") {
        if (emp.storeId == null) return { error: "Account has no store assigned" };
        if (emp.storeId !== targetStoreId) return { error: "Permission denied: cannot modify another store's inventory" };
      }
      const [existing] = await db
        .select({ quantity: inventoryCountsTable.quantity })
        .from(inventoryCountsTable)
        .where(and(eq(inventoryCountsTable.storeId, targetStoreId), eq(inventoryCountsTable.chemicalId, chemicalId)));
      if (existing) {
        await db.insert(inventoryHistoryTable).values({
          storeId: targetStoreId,
          chemicalId,
          oldQty: existing.quantity,
          newQty: null,
          source: "agent",
        });
      }
      await db
        .delete(inventoryCountsTable)
        .where(and(eq(inventoryCountsTable.storeId, targetStoreId), eq(inventoryCountsTable.chemicalId, chemicalId)));
      return { deleted: true };
    }

    case "create_store": {
      const [store] = await db.insert(storesTable).values(args as { name: string; address?: string; phone?: string; notes?: string }).returning();
      return store;
    }

    case "delete_store": {
      const [deleted] = await db
        .delete(storesTable)
        .where(eq(storesTable.id, Number(args.storeId)))
        .returning();
      return deleted ? { deleted: true, name: deleted.name } : { deleted: false, error: "Store not found" };
    }

    case "create_chemical": {
      const [chemical] = await db.insert(chemicalsTable).values(args as { name: string; category?: string; unit?: string; notes?: string }).returning();
      return chemical;
    }

    case "delete_chemical": {
      const [deleted] = await db
        .delete(chemicalsTable)
        .where(eq(chemicalsTable.id, Number(args.chemicalId)))
        .returning();
      return deleted ? { deleted: true, name: deleted.name } : { deleted: false, error: "Chemical not found" };
    }

    case "get_dashboard_summary": {
      const storeFilter = emp?.role === "employee" && emp.storeId != null
        ? eq(inventoryCountsTable.storeId, emp.storeId)
        : undefined;
      const [storeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(storesTable);
      const [chemicalCount] = await db.select({ count: sql<number>`count(*)::int` }).from(chemicalsTable);
      const inventoryQ = db.select({ count: sql<number>`count(*)::int` }).from(inventoryCountsTable);
      const [inventoryCount] = await (storeFilter ? inventoryQ.where(storeFilter) : inventoryQ);
      return {
        totalStores: Number(storeCount?.count ?? 0),
        totalChemicals: Number(chemicalCount?.count ?? 0),
        totalInventoryEntries: Number(inventoryCount?.count ?? 0),
      };
    }

    case "get_inventory_history": {
      const conditions = [];
      if (emp?.role === "employee") {
        if (emp.storeId == null) return { error: "Account has no store assigned" };
        conditions.push(eq(inventoryHistoryTable.storeId, emp.storeId));
      } else if (args.storeId) {
        conditions.push(eq(inventoryHistoryTable.storeId, Number(args.storeId)));
      }
      if (args.chemicalId) conditions.push(eq(inventoryHistoryTable.chemicalId, Number(args.chemicalId)));
      if (args.since) {
        const since = new Date(String(args.since));
        if (!isNaN(since.getTime())) conditions.push(gte(inventoryHistoryTable.changedAt, since));
      }
      if (args.until) {
        const until = new Date(String(args.until));
        if (!isNaN(until.getTime())) conditions.push(lte(inventoryHistoryTable.changedAt, until));
      }
      const limit = Math.min(Number(args.limit ?? 100), 500);
      const rows = await db
        .select({
          id: inventoryHistoryTable.id,
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
        .where(conditions.length ? and(...(conditions as [typeof conditions[0], ...typeof conditions])) : undefined)
        .orderBy(desc(inventoryHistoryTable.changedAt))
        .limit(limit);
      return rows.map((r) => ({
        ...r,
        oldQty: r.oldQty != null ? parseFloat(r.oldQty) : null,
        newQty: r.newQty != null ? parseFloat(r.newQty) : null,
        change: r.oldQty != null && r.newQty != null
          ? parseFloat(r.newQty) - parseFloat(r.oldQty)
          : null,
      }));
    }

    case "get_usage_report": {
      const conditions = [];
      if (emp?.role === "employee") {
        if (emp.storeId == null) return { error: "Account has no store assigned" };
        conditions.push(eq(inventoryHistoryTable.storeId, emp.storeId));
      } else if (args.storeId) {
        conditions.push(eq(inventoryHistoryTable.storeId, Number(args.storeId)));
      }
      if (args.chemicalId) conditions.push(eq(inventoryHistoryTable.chemicalId, Number(args.chemicalId)));
      if (args.since) {
        const since = new Date(String(args.since));
        if (!isNaN(since.getTime())) conditions.push(gte(inventoryHistoryTable.changedAt, since));
      }
      if (args.until) {
        const until = new Date(String(args.until));
        if (!isNaN(until.getTime())) conditions.push(lte(inventoryHistoryTable.changedAt, until));
      }
      const whereClause = conditions.length
        ? and(...(conditions as [typeof conditions[0], ...typeof conditions]))
        : undefined;
      const rows = await db
        .select({
          storeName: storesTable.name,
          chemicalName: chemicalsTable.name,
          unit: chemicalsTable.unit,
          totalUsed: sql<string>`
            SUM(CASE
              WHEN ${inventoryHistoryTable.source} = 'pull'
               AND ${inventoryHistoryTable.oldQty} IS NOT NULL
               AND ${inventoryHistoryTable.newQty} IS NOT NULL
              THEN CAST(${inventoryHistoryTable.oldQty} AS numeric) - CAST(${inventoryHistoryTable.newQty} AS numeric)
              WHEN ${inventoryHistoryTable.source} NOT IN ('pull', 'received')
               AND ${inventoryHistoryTable.oldQty} IS NOT NULL
               AND ${inventoryHistoryTable.newQty} IS NOT NULL
               AND CAST(${inventoryHistoryTable.newQty} AS numeric) < CAST(${inventoryHistoryTable.oldQty} AS numeric)
              THEN CAST(${inventoryHistoryTable.oldQty} AS numeric) - CAST(${inventoryHistoryTable.newQty} AS numeric)
              ELSE 0
            END)`,
          totalReceived: sql<string>`
            SUM(CASE
              WHEN ${inventoryHistoryTable.source} = 'received'
               AND ${inventoryHistoryTable.oldQty} IS NOT NULL
               AND ${inventoryHistoryTable.newQty} IS NOT NULL
              THEN CAST(${inventoryHistoryTable.newQty} AS numeric) - CAST(${inventoryHistoryTable.oldQty} AS numeric)
              WHEN ${inventoryHistoryTable.source} NOT IN ('pull', 'received')
               AND ${inventoryHistoryTable.oldQty} IS NOT NULL
               AND ${inventoryHistoryTable.newQty} IS NOT NULL
               AND CAST(${inventoryHistoryTable.newQty} AS numeric) > CAST(${inventoryHistoryTable.oldQty} AS numeric)
              THEN CAST(${inventoryHistoryTable.newQty} AS numeric) - CAST(${inventoryHistoryTable.oldQty} AS numeric)
              ELSE 0
            END)`,
          entryCount: sql<number>`COUNT(*)::int`,
        })
        .from(inventoryHistoryTable)
        .innerJoin(storesTable, eq(inventoryHistoryTable.storeId, storesTable.id))
        .innerJoin(chemicalsTable, eq(inventoryHistoryTable.chemicalId, chemicalsTable.id))
        .where(whereClause)
        .groupBy(storesTable.name, chemicalsTable.name, chemicalsTable.unit)
        .orderBy(storesTable.name, chemicalsTable.name);
      return rows.map((r) => ({
        storeName: r.storeName,
        chemicalName: r.chemicalName,
        unit: r.unit,
        totalUsed: parseFloat(r.totalUsed ?? "0"),
        totalReceived: parseFloat(r.totalReceived ?? "0"),
        netChange: parseFloat(r.totalReceived ?? "0") - parseFloat(r.totalUsed ?? "0"),
        entryCount: Number(r.entryCount),
      }));
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// POST /reports/generate — SSE stream
router.post("/reports/generate", requireAuth, async (req, res): Promise<void> => {
  const { prompt } = req.body as { prompt?: string };
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const emp = req.employee;
  const isEmployee = emp?.role === "employee";
  const tools = isEmployee
    ? allTools.filter((t) => !ADMIN_ONLY_TOOLS.has(t.function.name))
    : allTools;

  const [config] = await db.select().from(agentConfigTable).limit(1);
  const basePrompt = config?.systemPrompt ?? DEFAULT_AGENT_SYSTEM_PROMPT;
  const systemPrompt = basePrompt + `

## Inventory transaction types

The system records three distinct transaction types in the inventory history (the \`source\` field):
- **"count"** — a physical count or baseline entry. The user entered the actual quantity on hand. This sets the inventory to an absolute value. It may go up or down vs. the prior value; treat it as a measurement, not a usage or receipt event.
- **"pull"** — chemicals were pulled/consumed for a job ("pull for online"). The user entered the amount removed, which was subtracted from inventory. Always represents real usage/consumption.
- **"received"** — a shipment arrived. The user entered the amount received, which was added to inventory. Always represents a real receipt.
- **"manual"** or **"agent"** — legacy or AI-generated entries; treat like "count" (use the newQty < oldQty / newQty > oldQty heuristic).

When a user asks "how much was used?", "how much did we pull?", or "how much did we go through?":
1. Call get_usage_report — it sums pull transactions and count-based decreases as totalUsed.
2. Do NOT just read current inventory with get_inventory.
3. Always state the time period your answer covers (e.g. "since January", "all time").

When a user asks "how much did we receive?" or "what was restocked?":
1. Call get_usage_report — it sums received transactions and count-based increases as totalReceived.

For a row-by-row breakdown showing each pull, receipt, or count entry, use get_inventory_history with the relevant filters and look at the source field to distinguish transaction types.

## Averaging and partial submissions

When a count session is submitted, only chemicals the user explicitly filled in are saved. Chemicals left blank are NOT submitted and retain their previous values in the inventory table. This means:
- When computing an average quantity across chemicals, ONLY include chemicals that have at least one history entry in the relevant time period. Do not average in a chemical based solely on its current stored value if there is no history for it in the period being analyzed.
- When a user asks for "average inventory" or similar: use get_inventory_history (or get_usage_report) to find which chemicals were actually counted, then average only those.
- Clearly state which chemicals were included vs. excluded from any average you compute.`;


  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    type ChatMessage = {
      role: "system" | "user" | "assistant" | "tool";
      content: string | null;
      tool_call_id?: string;
      tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
    };

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    while (true) {
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages as Parameters<typeof openai.chat.completions.create>[0]["messages"],
        tools: tools as Parameters<typeof openai.chat.completions.create>[0]["tools"],
        tool_choice: "auto",
        stream: true,
      });

      let currentContent = "";
      const currentToolCalls = new Map<number, { id: string; name: string; arguments: string }>();
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) continue;

        const delta = choice.delta as {
          content?: string;
          tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
        };
        finishReason = choice.finish_reason ?? finishReason;

        if (delta.content) {
          currentContent += delta.content;
          sendEvent({ content: delta.content });
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = currentToolCalls.get(tc.index) ?? { id: "", name: "", arguments: "" };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            currentToolCalls.set(tc.index, existing);
          }
        }
      }

      const assistantMsg: ChatMessage = { role: "assistant", content: currentContent || null };
      if (currentToolCalls.size > 0) {
        assistantMsg.tool_calls = Array.from(currentToolCalls.values()).map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: tc.arguments },
        }));
      }
      messages.push(assistantMsg);

      if (finishReason === "tool_calls" && currentToolCalls.size > 0) {
        for (const tc of currentToolCalls.values()) {
          let args: ToolArgs = {};
          try { args = JSON.parse(tc.arguments); } catch { /* noop */ }
          const result = await executeTool(tc.name, args, emp ? { role: emp.role, storeId: emp.storeId ?? null } : undefined);
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue;
      }

      break;
    }

    sendEvent({ done: true });
  } catch (err) {
    sendEvent({ error: err instanceof Error ? err.message : "Unknown error" });
  } finally {
    res.end();
  }
});

export default router;
