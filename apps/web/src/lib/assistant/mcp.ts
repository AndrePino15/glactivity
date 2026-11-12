import { checkSteps, goalPlanningSteps, SERVER_INSTRUCTIONS } from "./instructions";
import { TOOLS, type Rpc } from "./tools";

/**
 * A small, stateless Model Context Protocol server (JSON-RPC over Streamable
 * HTTP, answering with plain JSON): tools and one prompt, nothing else.
 */

const SUPPORTED = ["2025-11-25", "2025-06-18", "2025-03-26"];
const SERVER = { name: "glactivity", title: "Glactivity", version: "1.0.0" };

type Id = string | number | null;
type Message = { jsonrpc?: string; id?: Id; method?: string; params?: Record<string, unknown> };
export type Reply = { jsonrpc: "2.0"; id: Id; result?: unknown; error?: { code: number; message: string } };

const ok = (id: Id, result: unknown): Reply => ({ jsonrpc: "2.0", id, result });
const fail = (id: Id, code: number, message: string): Reply => ({ jsonrpc: "2.0", id, error: { code, message } });

const PROMPTS = [
  {
    name: "glactivity_check",
    title: "Glactivity check",
    description: "Morning or evening check: read memory and context, learn, brief, up to 3 suggestions, log.",
    arguments: [{ name: "slot", description: "morning or evening", required: true }],
  },
  {
    name: "plan_a_goal",
    title: "Plan a goal",
    description: "Plan a big goal with Claude, step by step: understand, research official dates, milestones, hours, schedule, then save it to Glactivity.",
    arguments: [{ name: "goal", description: "The goal, in your words (e.g. apply to Imperial for an MSc in AI)", required: false }],
  },
];

/** Errors from the database become a short message Claude can act on. */
function explain(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^.*?ERROR:\s*/, "").slice(0, 500) || "Something went wrong";
}

/** Handles one JSON-RPC message; notifications (no id) get no reply. */
export async function handleMessage(message: Message, rpc: Rpc): Promise<Reply | null> {
  const id = message.id ?? null;
  const isNotification = message.id === undefined;
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return isNotification ? null : fail(id, -32600, "Invalid request");
  }
  if (isNotification) return null; // notifications/initialized, cancelled, …

  const params = message.params ?? {};
  switch (message.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok(id, {
        protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: SERVER,
        instructions: SERVER_INSTRUCTIONS,
      });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, {
        tools: TOOLS.map(({ name, title, description, inputSchema, annotations }) => ({
          name,
          title,
          description,
          inputSchema,
          annotations: { title, ...annotations },
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params.name);
      if (!tool) return fail(id, -32602, `Unknown tool: ${String(params.name)}`);
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await tool.run(args, rpc);
        return ok(id, {
          content: [{ type: "text", text: JSON.stringify(result ?? { ok: true }) }],
          structuredContent: result && typeof result === "object" && !Array.isArray(result) ? result : undefined,
          isError: false,
        });
      } catch (error) {
        // Tool errors go back to Claude as results, so it can correct itself.
        return ok(id, { content: [{ type: "text", text: explain(error) }], isError: true });
      }
    }
    case "prompts/list":
      return ok(id, { prompts: PROMPTS });
    case "prompts/get": {
      if (params.name === "plan_a_goal") {
        const goal = String((params.arguments as { goal?: string } | undefined)?.goal ?? "").slice(0, 500);
        return ok(id, {
          description: PROMPTS[1].description,
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `${goal ? `I want to plan this goal: ${goal}\n\n` : "I want to plan a goal with you.\n\n"}Use Glactivity: call get_context first (my goals, tasks, timetable and profile), then follow these steps.\n\n${goalPlanningSteps("chat")}`,
              },
            },
          ],
        });
      }
      if (params.name !== "glactivity_check") return fail(id, -32602, `Unknown prompt: ${String(params.name)}`);
      const slot = (params.arguments as { slot?: string } | undefined)?.slot === "evening" ? "evening" : "morning";
      return ok(id, {
        description: PROMPTS[0].description,
        messages: [{ role: "user", content: { type: "text", text: checkSteps(slot) } }],
      });
    }
    case "resources/list":
      return ok(id, { resources: [] });
    default:
      return fail(id, -32601, `Method not found: ${message.method}`);
  }
}

/** A request body may be one message or (older clients) a batch. */
export async function handleBody(body: unknown, rpc: Rpc): Promise<Reply | Reply[] | null> {
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => handleMessage(m as Message, rpc)))).filter((r) => r !== null);
    return replies.length ? replies : null;
  }
  if (!body || typeof body !== "object") return fail(null, -32700, "Parse error");
  return handleMessage(body as Message, rpc);
}
