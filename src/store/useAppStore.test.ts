import { useAppStore } from "@/src/store/useAppStore";
import * as storeUtils from "@/src/store/utils";
import { clearWorkerCaches } from "@/src/store/workerPool";
import { makeBedFile as bed } from "@/src/test/factories";
import type { BedRow } from "@/types";

const initialState = useAppStore.getState();
const reset = () => useAppStore.setState(initialState, true);
const get = useAppStore.getState;

afterEach(reset);
afterEach(clearWorkerCaches);
afterEach(() => jest.restoreAllMocks());

const fileList = (...files: File[]): FileList => files as unknown as FileList;

const baseRows: BedRow[] = [
  { id: 0, chromosome: "1A", p1: 0, p2: 100, sign: "+" },
  { id: 1, chromosome: "1A", p1: 100, p2: 200, sign: "+" },
  { id: 2, chromosome: "1A", p1: 200, p2: 300, sign: "+" },
  { id: 3, chromosome: "1A", p1: 300, p2: 400, sign: "+" },
];

// Full synteny
const syntenyFile = bed("q1.bed", [
  ["1A", 0, 100, "+", 0],
  ["1A", 100, 200, "+", 1],
  ["1A", 200, 300, "+", 2],
  ["1A", 300, 400, "+", 3],
]);

// Low synteny: ids 0/1 translocate to 2B, id 2 inverts, only id 3 stays synteny.
const lowSyntenyFile = bed("q2.bed", [
  ["2B", 0, 100, "+", 0],
  ["2B", 100, 200, "+", 1],
  ["1A", 200, 300, "-", 2],
  ["1A", 300, 400, "+", 3],
]);

const namesOf = (files: File[]) => files.map((f) => f.name);

describe("setBase", () => {
  it("parses the file, sorts chromosomes, and selects the first", async () => {
    const rows = [
      ["2B", 0, 100, "+", 0],
      ["1A", 100, 200, "+", 1],
    ];
    await get().setBase(fileList(bed("base.bed", rows)));

    expect(get().base?.name).toBe("base.bed");
    expect(get().base?.rows).toHaveLength(2);
    expect(get().chromosomes).toEqual(["1A", "2B"]);
    expect(get().selectedChr).toBe("1A");
  });

  it("clears the base when no file is supplied", async () => {
    useAppStore.setState({ base: { name: "x", rows: baseRows }, baseFile: syntenyFile });
    await get().setBase(fileList());
    expect(get().base).toBeNull();
    expect(get().baseFile).toBeNull();
  });
});

describe("query file mutations", () => {
  it("appends with setQueryFiles", () => {
    get().setQueryFiles(fileList(syntenyFile));
    expect(namesOf(get().queryFiles)).toEqual(["q1.bed"]);

    get().setQueryFiles(fileList(lowSyntenyFile));
    expect(namesOf(get().queryFiles)).toEqual(["q1.bed", "q2.bed"]);
  });

  it("removes the file at the given index with clearQuery", () => {
    useAppStore.setState({ queryFiles: [syntenyFile, lowSyntenyFile] });
    get().clearQuery(0);
    expect(namesOf(get().queryFiles)).toEqual(["q2.bed"]);
  });

  it("moves a file with reorderQuery and no-ops when from === to", () => {
    const a = bed("a", []);
    const b = bed("b", []);
    const c = bed("c", []);
    useAppStore.setState({ queryFiles: [a, b, c] });

    get().reorderQuery(0, 2);
    expect(namesOf(get().queryFiles)).toEqual(["b", "c", "a"]);

    const before = get().queryFiles;
    get().reorderQuery(1, 1);
    expect(get().queryFiles).toBe(before);
  });
});

