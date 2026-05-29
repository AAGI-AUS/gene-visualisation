// Shared test data builders (object-mother pattern). Neutral defaults; pass a Partial to
// override only what a test cares about. Scenario fixtures stay local to each suite.
import type { Chunk, EventCounts, ResultRow } from "@/types";

export const counts = (overrides: Partial<EventCounts> = {}): EventCounts => ({
  synteny: 0,
  inversion: 0,
  translocation: 0,
  "translocation+inversion": 0,
  total: 0,
  ...overrides,
});

export const makeChunk = (overrides: Partial<Chunk> = {}): Chunk => ({
  id: "c",
  ids: [0],
  chrBase: "1A",
  bp1Base: 0,
  bp2Base: 100,
  bpGeneBase: 100,
  chrQuery: "1A",
  bp1Query: 0,
  bp2Query: 100,
  bpGeneQuery: 100,
  dominant: "synteny",
  eventCounts: counts(),
  queryChromCounts: {},
  isInvert: false,
  isOthers: false,
  ...overrides,
});

export const makeRow = (overrides: Partial<ResultRow> = {}): ResultRow => ({
  id: 0,
  chromosomeBase: "1A",
  p1Base: 0,
  p2Base: 100,
  chromosomeQuery: "1A",
  p1Query: 0,
  p2Query: 100,
  sign: "+",
  isInvert: false,
  isTranslocation: false,
  mainEvent: "synteny",
  groupedQuery: "1A",
  ...overrides,
});

export const makeInversionRow = (overrides: Partial<ResultRow> = {}): ResultRow =>
  makeRow({
    sign: "-",
    isInvert: true,
    mainEvent: "inversion",
    ...overrides,
  });

export const makeContiguousRow = (id: number, len = 100, start = id * len): ResultRow =>
  makeRow({ id, p1Base: start, p2Base: start + len, p1Query: start, p2Query: start + len });

export const makeTranslocationRow = (overrides: Partial<ResultRow> = {}): ResultRow =>
  makeRow({
    isTranslocation: true,
    mainEvent: "translocation",
    ...overrides,
  });
