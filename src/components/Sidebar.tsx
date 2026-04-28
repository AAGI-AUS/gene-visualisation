import type { ResultRow, BedFile } from "@/types";
import { useAppStore } from "@/src/store/useAppStore";
import { FileSlot } from "@/src/components/FileSlot";
import styles from "./Sidebar.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// FilesPanel
// ─────────────────────────────────────────────────────────────────────────────

interface FilesPanelProps {
  baseFile: BedFile | null;
  queryFile: BedFile | null;
  onLoadBase: (f: BedFile) => void;
  onLoadQuery: (f: BedFile) => void;
  onClearBase: () => void;
  onClearQuery: () => void;
}

function FilesPanel({
  baseFile,
  queryFile,
  onLoadBase,
  onLoadQuery,
  onClearBase,
  onClearQuery,
}: FilesPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>Input Files</div>
      <div className={styles.panelBody}>
        <FileSlot label="Baseline" file={baseFile} onLoad={onLoadBase} onClear={onClearBase} />
        <FileSlot label="Query" file={queryFile} onLoad={onLoadQuery} onClear={onClearQuery} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChrSelect — derives chromosome list from baseFile rows
// ─────────────────────────────────────────────────────────────────────────────

interface ChrSelectProps {
  selectedChr: string;
  onChangeChr: (chr: string) => void;
}

function ChrSelect({ selectedChr, onChangeChr }: ChrSelectProps) {
  // Unique chromosomes in order of first appearance
  const chromosomes = useAppStore((s) => s.chromosomes);
  const disabled = chromosomes.length === 0;

  return (
    <div className={styles.thresholdRow}>
      <label className={styles.thresholdLabel}>Base chromosome</label>
      <select
        className={styles.chrSelect}
        value={selectedChr}
        disabled={disabled}
        onChange={(e) => onChangeChr(e.target.value)}
      >
        {chromosomes.map((chr) => (
          <option key={chr} value={chr}>
            {chr}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ParametersPanel
// ─────────────────────────────────────────────────────────────────────────────

interface ParametersPanelProps {
  baseFile: BedFile | null;
  selectedChr: string;
  offLocThreshold: number;
  groupThreshold: number;
  canRun: boolean;
  onChangeChr: (chr: string) => void;
  onChangeOffLoc: (v: number) => void;
  onChangeGroup: (v: number) => void;
  onRun: () => void;
}

function ParametersPanel({
  baseFile,
  selectedChr,
  offLocThreshold,
  groupThreshold,
  canRun,
  onChangeChr,
  onChangeOffLoc,
  onChangeGroup,
  onRun,
}: ParametersPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>Parameters</div>
      <div className={styles.panelBody}>
        <ChrSelect selectedChr={selectedChr} onChangeChr={onChangeChr} />

        <div className={styles.thresholdRow}>
          <label className={styles.thresholdLabel}>Off location threshold</label>
          <input
            className={styles.thresholdInput}
            type="number"
            step="0.001"
            min="0"
            max="1"
            value={offLocThreshold}
            onChange={(e) => onChangeOffLoc(parseFloat(e.target.value))}
          />
        </div>

        <div className={styles.thresholdRow}>
          <label className={styles.thresholdLabel}>Group threshold</label>
          <input
            className={styles.thresholdInput}
            type="number"
            step="0.001"
            min="0"
            max="1"
            value={groupThreshold}
            onChange={(e) => onChangeGroup(parseFloat(e.target.value))}
          />
        </div>

        <button className={styles.runBtn} disabled={!canRun} onClick={onRun} type="button">
          ▶ RUN
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatGrid
// ─────────────────────────────────────────────────────────────────────────────

interface StatGridProps {
  result: ResultRow[];
}

function StatGrid({ result }: StatGridProps) {
  const total = result.length;
  const synteny = result.filter((r) => r.mainEvent === "synteny").length;
  const inversion = result.filter((r) => r.mainEvent === "inversion").length;
  const translocation = result.filter((r) => r.mainEvent === "translocation").length;

  const stats: Array<{ label: string; value: number; cls: string }> = [
    { label: "Total", value: total, cls: "" },
    { label: "Synteny", value: synteny, cls: "blue" },
    { label: "Inversion", value: inversion, cls: "amber" },
    { label: "Translocate", value: translocation, cls: "red" },
  ];

  return (
    <div className={styles.statGrid}>
      {stats.map(({ label, value, cls }) => (
        <div className={styles.statCard} key={label}>
          <div className={`${styles.statVal} ${cls ? styles[cls as keyof typeof styles] : ""}`}>
            {value.toLocaleString()}
          </div>
          <div className={styles.statLabel}>{label}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SummaryPanel
// ─────────────────────────────────────────────────────────────────────────────

interface SummaryPanelProps {
  result: ResultRow[];
}

function SummaryPanel({ result }: SummaryPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>Summary</div>
      <div className={styles.panelBody}>
        <StatGrid result={result} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar (root)
// ─────────────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const baseFile = useAppStore((s) => s.baseFile);
  const queryFile = useAppStore((s) => s.queryFile);
  const offLocThreshold = useAppStore((s) => s.offLocThreshold);
  const groupThreshold = useAppStore((s) => s.groupThreshold);
  const selectedChr = useAppStore((s) => s.selectedChr);
  const result = useAppStore((s) => s.result);
  const setBaseFile = useAppStore((s) => s.setBaseFile);
  const setQueryFile = useAppStore((s) => s.setQueryFile);
  const setAppState = useAppStore((s) => s.setAppState);
  const clearBase = useAppStore((s) => s.clearBase);
  const clearQuery = useAppStore((s) => s.clearQuery);
  const runAnalysis = useAppStore((s) => s.runAnalysis);

  const canRun = Boolean(baseFile && queryFile);

  return (
    <aside className={styles.sidebar}>
      <FilesPanel
        baseFile={baseFile}
        queryFile={queryFile}
        onLoadBase={setBaseFile}
        onLoadQuery={setQueryFile}
        onClearBase={clearBase}
        onClearQuery={clearQuery}
      />

      <ParametersPanel
        baseFile={baseFile}
        selectedChr={selectedChr ?? ""}
        offLocThreshold={offLocThreshold}
        groupThreshold={groupThreshold}
        canRun={canRun}
        onChangeChr={(chr) => setAppState({ selectedChr: chr })}
        onChangeOffLoc={(v) => setAppState({ offLocThreshold: v })}
        onChangeGroup={(v) => setAppState({ groupThreshold: v })}
        onRun={runAnalysis}
      />

      {result && <SummaryPanel result={result} />}
    </aside>
  );
}
