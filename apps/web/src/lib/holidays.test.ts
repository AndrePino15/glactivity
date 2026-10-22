import { describe, expect, it } from "vitest";
import { parseGovUk, parseNager } from "./holidays";

describe("holiday sources", () => {
  it("reads England and Wales from the gov.uk feed", () => {
    const json = {
      "england-and-wales": { events: [{ title: "Christmas Day", date: "2026-12-25", notes: "" }] },
      scotland: { events: [{ title: "St Andrew’s Day", date: "2026-11-30" }] },
    };
    expect(parseGovUk(json)).toEqual([{ country: "GB", date: "2026-12-25", name: "Christmas Day" }]);
  });

  it("keeps only national Portuguese holidays, with Portuguese names", () => {
    const json = [
      { date: "2026-12-08", localName: "Imaculada Conceição", name: "Immaculate Conception", global: true },
      { date: "2026-06-24", localName: "Dia de São João", name: "St John's Day", global: false },
    ];
    expect(parseNager(json)).toEqual([{ country: "PT", date: "2026-12-08", name: "Imaculada Conceição" }]);
  });

  it("copes with unexpected responses", () => {
    expect(parseGovUk(null)).toEqual([]);
    expect(parseNager({ error: "nope" })).toEqual([]);
  });
});
