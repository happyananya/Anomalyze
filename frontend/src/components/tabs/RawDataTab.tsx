import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { fetchRawLogs } from "../../lib/api";
import type { RawLogItem } from "../../types";

type SortKey = keyof Pick<RawLogItem, "ts" | "level" | "component" | "block_id">;
type SortDir = "asc" | "desc";

const LEVEL_BADGE: Record<string, string> = {
  ERROR: "badge badge--red",
  WARN:  "badge badge--amber",
  INFO:  "badge badge--blue",
  DEBUG: "badge badge--gray",
};

function formatTs(iso: string) {
  try { return format(new Date(iso), "yyyy-MM-dd HH:mm:ss"); } catch { return iso; }
}

function exportCSV(items: RawLogItem[]) {
  const header = "Timestamp,Level,Component,Block ID\n";
  const rows = items
    .map((r) => [formatTs(r.ts), r.level, `"${r.component}"`, r.block_id ?? ""].join(","))
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "anomalyze-raw-logs.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface Props { autoRefresh: boolean; }

export default function RawDataTab({ autoRefresh }: Props) {
  const [textFilter, setTextFilter] = useState("");
  const [limit,  setLimit]  = useState(500);
  const [sortKey, setSortKey] = useState<SortKey>("ts");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading } = useQuery({
    queryKey: ["raw-logs", textFilter, limit, 0],
    queryFn: () => fetchRawLogs(textFilter, limit, 0),
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const items = [...(data?.items ?? [])].sort((a, b) => {
    const av = a[sortKey] ?? "";
    const bv = b[sortKey] ?? "";
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  function arrow(key: SortKey) {
    if (sortKey !== key) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <div>
      <div className="raw-controls">
        <div className="raw-search">
          <svg className="raw-search-icon" width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Filter by block ID or component..."
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
        </div>

        <div className="raw-limit">
          <label>Max rows</label>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {[100, 250, 500, 1000, 2500, 5000, 10000].map((n) => (
              <option key={n} value={n}>{n.toLocaleString()}</option>
            ))}
          </select>
        </div>

        {data && (
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {Math.min(limit, data.total).toLocaleString()} of {data.total.toLocaleString()} records
          </span>
        )}

        <button className="export-btn" onClick={() => exportCSV(items)}>
          Export CSV
        </button>
      </div>

      <div className="table-wrapper">
        <div className="table-overflow">
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("ts")}>
                  Timestamp{arrow("ts")}
                </th>
                <th className="sortable" onClick={() => toggleSort("level")}>
                  Level{arrow("level")}
                </th>
                <th className="sortable" onClick={() => toggleSort("component")}>
                  Component{arrow("component")}
                </th>
                <th className="sortable" onClick={() => toggleSort("block_id")}>
                  Block ID{arrow("block_id")}
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">
                      <div className="empty-state__icon">🔍</div>
                      No records found.
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((row, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {formatTs(row.ts)}
                    </td>
                    <td>
                      <span className={LEVEL_BADGE[row.level] ?? "badge badge--gray"}>
                        {row.level}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-secondary)", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      title={row.component}>
                      {row.component}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {row.block_id ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
