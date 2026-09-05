import { describe, expect, test } from "vitest";
import { fmt, fmtCost, fmtDate } from "./format.js";

describe("fmt", () => {
  test("space-grouped thousands separator", () => {
    expect(fmt(1234)).toBe("1 234");
    expect(fmt(128451)).toBe("128 451");
    expect(fmt(0)).toBe("0");
    expect(fmt(999)).toBe("999");
  });
});

describe("fmtCost", () => {
  test("European decimal comma, fixed 4 decimals", () => {
    expect(fmtCost(1.5)).toBe("1,5000");
    expect(fmtCost(0)).toBe("0,0000");
  });
});

describe("fmtDate", () => {
  /** Independent oracle via `Intl.DateTimeFormat` (a different code path than `fmtDate`'s manual
   * getters/padding), so this actually catches a regression rather than mirroring one. */
  function expected(iso: string): string {
    const parts = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(iso));
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
  }

  test("formats as DD/MM/YYYY HH:MM:SS in the local timezone", () => {
    const iso = "2026-09-04T13:07:09.000Z";
    expect(fmtDate(iso)).toBe(expected(iso));
  });

  test("pads single-digit day/month/hour/minute/second", () => {
    const iso = "2026-01-02T03:04:05.000Z";
    expect(fmtDate(iso)).toBe(expected(iso));
  });
});
