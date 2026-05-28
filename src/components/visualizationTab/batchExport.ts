import { zip, type AsyncZippableFile } from "fflate";
import { useAppStore } from "@/src/store/useAppStore";
import { serializeSvg, svgToPngBlob, triggerDownload } from "@/src/components/visualizationTab/utils";
import type { Chunk } from "@/types";
import type { ChunkEvent } from "@/src/constants";

let svgEl: SVGSVGElement | null = null;

export const registerSvgEl = (el: SVGSVGElement | null): void => {
  svgEl = el;
};

export interface VisibleChunkPair {
  queryLabel: string;
  chunks: Chunk[];
}

export type PredictedByLine = Map<string, Map<string, number>>;

// Live snapshot bridging the rendered canvas to the export routines that live outside its
// subtree: the single-CSV button (under Controls) and the async batchExportAll loop, which
// drives a render-per-chromosome loop and harvests each frame. SyntenyCanvas writes this
// after each render via setVisibleExport. The CSV builders below take this data as explicit
// arguments rather than reading it implicitly, so they stay pure and unit-testable.
interface VisibleExport {
  pairs: VisibleChunkPair[];
  predicted: PredictedByLine;
}

let visibleExport: VisibleExport = { pairs: [], predicted: new Map() };

export const setVisibleExport = (snapshot: VisibleExport): void => {
  visibleExport = snapshot;
};

export const clearVisibleExport = (): void => {
  visibleExport = { pairs: [], predicted: new Map() };
};

const NOTABLE_EVENTS: ReadonlySet<ChunkEvent> = new Set<ChunkEvent>([
  "inversion",
  "translocation",
  "translocation+inversion",
]);

const CSV_HEADER = [
  "base_line",
  "base_chr",
  "query_line",
  "query_chr",
  "event",
  "base_bp1",
  "base_bp2",
  "query_bp1",
  "query_bp2",
  "event_count",
  "base_gene_span",
  "query_gene_span",
  "is_inverted",
  "is_translocated",
  "chunk_count",
].join("|");

interface MergedRow {
  baseChr: string;
  queryChr: string;
  event: ChunkEvent;
  bp1Base: number;
  bp2Base: number;
  bp1Query: number;
  bp2Query: number;
  eventCount: number;
  geneBase: number;
  geneQuery: number;
  chunkCount: number;
}

const formatRow = (baseLabel: string, queryLabel: string, m: MergedRow): string => {
  const inverted = m.event === "inversion" || m.event === "translocation+inversion";
  const translocated = m.event === "translocation" || m.event === "translocation+inversion";
  return [
    baseLabel,
    m.baseChr,
    queryLabel,
    m.queryChr,
    m.event,
    m.bp1Base,
    m.bp2Base,
    m.bp1Query,
    m.bp2Query,
    m.eventCount,
    m.geneBase,
    m.geneQuery,
    inverted,
    translocated,
    m.chunkCount,
  ].join("|");
};

const SYNTENY_MAP: Record<ChunkEvent, ChunkEvent> = {
  synteny: "synteny",
  inversion: "inversion",
  translocation: "synteny",
  "translocation+inversion": "inversion",
};

// Build CSV rows for the currently registered visible chunks. Within each
// pair, sort notable chunks by (chrBase, bp1Base), then merge a run of
// consecutive same-event chunks sharing the same chrBase and chrQuery.
const collectCsvRows = (pairs: VisibleChunkPair[], baseName: string): string[] => {
  const rows: string[] = [];
  let baseLabel = baseName;
  for (const { queryLabel, chunks } of pairs) {
    const notable = chunks
      .filter((c) => NOTABLE_EVENTS.has(c.dominant))
      .sort((a, b) => a.chrBase.localeCompare(b.chrBase) || a.bp1Base - b.bp1Base);

    let cur: MergedRow | null = null;
    for (const c of notable) {
      const mappedEvent = c.chrBase === c.chrQuery ? SYNTENY_MAP[c.dominant] : c.dominant;
      const matchCount = c.eventCounts[mappedEvent] ?? 0;
      if (cur && cur.event === c.dominant && cur.baseChr === c.chrBase && cur.queryChr === c.chrQuery) {
        if (c.bp1Base < cur.bp1Base) cur.bp1Base = c.bp1Base;
        if (c.bp2Base > cur.bp2Base) cur.bp2Base = c.bp2Base;
        if (c.bp1Query < cur.bp1Query) cur.bp1Query = c.bp1Query;
        if (c.bp2Query > cur.bp2Query) cur.bp2Query = c.bp2Query;

        cur.eventCount += matchCount;
        cur.geneBase += c.bpGeneBase;
        cur.geneQuery += c.bpGeneQuery;
        cur.chunkCount += 1;
      } else {
        if (cur) rows.push(formatRow(baseLabel, queryLabel, cur));
        cur = {
          baseChr: c.chrBase,
          queryChr: c.chrQuery,
          event: c.dominant,
          bp1Base: c.bp1Base,
          bp2Base: c.bp2Base,
          bp1Query: c.bp1Query,
          bp2Query: c.bp2Query,
          eventCount: matchCount,
          geneBase: c.bpGeneBase,
          geneQuery: c.bpGeneQuery,
          chunkCount: 1,
        };
      }
    }

    if (cur) rows.push(formatRow(baseLabel, queryLabel, cur));
    baseLabel = queryLabel;
  }

  return rows;
};

