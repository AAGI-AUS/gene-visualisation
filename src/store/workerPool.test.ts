import {
  clearWorkerCaches,
  defaultWorkerCount,
  isCached,
  parseQueryInWorker,
  setPoolSize,
} from "@/src/store/workerPool";

const bed = (rows: (string | number)[][]) => rows.map((r) => r.join("\t")).join("\n");

describe("defaultWorkerCount", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(defaultWorkerCount)).toBe(true);
    expect(defaultWorkerCount).toBeGreaterThanOrEqual(1);
  });
});

describe("isCached", () => {
  it("returns false for unknown keys in the serial-fallback test env", () => {
    expect(isCached("nothing-here")).toBe(false);
  });

  it("stays false after a serial-fallback dispatch (serial path doesn't mark cache)", async () => {
    await parseQueryInWorker({
      ids: new Set([0]),
      queryText: bed([["1A", 0, 100, "+", 0]]),
      cacheKey: "serial-fp",
    });
    expect(isCached("serial-fp")).toBe(false);
  });
});

describe("clearWorkerCaches", () => {
  it("is a no-op when the pool hasn't been built", () => {
    expect(() => clearWorkerCaches()).not.toThrow();
  });
});

describe("setPoolSize", () => {
  it("clamps non-positive sizes to at least 1", () => {
    expect(() => setPoolSize(0)).not.toThrow();
    expect(() => setPoolSize(-5)).not.toThrow();
  });

  it("accepts a no-op resize without throwing", () => {
    expect(() => setPoolSize(defaultWorkerCount)).not.toThrow();
  });

  it("accepts a fractional input (floored internally)", () => {
    expect(() => setPoolSize(2.7)).not.toThrow();
  });
});

describe("parseQueryInWorker (serial fallback)", () => {
  it("parses queryText and filters by ids, returning a unique jobId per call", async () => {
    const text = bed([
      ["1A", 0, 100, "+", 0],
      ["1A", 100, 200, "+", 1],
      ["2B", 200, 300, "-", 2],
    ]);
    const a = await parseQueryInWorker({ ids: new Set([0, 2]), queryText: text });
    const b = await parseQueryInWorker({ ids: new Set([1]), queryText: text });
    expect(a.rows.map((r) => r.id)).toEqual([0, 2]);
    expect(b.rows.map((r) => r.id)).toEqual([1]);
    expect(a.jobId).not.toBe(b.jobId);
  });

  it("returns empty rows when queryText is omitted in the serial-fallback path", async () => {
    const res = await parseQueryInWorker({ ids: new Set([0]), cacheKey: "miss" });
    expect(res.rows).toEqual([]);
  });
});
