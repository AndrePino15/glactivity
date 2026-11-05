import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { toLondonDate } from "@/lib/calendar/london";
import { runReminderJob, type Batch } from "@/lib/push-job";
import { sendPush } from "@/lib/push.server";
import { supabaseKey, supabaseUrl } from "@/lib/supabase/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/cron/reminders {"token": "…"} — called once a day by a scheduled
 * job in the database. The token lives only in the database, so nobody else
 * can trigger the run or read what it reads.
 */
export async function POST(request: NextRequest) {
  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  if (!token || !UUID.test(token)) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("push_batch", { token });
  if (error) return NextResponse.json({ error: "Not allowed" }, { status: 401 });

  const contact = request.nextUrl.origin;
  const result = await runReminderJob(data as Batch, toLondonDate(new Date()), {
    send: (subscription, payload, keys) => sendPush(subscription, payload, keys, contact),
    markNotified: async (ids, day) => {
      await db.rpc("mark_notified", { token, reminder_ids: ids, on_day: day });
    },
    forget: async (endpoint) => {
      await db.rpc("forget_subscription", { token, gone_endpoint: endpoint });
    },
  });
  return NextResponse.json(result);
}
