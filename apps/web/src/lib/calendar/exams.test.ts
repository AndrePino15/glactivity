import { describe, expect, it } from "vitest";
import { parseExamText } from "./exams";

const today = "2026-11-20";

describe("parseExamText", () => {
  it("reads table rows copied from a web page", () => {
    const text = [
      "Module\tTitle\tDate\tStart\tDuration\tRoom",
      "COMP1215\tFoundations of Computer Science\t12/01/2027\t09:30\t2 hours\tJubilee Sports Hall",
      "MATH1058\tMathematics for Computer Science\t15/01/2027\t14:00\t90 mins\tHighfield 2A",
    ].join("\n");
    expect(parseExamText(text, today)).toEqual([
      {
        title: "COMP1215 Foundations of Computer Science Jubilee Sports Hall",
        date: "2027-01-12",
        start: "09:30",
        end: "11:30",
        timeKnown: true,
      },
      {
        title: "MATH1058 Mathematics for Computer Science Highfield 2A",
        date: "2027-01-15",
        start: "14:00",
        end: "15:30",
        timeKnown: true,
      },
    ]);
  });

  it("carries a date heading down to the exams under it", () => {
    const text = "Monday 18 January\nCOMP1202 Programming 1 2pm-4pm\nELEC1201 Electronic Systems 9.00 - 11.00";
    expect(parseExamText(text, today).map((e) => [e.date, e.start, e.end])).toEqual([
      ["2027-01-18", "14:00", "16:00"],
      ["2027-01-18", "09:00", "11:00"],
    ]);
  });

  it("assumes 09:00 when no time is given and says so", () => {
    const [exam] = parseExamText("COMP1216 Software Modelling, 20 May 2027", today);
    expect(exam).toMatchObject({ date: "2027-05-20", start: "09:00", end: "11:00", timeKnown: false });
  });

  it("ignores lines without a module code", () => {
    expect(parseExamText("Your exam timetable\nPlease arrive 15 minutes early", today)).toEqual([]);
  });
});
