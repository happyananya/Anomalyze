import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Bar } from "react-chartjs-2";
import { format } from "date-fns";
import { fetchAnomalyTimeline, fetchAnomalyRecords } from "../../lib/api";
import type { FiltersState, AnomalyRecord } from "../../types";
import FilterChips from "../FilterChips";

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatTime(iso: string) {
  try { return format(new Date(iso), "MM/dd HH:mm"); } catch { return iso; }
}

function LabelBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const cls = value === "Fail" ? "badge badge--red" : value === "Success" ? "badge badge--green" : "badge badge--gray";
  return <span className={cls}>{value}</span>;
}

function ResultBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span style={{ color: "var(--text-muted)" }}>—</span>;
  const cls = value === "True Positive" ? "badge badge--green" : value === "False Positive" ? "badge badge--red" : "badge badge--gray";
  return <span className={cls}>{value}</span>;
}

function rowClass(row: AnomalyRecord): string {
  if (row.correct === "True Positive")  return "data-table__row--tp";
  if (row.correct === "False Positive") return "data-table__row--fp";
  return "";
}

const CHIP_OPTIONS = [
  { label: "All",            value: "all" },
  { label: "True positive",  value: "tp"  },
  { label: "False positive", value: "fp"  },
];

const PAGE_SIZE = 50;

interface Props { filters: FiltersState; }

export default function AnomaliesTab({ filters }: Props) {
  const [chip, setChip]               = useState("all");
  const [selectedWindow, setWindow]   = useState<string | null>(null);
  const [page, setPage]               = useState(0);

  const { data: timeline } = useQuery({
    queryKey: ["anomaly-timeline", filters],
    queryFn: () => fetchAnomalyTimeline(filters),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  const { data: records, isLoading: rLoading } = useQuery({
    queryKey: ["anomaly-records", filters, page],
    queryFn: () => fetchAnomalyRecords(filters, PAGE_SIZE, page * PAGE_SIZE),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  // Chart.js data
  const chartLabels = (timeline ?? []).map((p) => formatTime(p.time));
  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: "True Positive",
        data: (timeline ?? []).map((p) => p["True Positive"] ?? 0),
        backgroundColor: cssVar("--green-mid"),
        stack: "detections",
        borderWidth: 0,
        borderRadius: 2,
      },
      {
        label: "False Positive",
        data: (timeline ?? []).map((p) => p["False Positive"] ?? 0),
        backgroundColor: cssVar("--red-mid"),
        stack: "detections",
        borderWidth: 0,
        borderRadius: 2,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: "index" as const, intersect: false },
    },
    scales: {
      x: { grid: { display: false }, stacked: true },
      y: { grid: { color: cssVar("--border-subtle") }, stacked: true },
    },
    onClick: (_: unknown, elements: { index: number }[]) => {
      if (!elements.length) { setWindow(null); return; }
      const idx = elements[0].index;
      const time = timeline?.[idx]?.time ?? null;
      setWindow((prev) => (prev === time ? null : time));
    },
  };

  // Client-side filter for chip
  const rawItems = records?.items ?? [];
  const filtered = rawItems.filter((row) => {
    if (chip === "tp") return row.correct === "True Positive";
    if (chip === "fp") return row.correct === "False Positive";
    return true;
  });

  const totalPages = Math.ceil((records?.total ?? 0) / PAGE_SIZE);

  return (
    <div>
      {/* Detections chart */}
      <div className="chart-card">
        <div className="chart-card__header">
          <span className="chart-card__title">Detections over time</span>
          <div className="chart-card__legend">
            <div className="chart-card__legend-item">
              <span className="chart-card__legend-swatch chart-card__legend-swatch--green" />
              True positive
            </div>
            <div className="chart-card__legend-item">
              <span className="chart-card__legend-swatch chart-card__legend-swatch--red" />
              False positive
            </div>
          </div>
        </div>
        <div style={{ height: 240 }}>
          {timeline && timeline.length > 0 ? (
            <Bar data={chartData} options={chartOptions} />
          ) : (
            <div className="empty-state">
              <div className="empty-state__icon">📉</div>
              No timeline data for the selected filters.
            </div>
          )}
        </div>
        {selectedWindow && (
          <div className="chart-card__hint">
            Filtered to window: <strong>{formatTime(selectedWindow)}</strong> — click again to clear
          </div>
        )}
        {!selectedWindow && (
          <div className="chart-card__hint">
            Click a bar to filter records by time window
          </div>
        )}
      </div>

      {/* Records table */}
      <div className="table-header-row">
        <div>
          <span className="table-header-row__title">Anomaly records</span>
          {records && (
            <span className="count-badge">{records.total.toLocaleString()}</span>
          )}
        </div>
        <FilterChips options={CHIP_OPTIONS} value={chip} onChange={(v) => { setChip(v); setPage(0); }} />
      </div>

      <div className="table-wrapper">
        <div className="table-overflow">
          <table className="data-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Block ID</th>
                <th>Label</th>
                <th>Result</th>
                <th>Minute</th>
                <th>Errors</th>
                <th>Detected at</th>
              </tr>
            </thead>
            <tbody>
              {rLoading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <div className="empty-state__icon">🔍</div>
                      No records match the selected filters.
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => (
                  <tr key={i} className={rowClass(row)}>
                    <td>
                      <span className="badge badge--blue badge--mono">
                        {row.method.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="mono" style={{ color: "var(--text-secondary)", fontSize: 11 }}>
                      {row.block_id ?? "—"}
                    </td>
                    <td><LabelBadge value={row.true_label} /></td>
                    <td><ResultBadge value={row.correct} /></td>
                    <td style={{ color: "var(--text-muted)" }}>{row.minute ?? "—"}</td>
                    <td style={{ color: "var(--text-muted)" }}>{row.error_count ?? "—"}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{row.detected_at ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!rLoading && (records?.total ?? 0) > PAGE_SIZE && (
          <div className="pagination">
            <button
              className="pagination__btn"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Previous
            </button>
            <span>Page {page + 1} of {totalPages}</span>
            <button
              className="pagination__btn"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
