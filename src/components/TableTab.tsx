import { useState, useMemo } from "react";
import type { ResultRow, MainEvent } from "@/types";
import styles from "./TableTab.module.css";

const PAGESIZE = 50;

type SortDir = "asc" | "desc";
type SortKey = keyof ResultRow;

interface SortThProps {
  col: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (col: SortKey) => void;
  children: React.ReactNode;
}

function SortTh({ col, current, dir, onSort, children }: SortThProps) {
  const active = current === col;
  return (
    <th className={active ? styles.thSorted : ""} onClick={() => onSort(col)}>
      {children}
      <span className={styles.sortArrow}>
        {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </th>
  );
}

const EVENTFILTEROPTIONS: Array<{ value: MainEvent | "all"; label: string }> = [
  { value: "all", label: "All events" },
  { value: "synteny", label: "Synteny" },
  { value: "inversion", label: "Inversion" },
  { value: "translocation", label: "Translocation" },
];

interface TableTabProps {
  data: ResultRow[];
}

export function TableTab({ data }: TableTabProps) {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<MainEvent | "all">("all");
  const [sortCol, setSortCol] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    let rows = data;
    if (eventFilter !== "all") {
      rows = rows.filter((r) => r.mainEvent === eventFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          String(r.id).includes(q) ||
          r.chromosomeBase.toLowerCase().includes(q) ||
          (r.chromosomeQuery ?? "").toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[sortCol] ?? "";
      const bv = b[sortCol] ?? "";
      const cmp =
        typeof av === "string"
          ? av.localeCompare(bv as string)
          : (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, search, eventFilter, sortCol, sortDir]);

  const pageCount = Math.ceil(filtered.length / PAGESIZE);
  const pageData = filtered.slice(page * PAGESIZE, (page + 1) * PAGESIZE);

  function handleSort(col: SortKey) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(col);
      setSortDir("asc");
    }
    setPage(0);
  }

  function badgeClass(event: MainEvent): string {
    if (event === "synteny") return styles.badgeSynteny;
    if (event === "inversion") return styles.badgeInversion;
    return styles.badgeTranslocation;
  }

  const sortProps = { current: sortCol, dir: sortDir, onSort: handleSort };

  return (
    <div>
      <div className={styles.filterBar}>
        <input
          className={styles.filterInput}
          placeholder="search id / chromosome…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <select
          className={styles.filterSelect}
          value={eventFilter}
          onChange={(e) => {
            setEventFilter(e.target.value as MainEvent | "all");
            setPage(0);
          }}
        >
          {EVENTFILTEROPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className={styles.rowCount}>
          {filtered.length.toLocaleString()} rows
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <SortTh col="id" {...sortProps}>
                ID
              </SortTh>
              <SortTh col="chromosomeBase" {...sortProps}>
                Chr Base
              </SortTh>
              <SortTh col="p1Base" {...sortProps}>
                P1 Base
              </SortTh>
              <SortTh col="p2Base" {...sortProps}>
                P2 Base
              </SortTh>
              <SortTh col="chromosomeQuery" {...sortProps}>
                Chr Query
              </SortTh>
              <SortTh col="p1Query" {...sortProps}>
                P1 Query
              </SortTh>
              <SortTh col="p2Query" {...sortProps}>
                P2 Query
              </SortTh>
              <SortTh col="sign" {...sortProps}>
                Sign
              </SortTh>
              <SortTh col="mainEvent" {...sortProps}>
                Event
              </SortTh>
              <SortTh col="groupedQuery" {...sortProps}>
                Group
              </SortTh>
            </tr>
          </thead>
          <tbody>
            {pageData.map((r) => (
              <tr key={r.id}>
                <td style={{ color: "var(--text-dim)" }}>{r.id}</td>
                <td>
                  <span className={styles.chrPill}>{r.chromosomeBase}</span>
                </td>
                <td>{r.p1Base.toLocaleString()}</td>
                <td>{r.p2Base.toLocaleString()}</td>
                <td>
                  {r.chromosomeQuery ? (
                    <span className={styles.chrPill}>{r.chromosomeQuery}</span>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </td>
                <td>{r.p1Query != null ? r.p1Query.toLocaleString() : "—"}</td>
                <td>{r.p2Query != null ? r.p2Query.toLocaleString() : "—"}</td>
                <td
                  style={{
                    color: r.sign === "-" ? "var(--amber)" : "var(--text-dim)",
                  }}
                >
                  {r.sign}
                </td>
                <td>
                  <span
                    className={`${styles.badge} ${badgeClass(r.mainEvent)}`}
                  >
                    {r.mainEvent}
                  </span>
                </td>
                <td style={{ color: "var(--text-dim)", fontSize: 11 }}>
                  {r.groupedQuery}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className={styles.pagination}>
          <button
            className={styles.pageBtn}
            disabled={page === 0}
            onClick={() => setPage(0)}
            type="button"
          >
            «
          </button>
          <button
            className={styles.pageBtn}
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            type="button"
          >
            ‹
          </button>
          <span className={styles.pageInfo}>
            page {page + 1} / {pageCount}
          </span>
          <button
            className={styles.pageBtn}
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
            type="button"
          >
            ›
          </button>
          <button
            className={styles.pageBtn}
            disabled={page >= pageCount - 1}
            onClick={() => setPage(pageCount - 1)}
            type="button"
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}
