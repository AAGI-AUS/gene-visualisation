import { packParsed, filterPacked } from "@/src/store/analysisJob";
import { parseBED } from "@/src/utils";
import { makeBedText as bedText } from "@/src/test/factories";
import type { PackRequest } from "@/src/store/analysisJob";
import type * as WorkerPoolModule from "@/src/store/workerPool";

// Controllable fake Worker so the pool's worker branches (dispatch, round-robin,
// onmessage resolution, onerror rejection, resize teardown) actually execute —
// jsdom has no Worker, so without this every call falls through to the serial path.
class MockWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  posted: PackRequest[] = [];
  terminated = false;

  postMessage(msg: PackRequest) {
    this.posted.push(msg);
  }

  terminate() {
    this.terminated = true;
  }

  reply(index = this.posted.length - 1) {
    const { jobId, text } = this.posted[index];
    this.onmessage?.({ data: { jobId, packed: packParsed(parseBED(text)) } });
  }

  crash() {
    this.onerror?.(new Error("boom"));
  }
}

const mockWorkers: MockWorker[] = [];

// jest moduleNameMapper rewrites workerPool's `./createAnalysisWorker` import to
// `createAnalysisWorker.testStub`, so that is the path we mock here.
jest.mock("@/src/store/createAnalysisWorker.testStub", () => ({
  createAnalysisWorker: () => {
    const w = new MockWorker();
    mockWorkers.push(w);
    return w;
  },
}));

type Pool = typeof WorkerPoolModule;
const loadPool = (): Pool => require("@/src/store/workerPool");

beforeEach(() => {
  jest.resetModules();
  mockWorkers.length = 0;
  (global as unknown as { Worker: unknown }).Worker = MockWorker;
});

const text = bedText([
  ["1A", 0, 100, "+", 0],
  ["2B", 100, 200, "-", 1],
]);

describe("worker dispatch", () => {
  it("spreads distinct files round-robin across the pool", () => {
    const pool = loadPool();
    pool.setPoolSize(2);

    const variantText = bedText([
      ["1A", 0, 100, "+", 0],
      ["2B", 100, 300, "+", 1],
    ]);

    pool.packFile("a", text);
    pool.packFile("b", variantText);
    pool.packFile("c", variantText);

    expect(mockWorkers).toHaveLength(2);
    expect(mockWorkers[0].posted.map((m) => m.text)).toEqual([text, variantText]); // a, c
    expect(mockWorkers[1].posted.map((m) => m.text)).toEqual([variantText]); // b

    mockWorkers.forEach((w) => w.posted.forEach((_, i) => w.reply(i)));
  });

  it("resolves with the pack parsed by the worker and caches it", async () => {
    const pool = loadPool();
    pool.setPoolSize(1);

    const promise = pool.packFile("k", text);
    expect(mockWorkers).toHaveLength(1);
    mockWorkers[0].reply();

    const packed = await promise;
    expect(filterPacked(packed, new Set([1])).map((r) => r.id)).toEqual([1]);
    expect(pool.isCached("k")).toBe(true);
    expect(pool.getCachedPacked("k")).toBe(packed);
  });

  it("dedupes concurrent requests for the same key into one job", async () => {
    const pool = loadPool();
    pool.setPoolSize(2);

    const p1 = pool.packFile("dup", text);
    const p2 = pool.packFile("dup", text);

    expect(p1).toBe(p2);
    expect(mockWorkers[0].posted).toHaveLength(1);

    mockWorkers[0].reply();
    expect(await p1).toBe(await p2);
  });
});

describe("worker crash", () => {
  it("rejects in-flight jobs and falls back to the serial path afterward", async () => {
    const pool = loadPool();
    pool.setPoolSize(1);

    const inflight = pool.packFile("will-fail", text);
    expect(mockWorkers).toHaveLength(1);
    mockWorkers[0].crash();

    await expect(inflight).rejects.toThrow();
    expect(mockWorkers[0].terminated).toBe(true);

    // Pool is now marked unavailable: no new worker, serial parse instead.
    const packed = await pool.packFile("after-crash", text);
    expect(mockWorkers).toHaveLength(1);
    expect(filterPacked(packed, new Set([1])).map((r) => r.id)).toEqual([1]);
  });
});

describe("setPoolSize teardown", () => {
  it("terminates existing workers and rebuilds at the new size", async () => {
    const pool = loadPool();
    pool.setPoolSize(2);

    const first = pool.packFile("x", text);
    expect(mockWorkers).toHaveLength(2);
    mockWorkers[0].reply();
    await first;

    pool.setPoolSize(3);
    expect(mockWorkers[0].terminated).toBe(true);
    expect(mockWorkers[1].terminated).toBe(true);

    // Cache survives the resize; a fresh uncached file builds 3 new workers.
    expect(pool.isCached("x")).toBe(true);
    pool.packFile("y", text);
    expect(mockWorkers).toHaveLength(5);
    expect(mockWorkers.slice(2).every((w) => !w.terminated)).toBe(true);
  });
});
