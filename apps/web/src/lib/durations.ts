/**
 * What the one-tap answers after study blocks teach: how far off estimates
 * are, and when study actually happens. Used by the connector (so Claude
 * plans with it) and by Settings → Assistant (so you can see it).
 */

export type AnsweredBlock = { outcome: "done" | "more" | "missed" | null; minutes: number; localHour: number; status?: string };
export type FinishedTask = { subject: string | null; first_estimate_minutes: number | null; actual_minutes: number };

export type TimeOfDay = "morning" | "afternoon" | "evening";
const timeOfDay = (hour: number): TimeOfDay => (hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening");

/** At least this many answers or tasks before saying anything. */
const MIN_BLOCKS = 5;
const MIN_TASKS = 3;

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

export type Learning = {
  answered: number;
  unanswered: number;
  /** Share of answered blocks that got done (done or needed more), by time of day. */
  followThrough: Record<TimeOfDay, { answered: number; done: number; rate: number | null }>;
  /** The time of day with clearly the best follow-through, if any. */
  bestTime: TimeOfDay | null;
  /** How long things really take compared with the first estimate (1.4 = 40% longer). */
  estimateRatio: number | null;
  ratioBySubject: { subject: string; ratio: number; tasks: number }[];
  tasksCompared: number;
  /** Plain sentences, for the owner and for the profile. */
  sentences: string[];
};

export function learningFrom(blocks: AnsweredBlock[], finished: FinishedTask[]): Learning {
  const followThrough = {
    morning: { answered: 0, done: 0, rate: null as number | null },
    afternoon: { answered: 0, done: 0, rate: null as number | null },
    evening: { answered: 0, done: 0, rate: null as number | null },
  };
  let answered = 0;
  let unanswered = 0;
  for (const b of blocks) {
    if (b.status === "skipped" || b.status === "withdrawn") continue;
    if (!b.outcome) {
      unanswered++;
      continue;
    }
    answered++;
    const slot = followThrough[timeOfDay(b.localHour)];
    slot.answered++;
    if (b.outcome !== "missed") slot.done++;
  }
  for (const slot of Object.values(followThrough)) slot.rate = slot.answered >= 3 ? slot.done / slot.answered : null;

  const ranked = (Object.entries(followThrough) as [TimeOfDay, (typeof followThrough)[TimeOfDay]][])
    .filter(([, s]) => s.rate !== null)
    .sort((a, b) => b[1].rate! - a[1].rate!);
  const bestTime =
    answered >= MIN_BLOCKS && ranked.length >= 2 && ranked[0][1].rate! - ranked[ranked.length - 1][1].rate! >= 0.25 ? ranked[0][0] : null;

  const compared = finished.filter((t) => t.first_estimate_minutes && t.first_estimate_minutes > 0 && t.actual_minutes > 0);
  const ratios = compared.map((t) => t.actual_minutes / t.first_estimate_minutes!);
  const estimateRatio = compared.length >= MIN_TASKS ? round1(median(ratios)) : null;

  const bySubject = new Map<string, number[]>();
  for (const t of compared) {
    if (!t.subject) continue;
    bySubject.set(t.subject, [...(bySubject.get(t.subject) ?? []), t.actual_minutes / t.first_estimate_minutes!]);
  }
  const ratioBySubject = [...bySubject.entries()]
    .filter(([, r]) => r.length >= 2)
    .map(([subject, r]) => ({ subject, ratio: round1(median(r)), tasks: r.length }))
    .sort((a, b) => b.ratio - a.ratio);

  const sentences: string[] = [];
  if (estimateRatio !== null) {
    if (estimateRatio >= 1.15) sentences.push(`Things take about ${estimateRatio}× the first estimate (from ${compared.length} finished tasks).`);
    else if (estimateRatio <= 0.85) sentences.push(`Things take less than estimated: about ${estimateRatio}× (from ${compared.length} finished tasks).`);
    else sentences.push(`Estimates are about right (from ${compared.length} finished tasks).`);
  }
  for (const s of ratioBySubject.slice(0, 2)) {
    if (Math.abs(s.ratio - (estimateRatio ?? 1)) >= 0.2) sentences.push(`${s.subject}: about ${s.ratio}× the estimate.`);
  }
  if (bestTime) {
    const pct = Math.round(followThrough[bestTime].rate! * 100);
    sentences.push(`Study blocks in the ${bestTime} get done most (${pct}%).`);
  }
  return { answered, unanswered, followThrough, bestTime, estimateRatio, ratioBySubject, tasksCompared: compared.length, sentences };
}
