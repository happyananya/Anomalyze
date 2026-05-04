import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  fetchAnomalyMetrics,
  fetchAnomalyRecords,
  fetchAnomalyTimeline,
  fetchSpikes,
} from "../../lib/api";
import type { FiltersState } from "../../types";
import MetricCard from "../MetricCard";

function formatTime(iso: string) {
  try {
    return format(new Date(iso), "MM/dd HH:mm");
  } catch {
    return iso;
  }
}

function ConfusionMatrix({
  matrix,
}: {
  matrix: [[number, number], [number, number]];
}) {
  const [[tp, fn], [fp, tn]] = matrix;
  const max = Math.max(tp, fn, fp, tn, 1);

  function cellBg(v: number) {
    const intensity = Math.round((v / max) * 200);
    return `rgb(${30 + intensity}, ${50 + intensity}, ${100 + intensity})`;
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-300 mb-3">Confusion Matrix</h4>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-2 text-muted text-left"></th>
            <th className="p-2 text-center text-muted">Actual: Anomaly</th>
            <th className="p-2 text-center text-muted">Actual: Normal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="p-2 text-muted text-xs whitespace-nowrap">Predicted: Anomaly</td>
            <td
              className="p-3 text-center font-bold text-green-accent rounded"
              style={{ background: cellBg(tp) }}
            >
              {tp.toLocaleString()}
              <div className="text-xs font-normal text-muted">TP</div>
            </td>
            <td
              className="p-3 text-center font-bold rounded"
              style={{ background: cellBg(fn) }}
            >
              {fn.toLocaleString()}
              <div className="text-xs font-normal text-muted">FN</div>
            </td>
          </tr>
          <tr>
            <td className="p-2 text-muted text-xs whitespace-nowrap">Predicted: Normal</td>
            <td
              className="p-3 text-center font-bold text-red-accent rounded"
              style={{ background: cellBg(fp) }}
            >
              {fp.toLocaleString()}
              <div className="text-xs font-normal text-muted">FP</div>
            </td>
            <td
              className="p-3 text-center font-bold rounded"
              style={{ background: cellBg(tn) }}
            >
              {tn.toLocaleString()}
              <div className="text-xs font-normal text-muted">TN</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  filters: FiltersState;
}

export default function AnomaliesTab({ filters }: Props) {
  const { data: metrics, isLoading: mLoading } = useQuery({
    queryKey: ["anomaly-metrics", filters],
    queryFn: () => fetchAnomalyMetrics(filters),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  const { data: timeline, isLoading: tLoading } = useQuery({
    queryKey: ["anomaly-timeline", filters],
    queryFn: () => fetchAnomalyTimeline(filters),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  const { data: spikes } = useQuery({
    queryKey: ["spikes"],
    queryFn: fetchSpikes,
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  const { data: records, isLoading: rLoading } = useQuery({
    queryKey: ["anomaly-records", filters],
    queryFn: () => fetchAnomalyRecords(filters, 500, 0),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  if (mLoading) return <div className="text-muted p-4">Loading…</div>;

  if (!metrics?.has_data) {
    return (
      <div className="card text-muted text-sm">
        No anomalies for the selected filters. Run{" "}
        <code className="text-blue-accent">python -m detector.anomaly_detector</code> first.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* IF performance metrics */}
      {metrics.has_labels && (
        <>
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-3">
              Isolation Forest — Model Performance
            </h3>
            <div
              className={`grid gap-4 ${metrics.has_full_metrics ? "grid-cols-6" : "grid-cols-4"}`}
            >
              <MetricCard label="Detected" value={metrics.detected ?? 0} accent="blue" />
              <MetricCard
                label="True Positives"
                value={metrics.tp ?? 0}
                accent="green"
                help="Flagged AND actually anomalous (Fail)"
              />
              <MetricCard
                label="False Positives"
                value={metrics.fp ?? 0}
                accent="red"
                help="Flagged but actually normal (Success)"
              />
              {metrics.has_full_metrics && (
                <MetricCard
                  label="False Negatives"
                  value={metrics.fn ?? 0}
                  accent="amber"
                  help="Actual anomalies the model missed"
                />
              )}
              <MetricCard
                label="Precision"
                value={`${((metrics.precision ?? 0) * 100).toFixed(1)}%`}
                accent="blue"
                help="Of all flagged blocks, how many were real anomalies?"
              />
              {metrics.has_full_metrics && (
                <MetricCard
                  label="Recall"
                  value={`${((metrics.recall ?? 0) * 100).toFixed(1)}%`}
                  accent="green"
                  help={`F1: ${metrics.f1?.toFixed(3)}`}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Donut: TP vs FP */}
            <div className="card">
              <h4 className="text-sm font-semibold text-gray-300 mb-3">
                Detection quality: True vs False Positives
              </h4>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={[
                      { name: "True Positive", value: metrics.tp ?? 0 },
                      { name: "False Positive", value: metrics.fp ?? 0 },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(1)}%`
                    }
                    labelLine
                  >
                    <Cell fill="#34d399" />
                    <Cell fill="#f87171" />
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "#1e1e2e",
                      border: "1px solid #313244",
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Confusion matrix or precision bar */}
            <div className="card flex items-center justify-center">
              {metrics.has_full_metrics && metrics.confusion_matrix ? (
                <ConfusionMatrix matrix={metrics.confusion_matrix} />
              ) : (
                <div className="w-full">
                  <h4 className="text-sm font-semibold text-gray-300 mb-3">Precision</h4>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={[{ name: "Precision", value: (metrics.precision ?? 0) * 100 }]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#313244" />
                      <YAxis domain={[0, 110]} stroke="#6c7086" tick={{ fontSize: 11 }} />
                      <XAxis dataKey="name" stroke="#6c7086" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{
                          background: "#1e1e2e",
                          border: "1px solid #313244",
                          borderRadius: 8,
                        }}
                        formatter={(v: number) => [`${v.toFixed(1)}%`, "Precision"]}
                      />
                      <Bar dataKey="value" fill="#60a5fa" radius={[4, 4, 0, 0]}>
                        <Cell fill="#60a5fa" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* No labels: method breakdown */}
      {!metrics.has_labels && metrics.method_counts && (
        <div className="grid grid-cols-2 gap-6">
          <div className="card">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">
              Anomalies by detection method
            </h4>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={Object.entries(metrics.method_counts).map(([name, value]) => ({
                    name,
                    value,
                  }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
                >
                  <Cell fill="#60a5fa" />
                  <Cell fill="#f87171" />
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2e",
                    border: "1px solid #313244",
                    borderRadius: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="card">
            <h4 className="text-sm font-semibold text-gray-300 mb-3">
              Anomaly count by method
            </h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={Object.entries(metrics.method_counts).map(([name, value]) => ({
                  name,
                  value,
                }))}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#313244" />
                <XAxis dataKey="name" stroke="#6c7086" tick={{ fontSize: 11 }} />
                <YAxis stroke="#6c7086" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "#1e1e2e",
                    border: "1px solid #313244",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="value" fill="#60a5fa" radius={[4, 4, 0, 0]} label={{ position: "top", fill: "#9ca3af", fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Detection timeline */}
      {!tLoading && timeline && timeline.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">
            Detections over time — True Positive vs False Positive
          </h4>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#313244" />
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                stroke="#6c7086"
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke="#6c7086" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#1e1e2e",
                  border: "1px solid #313244",
                  borderRadius: 8,
                }}
                labelFormatter={formatTime}
              />
              <Legend />
              <Bar dataKey="True Positive" stackId="a" fill="#34d399" />
              <Bar dataKey="False Positive" stackId="a" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Statistical threshold spikes */}
      {spikes && spikes.length > 0 && (
        <div className="card">
          <h4 className="text-sm font-semibold text-gray-300 mb-3">
            Statistical threshold — error spike timeline
          </h4>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#313244" />
              <XAxis
                dataKey="time"
                type="category"
                tickFormatter={formatTime}
                stroke="#6c7086"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                dataKey="error_count"
                stroke="#6c7086"
                tick={{ fontSize: 11 }}
                name="Error count"
              />
              <ZAxis dataKey="error_count" range={[20, 400]} />
              <Tooltip
                contentStyle={{
                  background: "#1e1e2e",
                  border: "1px solid #313244",
                  borderRadius: 8,
                }}
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(v: number) => [v.toLocaleString(), "Error count"]}
                labelFormatter={formatTime}
              />
              <Scatter
                data={spikes}
                fill="#fbbf24"
                opacity={0.8}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Anomaly records table */}
      <div className="card">
        <h4 className="text-sm font-semibold text-gray-300 mb-3">
          Anomaly records
          {records && <span className="text-muted font-normal ml-2">({records.total.toLocaleString()} total)</span>}
        </h4>
        {rLoading ? (
          <div className="text-muted text-sm">Loading…</div>
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-muted border-b border-overlay">
                  <th className="text-left py-2 pr-4">Method</th>
                  <th className="text-left py-2 pr-4">Block ID</th>
                  <th className="text-left py-2 pr-4">Label</th>
                  <th className="text-left py-2 pr-4">Result</th>
                  <th className="text-left py-2 pr-4">Minute</th>
                  <th className="text-left py-2 pr-4">Errors</th>
                  <th className="text-left py-2">Detected at</th>
                </tr>
              </thead>
              <tbody>
                {records?.items.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-overlay/40 hover:bg-overlay/30 transition-colors"
                  >
                    <td className="py-1.5 pr-4 text-blue-accent">{row.method}</td>
                    <td className="py-1.5 pr-4 font-mono text-gray-400 max-w-32 truncate">
                      {row.block_id ?? "—"}
                    </td>
                    <td className="py-1.5 pr-4">{row.true_label ?? "—"}</td>
                    <td
                      className={`py-1.5 pr-4 font-medium ${
                        row.correct === "True Positive"
                          ? "text-green-accent"
                          : row.correct === "False Positive"
                          ? "text-red-accent"
                          : ""
                      }`}
                    >
                      {row.correct ?? "—"}
                    </td>
                    <td className="py-1.5 pr-4 text-gray-400">{row.minute ?? "—"}</td>
                    <td className="py-1.5 pr-4">{row.error_count ?? "—"}</td>
                    <td className="py-1.5 text-muted">{row.detected_at ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