describe("swapBaseWithQuery", () => {
  it("promotes a query file to base and demotes the old base file into its slot", async () => {
    const oldBase = bed("base.bed", [["1A", 0, 100, "+", 0]]);
    useAppStore.setState({
      base: { name: "base.bed", rows: baseRows },
      baseFile: oldBase,
      queryFiles: [syntenyFile, lowSyntenyFile],
    });

    await get().swapBaseWithQuery(0);
    expect(get().baseFile?.name).toBe("q1.bed");
    expect(get().base?.name).toBe("q1.bed");
    expect(namesOf(get().queryFiles)).toEqual(["base.bed", "q2.bed"]);
    expect(get().selectedChr).toBe("1A");

    await get().swapBaseWithQuery(1);
    expect(get().baseFile?.name).toBe("q2.bed");
    expect(get().base?.name).toBe("q2.bed");
    expect(namesOf(get().queryFiles)).toEqual(["base.bed", "q1.bed"]);
    expect(get().selectedChr).toBe("1A");
    expect(get().chromosomes).toEqual(["1A", "2B"]);
  });

  it("removes the promoted query from the list when there is no base to demote", async () => {
    useAppStore.setState({ base: null, baseFile: null, queryFiles: [syntenyFile, lowSyntenyFile] });

    await get().swapBaseWithQuery(0);

    expect(get().baseFile?.name).toBe("q1.bed");
    expect(get().base?.name).toBe("q1.bed");
    expect(namesOf(get().queryFiles)).toEqual(["q2.bed"]);
  });
});

describe("setCentromere / clearCentromere", () => {
  it("parses the centromere CSV into the line/chr -> bp map", async () => {
    const file = new File(["Genome Assembly,chr1A\nArinaLrFor,300"], "centro.csv", { type: "text/csv" });
    await get().setCentromere(fileList(file));

    expect(get().centromereName).toBe("centro.csv");
    expect(get().centromere.get("arina")?.get("1A")).toEqual([300_000_000]);
  });

  it("clears the map when no file is supplied", async () => {
    useAppStore.setState({ centromereName: "x", centromere: new Map([["arina", new Map()]]) });
    await get().setCentromere(fileList());

    expect(get().centromereName).toBeNull();
    expect(get().centromere.size).toBe(0);
  });

  it("clearCentromere resets the name and map", () => {
    useAppStore.setState({ centromereName: "x", centromere: new Map([["arina", new Map()]]) });
    get().clearCentromere();

    expect(get().centromereName).toBeNull();
    expect(get().centromere.size).toBe(0);
  });
});

describe("runAnalysis", () => {
  it("joins each query against the previous one and preserves query order", async () => {
    useAppStore.setState({
      base: { name: "base.bed", rows: baseRows },
      selectedChr: "1A",
      groupThreshold: 0.01,
      queryFiles: [lowSyntenyFile, syntenyFile],
    });

    await get().runAnalysis();

    const { result } = get();
    expect(result.map((r) => r.name)).toEqual(["q2.bed", "q1.bed"]);
    // First pair joins base vs q2: id0/id1 translocate, id2 inverts, id3 synteny.
    expect(result[0].rows.map((r) => r.mainEvent)).toEqual([
      "translocation",
      "translocation",
      "inversion",
      "synteny",
    ]);
    expect(get().palette["1A"]).toBeDefined();
    expect(get().error).toBeNull();
    expect(get().running).toBe(false);
  });

  it("does nothing when there is no base", async () => {
    useAppStore.setState({ base: null, selectedChr: "1A", queryFiles: [syntenyFile] });
    await get().runAnalysis();
    expect(get().result).toEqual([]);
    expect(get().running).toBe(false);
  });

  it("captures the error message and clears running when assembly throws", async () => {
    jest.spyOn(storeUtils, "buildPalette").mockImplementation(() => {
      throw new Error("boom");
    });
    useAppStore.setState({
      base: { name: "base.bed", rows: baseRows },
      selectedChr: "1A",
      groupThreshold: 0.01,
      queryFiles: [syntenyFile],
    });

    await get().runAnalysis();

    expect(get().error).toBe("boom");
    expect(get().result).toEqual([]);
    expect(get().running).toBe(false);
  });
});

describe("autoSort", () => {
  it("orders queries greedily by synteny against the running reference", async () => {
    useAppStore.setState({
      base: { name: "base.bed", rows: baseRows },
      selectedChr: "1A",
      groupThreshold: 0.01,
      queryFiles: [lowSyntenyFile, syntenyFile], // worst-first; autoSort should flip them
    });

    await get().autoSort();

    expect(namesOf(get().queryFiles)).toEqual(["q1.bed", "q2.bed"]);
    expect(get().result.map((r) => r.name)).toEqual(["q1.bed", "q2.bed"]);
    expect(get().running).toBe(false);
  });
});