export const buildNotableEventsCsv = (pairs: VisibleChunkPair[], baseName: string): string =>
  [CSV_HEADER, ...collectCsvRows(pairs, baseName)].join("\n");

const currentBaseName = (): string => useAppStore.getState().base?.name.split(".")[0] ?? "";

export const downloadNotableEventsCsv = (filename: string): void => {
  const csv = buildNotableEventsCsv(visibleExport.pairs, currentBaseName());
  triggerDownload(new Blob([csv], { type: "text/csv" }), filename);
};

// ─────────────────────────────────────────────────────────────────────────────
// Predicted centromeres (per-line × per-chr Mbp, matching centromere file shape)
// ─────────────────────────────────────────────────────────────────────────────

const PREDICTED_CHRS = [
  "1A",
  "1B",
  "1D",
  "2A",
  "2B",
  "2D",
  "3A",
  "3B",
  "3D",
  "4A",
  "4B",
  "4D",
  "5A",
  "5B",
  "5D",
  "6A",
  "6B",
  "6D",
  "7A",
  "7B",
  "7D",
] as const;

const PREDICTED_HEADER = ["Genome Assembly", ...PREDICTED_CHRS.map((c) => `chr${c}`)].join(",");

export const buildCentromeresCsv = (predicted: PredictedByLine): string => {
  const rows = [PREDICTED_HEADER];
  const lines = Array.from(predicted.keys()).sort();
  for (const line of lines) {
    const chrMap = predicted.get(line);
    if (!chrMap) continue;
    const cells = [line];
    for (const chr of PREDICTED_CHRS) {
      const bp = chrMap.get(chr);
      cells.push(bp !== undefined ? (bp / 1_000_000).toFixed(1) : "");
    }
    rows.push(cells.join(","));
  }
  return rows.join("\n");
};

export const mergePredicted = (acc: PredictedByLine, incoming: PredictedByLine): void => {
  incoming.forEach((chrMap, line) => {
    let into = acc.get(line);
    if (!into) {
      into = new Map();
      acc.set(line, into);
    }
    chrMap.forEach((bp, chr) => into!.set(chr, bp));
  });
};

const waitForRender = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

const blobToBytes = async (blob: Blob): Promise<Uint8Array> => new Uint8Array(await blob.arrayBuffer());

const zipAsync = (files: Record<string, AsyncZippableFile>): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    zip(files, (err, data) => (err ? reject(err) : resolve(data)));
  });

interface ZipWritable {
  write: (data: Uint8Array) => Promise<void>;
  close: () => Promise<void>;
}

interface SaveFilePickerWindow {
  showSaveFilePicker: (opts: {
    suggestedName?: string;
    types?: { description?: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<ZipWritable> }>;
}

export const downloadPredictedCentromeresCsv = (filename = "predicted_centromeres.csv"): void => {
  if (!visibleExport.predicted.size) return;
  const blob = new Blob([buildCentromeresCsv(visibleExport.predicted)], {
    type: "text/csv;charset=utf-8",
  });
  triggerDownload(blob, filename);
};

let currentAbortController: AbortController | null = null;

export const abortBatchExport = (): void => {
  currentAbortController?.abort();
};

export const batchExportAll = async (zipName = "synteny-all.zip"): Promise<void> => {
  const store = useAppStore.getState();
  const { chromosomes, autoSort } = store;
  if (!chromosomes.length || currentAbortController) return;

  const baseName = store.base?.name.split(".")[0] ?? "";

  let writable: ZipWritable;
  try {
    const handle = await (window as unknown as SaveFilePickerWindow).showSaveFilePicker({
      suggestedName: zipName,
      types: [{ description: "ZIP archive", accept: { "application/zip": [".zip"] } }],
    });
    writable = await handle.createWritable();
  } catch {
    return;
  }

  const controller = new AbortController();
  const { signal } = controller;
  currentAbortController = controller;
  useAppStore.setState({ batching: true });

  const snapshot = {
    selectedChr: store.selectedChr,
    queryFiles: store.queryFiles,
    result: store.result,
    commonIds: store.commonIds,
    palette: store.palette,
    error: store.error,
  };

  const files: Record<string, AsyncZippableFile> = {};
  const csvRows: string[] = [CSV_HEADER];
  const predictedAcc: PredictedByLine = new Map();
  try {
    for (const chr of chromosomes) {
      if (signal.aborted) break;
      useAppStore.setState({ selectedChr: chr });
      await autoSort();
      await waitForRender();
      if (signal.aborted) break;
      if (!svgEl) continue;

      const base = chr.toLowerCase();
      files[`${base}.svg`] = [await blobToBytes(serializeSvg(svgEl)), { level: 6 }];

      const png = await svgToPngBlob(svgEl);
      if (png) files[`${base}.png`] = [await blobToBytes(png), { level: 0 }];

      csvRows.push(...collectCsvRows(visibleExport.pairs, baseName));
      mergePredicted(predictedAcc, visibleExport.predicted);
    }
  } finally {
    useAppStore.setState(snapshot);
    useAppStore.setState({ batching: false });
    currentAbortController = null;
  }

  if (!signal.aborted && Object.keys(files).length) {
    files["notable_events.csv"] = [new TextEncoder().encode(csvRows.join("\n")), { level: 6 }];
    if (predictedAcc.size) {
      files["predicted_centromeres.csv"] = [
        new TextEncoder().encode(buildCentromeresCsv(predictedAcc)),
        { level: 6 },
      ];
    }
    const zipped = await zipAsync(files);
    await writable.write(zipped);
  }
  await writable.close();
};
