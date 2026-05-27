import { relabelIntraChunks, type IntraScoreConfig } from "@/src/components/visualizationTab/relabel";
import { counts, makeChunk } from "@/src/test/factories";
import type { Chunk } from "@/types";

const M = 1_000_000;

const config: IntraScoreConfig = {
  minLocalEvents: 500,
  gapStopMbp: 10,
  driftK: 0.7,
  complexMin: 2,
};

interface ChunkSpec {
  base: number; // bp1Base in Mbp
  query: number; // bp1Query in Mbp
  width?: number; // span in Mbp (default 4)
  chrBase?: string;
  chrQuery?: string;
  total?: number;
  isInvert?: boolean;
  dominant?: Chunk["dominant"];
}

const chunk = (spec: ChunkSpec): Chunk => {
  const width = (spec.width ?? 4) * M;
  const bp1Base = spec.base * M;
  const bp1Query = spec.query * M;
  const total = spec.total ?? 1;
  return makeChunk({
    ids: [spec.base],
    chrBase: spec.chrBase ?? "1A",
    bp1Base,
    bp2Base: bp1Base + width,
    bpGeneBase: width,
    chrQuery: spec.chrQuery ?? "1A",
    bp1Query,
    bp2Query: bp1Query + width,
    bpGeneQuery: width,
    dominant: spec.dominant ?? "synteny",
    eventCounts: counts({ synteny: total, total }),
    isInvert: spec.isInvert ?? false,
  });
};

describe("relabelIntraChunks", () => {
  // Intra-chromosomal layout where idx2 gets relabeled when enabled (backbones idx0/idx1).
  const baseChunks = (): Chunk[] => [
    chunk({ base: 0, query: 5, total: 1000 }),
    chunk({ base: 10, query: 15, total: 1000 }),
    chunk({ base: 20, query: 70, total: 100 }),
    chunk({ base: 30, query: 35, total: 100 }),
  ];

  describe("short-circuits (preserve input reference for downstream memoization)", () => {
    it("returns the input reference when disabled, bypassing a relabel that would otherwise apply", () => {
      const chunks = baseChunks();
      expect(relabelIntraChunks(chunks, false, config)).toBe(chunks);
    });

    it("returns the input reference for empty input", () => {
      const chunks: Chunk[] = [];
      expect(relabelIntraChunks(chunks, true, config)).toBe(chunks);
    });

    it("returns the input reference when no chunk is relabeled", () => {
      // Two monotonic backbones (base order === query order) form no region.
      const chunks = baseChunks().slice(0, 2);
      expect(relabelIntraChunks(chunks, true, config)).toBe(chunks);
    });

    it("ignores inter-chromosomal chunks (chrBase !== chrQuery)", () => {
      const chunks = [
        chunk({ base: 0, query: 0, chrQuery: "2B" }),
        chunk({ base: 10, query: 50, chrQuery: "2B" }),
        chunk({ base: 5, query: 100, chrQuery: "2B" }),
      ];
      expect(relabelIntraChunks(chunks, true, config)).toBe(chunks);
    });

    it("skips chromosome groups with fewer than two chunks", () => {
      const chunks = [chunk({ base: 0, query: 50, chrBase: "1A", chrQuery: "1A" })];
      expect(relabelIntraChunks(chunks, true, config)).toBe(chunks);
    });
  });

  describe("stray pre-filter", () => {
    // baseOrder indices 0..4; query positions give q = [0, 1, 4, 2, 3]:
    // index 2 is the only one with |q[k]-k| > 1, flanked by near-backbones, so it is
    // dropped from regions and hard-labeled. After the drop the rest is pure backbone.
    const strayLayout = (strayInvert: boolean) => [
      chunk({ base: 0, query: 0, total: 1000 }),
      chunk({ base: 10, query: 10, total: 1000 }),
      chunk({ base: 20, query: 40, total: 1, isInvert: strayInvert }), // sandwiched stray
      chunk({ base: 30, query: 20, total: 1000 }),
      chunk({ base: 40, query: 30, total: 1000 }),
    ];

    it("relabels a small sandwiched chunk as translocation", () => {
      const chunks = strayLayout(false);
      const out = relabelIntraChunks(chunks, true, config);
      expect(out[2].dominant).toBe("translocation");
      // Surrounding backbones are untouched and returned by reference.
      expect(out[0]).toBe(chunks[0]);
      expect(out[1]).toBe(chunks[1]);
      expect(out[3]).toBe(chunks[3]);
      expect(out[4]).toBe(chunks[4]);
    });

    it("uses translocation+inversion for an inverted stray", () => {
      const out = relabelIntraChunks(strayLayout(true), true, config);
      expect(out[2].dominant).toBe("translocation+inversion");
    });

    it("does not relabel a sandwiched chunk at or above the event cap", () => {
      const chunks = strayLayout(false);
      chunks[2] = chunk({ base: 20, query: 40, total: 50 }); // STRAY_MAX_EVENTS
      expect(relabelIntraChunks(chunks, true, config)).toBe(chunks);
    });
  });

  describe("score pass", () => {
    it("relabels the outlier of a two-candidate region against the backbone offset", () => {
      const chunks = baseChunks();
      const out = relabelIntraChunks(chunks, true, config);
      expect(out[2].dominant).toBe("translocation");
      expect(out[0]).toBe(chunks[0]);
      expect(out[1]).toBe(chunks[1]);
      expect(out[3]).toBe(chunks[3]);
    });
  });
});
