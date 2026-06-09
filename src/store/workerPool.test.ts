import {
  clearWorkerCaches,
  defaultWorkerCount,
  getCachedPacked,
  isCached,
  packFile,
  setPoolSize,
} from "@/src/store/workerPool";
import { filterPacked } from "@/src/store/analysisJob";
import { makeBedText as bedText } from "@/src/test/factories";

afterEach(() => clearWorkerCaches());

const text = bedText([
  ["1A", 0, 100, "+", 0],
  ["1A", 100, 200, "+", 1],
  ["2B", 200, 300, "-", 2],
]);

describe("defaultWorkerCount", () => {
  it("is a positive integer", () => {
    expect(Number.isInteger(defaultWorkerCount)).toBe(true);
    expect(defaultWorkerCount).toBeGreaterThanOrEqual(1);
  });
});

describe("packFile (serial fallback)", () => {
  it("parses text into a packed cache and caches it by key", async () => {
    expect(isCached("fp-1")).toBe(false);

    const packed = await packFile("fp-1", text);
    expect(packed.ids.length).toBe(3);
    expect(isCached("fp-1")).toBe(true);
    expect(getCachedPacked("fp-1")).toBe(packed);
  });

  it("returns the cached pack on a repeat call without re-parsing", async () => {
    const first = await packFile("fp-2", bedText([["1A", 0, 100, "+", 0]]));
    const second = await packFile("fp-2", "ignored-because-cached");
    expect(second).toBe(first);
  });

  it("supports filtering the cached pack by different id sets", async () => {
    const packed = await packFile("fp-3", text);
    expect(filterPacked(packed, new Set([0, 2])).map((r) => r.id)).toEqual([0, 2]);
    expect(filterPacked(packed, new Set([1])).map((r) => r.id)).toEqual([1]);
  });
});

describe("clearWorkerCaches", () => {
  it("drops cached packs", async () => {
    await packFile("fp-clear", bedText([["1A", 0, 100, "+", 0]]));
    expect(isCached("fp-clear")).toBe(true);
    clearWorkerCaches();
    expect(isCached("fp-clear")).toBe(false);
  });

  it("is a no-op when nothing is cached", () => {
    expect(() => clearWorkerCaches()).not.toThrow();
  });
});

describe("setPoolSize", () => {
  it("clamps non-positive sizes to at least 1", () => {
    expect(() => setPoolSize(0)).not.toThrow();
    expect(() => setPoolSize(-5)).not.toThrow();
  });

  it("clamps oversized requests without throwing", () => {
    expect(() => setPoolSize(1000)).not.toThrow();
  });

  it("accepts a no-op resize without throwing", () => {
    expect(() => setPoolSize(defaultWorkerCount)).not.toThrow();
  });

  it("accepts a fractional input (floored internally)", () => {
    expect(() => setPoolSize(2.7)).not.toThrow();
  });
});
