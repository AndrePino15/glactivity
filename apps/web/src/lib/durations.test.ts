import { describe, expect, it } from "vitest";
import { learningFrom, type AnsweredBlock } from "./durations";

const block = (outcome: AnsweredBlock["outcome"], localHour: number): AnsweredBlock => ({ outcome, minutes: 60, localHour });

describe("learning how long things take", () => {
  it("says nothing until there's enough to go on", () => {
    const l = learningFrom([block("done", 9), block("missed", 20)], [{ subject: null, first_estimate_minutes: 60, actual_minutes: 90 }]);
    expect([l.estimateRatio, l.bestTime, l.sentences]).toEqual([null, null, []]);
  });

  it("finds the typical overrun, per subject, and the best time of day", () => {
    const blocks = [
      block("done", 9), block("done", 10), block("more", 11), block("done", 8),
      block("missed", 20), block("missed", 21), block("done", 19),
      block(null, 14),
    ];
    const finished = [
      { subject: "HIST", first_estimate_minutes: 120, actual_minutes: 240 },
      { subject: "HIST", first_estimate_minutes: 60, actual_minutes: 108 },
      { subject: "MATH", first_estimate_minutes: 100, actual_minutes: 110 },
      { subject: "MATH", first_estimate_minutes: 60, actual_minutes: 72 },
      { subject: null, first_estimate_minutes: null, actual_minutes: 60 },
    ];
    const l = learningFrom(blocks, finished);
    expect(l.answered).toBe(7);
    expect(l.unanswered).toBe(1);
    expect(l.estimateRatio).toBe(1.5); // median of 2, 1.8, 1.1, 1.2
    expect(l.ratioBySubject).toEqual([
      { subject: "HIST", ratio: 1.9, tasks: 2 },
      { subject: "MATH", ratio: 1.2, tasks: 2 },
    ]);
    expect(l.bestTime).toBe("morning");
    expect(l.sentences).toEqual([
      "Things take about 1.5× the first estimate (from 4 finished tasks).",
      "HIST: about 1.9× the estimate.",
      "MATH: about 1.2× the estimate.",
      "Study blocks in the morning get done most (100%).",
    ]);
  });
});
