import type { ChrBar, ChunkRibbon, OthersBar, QuerySlot } from "@/types";
import type { PairInput, VisualizationLayout } from "@/src/hooks/useVisualizationLayout";
import type { PredictedPerPair } from "@/src/components/visualizationTab/predicted";
import { buildPredictedPerPair, mergeIntoPredictedByLine } from "@/src/components/visualizationTab/predicted";
import { getPredictingRange } from "@/src/components/visualizationTab/utils";
import { makeChunk } from "@/src/test/factories";

const MBP = 1e6;

const rangeBp = (chr: string, line: string) => {
  const { lo, hi } = getPredictingRange(chr, line);
  return { lo: lo * MBP, hi: hi * MBP, mid: ((lo + hi) / 2) * MBP };
};

const chrBar = (chr: string): ChrBar => ({ kind: "chr", chr, px: 0, pw: 100, bpLen: 100, p1: 0 });
const othersBar: OthersBar = { kind: "others", baseChr: "1A", side: "left", px: 0, pw: 10, targetX: 0 };

const queryRibbon = (chrQuery: string, bp1Query: number, bp2Query: number): ChunkRibbon => ({
  chunk: makeChunk({ chrQuery, bp1Query, bp2Query }),
  bxs: 0,
  bxe: 0,
  qxs: 0,
  qxe: 0,
});

const layout = (opts: {
  baseBars?: ChrBar[];
  querySlots?: QuerySlot[];
  ribbons?: ChunkRibbon[];
}): VisualizationLayout => ({
  baseRow: { label: "base", bars: opts.baseBars ?? [], y: 0 },
  queryRow: { label: "query", slots: opts.querySlots ?? [], y: 0 },
  ribbons: opts.ribbons ?? [],
  y1bot: 0,
  y2top: 0,
});

describe("buildPredictedPerPair", () => {
  it("lowercases queryLabel and places the center in an empty predicting range", () => {
    const pairs: PairInput[] = [{ queryLabel: "Paragon", data: [] }];
    const [pair] = buildPredictedPerPair([layout({ querySlots: [chrBar("1A")] })], pairs, "base");

    expect(pair.queryLineKey).toBe("paragon");
    expect(pair.queryPredicted.get("1A")).toEqual([rangeBp("1A", "paragon").mid]);
  });

  it("centers on the largest uncovered span given ribbon intervals", () => {
    const pairs: PairInput[] = [{ queryLabel: "paragon", data: [] }];
    const { lo, hi, mid } = rangeBp("1A", "paragon");
    const [pair] = buildPredictedPerPair(
      [layout({ querySlots: [chrBar("1A")], ribbons: [queryRibbon("1A", lo, mid)] })],
      pairs,
      "base"
    );

    // covering the lower half leaves [mid, hi] as the largest gap
    expect(pair.queryPredicted.get("1A")).toEqual([(mid + hi) / 2]);
  });

  it("picks the largest gap when multiple ribbons leave several gaps", () => {
    const pairs: PairInput[] = [{ queryLabel: "paragon", data: [] }];
    const { lo, hi } = rangeBp("1A", "paragon");
    const ribbons = [
      queryRibbon("1A", lo, lo + 5 * MBP),
      // [lo+5M, lo+15M] gap
      queryRibbon("1A", lo + 15 * MBP, lo + 20 * MBP),
      // [lo+20M, lo+50M] gap
      queryRibbon("1A", lo + 50 * MBP, hi),
    ];
    const [pair] = buildPredictedPerPair([layout({ querySlots: [chrBar("1A")], ribbons })], pairs, "base");

    expect(pair.queryPredicted.get("1A")).toEqual([(lo + 20 * MBP + lo + 50 * MBP) / 2]);
  });

  it("ignores non-chr query slots", () => {
    const pairs: PairInput[] = [{ queryLabel: "paragon", data: [] }];
    const [pair] = buildPredictedPerPair([layout({ querySlots: [othersBar, chrBar("1A")] })], pairs, "base");

    expect([...pair.queryPredicted.keys()]).toEqual(["1A"]);
  });

  it("emits no query predicted when the line matches no predicting chr", () => {
    const pairs: PairInput[] = [{ queryLabel: "unknown", data: [] }];
    const [pair] = buildPredictedPerPair([layout({ querySlots: [chrBar("1A")] })], pairs, "base");

    expect(pair.queryPredicted.size).toBe(0);
  });

  it("computes base predicted only for pair 0", () => {
    const pairs: PairInput[] = [
      { queryLabel: "q1", data: [] },
      { queryLabel: "q2", data: [] },
    ];
    const layouts = [layout({ baseBars: [chrBar("1A")] }), layout({ baseBars: [chrBar("1A")] })];
    const [first, second] = buildPredictedPerPair(layouts, pairs, "paragon");

    expect(first.basePredicted.get("1A")).toEqual([rangeBp("1A", "paragon").mid]);
    expect(second.basePredicted.size).toBe(0);
  });
});

describe("mergeIntoPredictedByLine", () => {
  const entry = (
    queryLineKey: string,
    query: [string, number[]][],
    base: [string, number[]][] = []
  ): PredictedPerPair => ({
    basePredicted: new Map(base),
    queryPredicted: new Map(query),
    queryLineKey,
  });

  it("merges query positions under the line key, taking the first bp", () => {
    const predicted = [150];
    const merged = mergeIntoPredictedByLine([entry("paragon", [["1A", predicted]])], "base");
    expect(merged.get("paragon")?.get("1A")).toBe(predicted[0]);
  });

  it("takes only the first element when positions hold multiple bps", () => {
    const predicted = [300, 400];
    const merged = mergeIntoPredictedByLine([entry("paragon", [["1A", predicted]])], "base");
    expect(merged.get("paragon")?.get("1A")).toBe(predicted[0]);
  });

  it("includes base positions only from pair 0", () => {
    const predicted = [100];
    const perPair = [entry("paragon", [], [["1A", predicted]]), entry("spelt", [], [["2B", [200]]])];
    const merged = mergeIntoPredictedByLine(perPair, "base");

    expect(merged.get("base")?.get("1A")).toBe(predicted[0]);
    expect(merged.get("base")?.has("2B")).toBe(false);
  });

  it("skips empty position maps and empty line keys", () => {
    expect(mergeIntoPredictedByLine([entry("paragon", [])], "base").size).toBe(0);
    expect(mergeIntoPredictedByLine([entry("", [["1A", [5]]])], "base").size).toBe(0);
  });

  it("lets a later pair overwrite an earlier value for the same line and chr", () => {
    const perPair = [entry("paragon", [["1A", [100]]]), entry("paragon", [["1A", [200]]])];
    const merged = mergeIntoPredictedByLine(perPair, "base");

    expect(merged.get("paragon")?.get("1A")).toBe(200);
  });
});
