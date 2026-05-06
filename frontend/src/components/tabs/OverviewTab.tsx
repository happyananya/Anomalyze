import { useQuery } from "@tanstack/react-query";
import { fetchAnomalyMetrics } from "../../lib/api";
import type { FiltersState } from "../../types";
import KPICard from "../KPICard";
import PerformanceChart from "../PerformanceChart";
import ConfusionMatrix from "../ConfusionMatrix";
import StatusBanner from "../StatusBanner";
import { useCountUp } from "../../hooks/useCountUp";

function StatCell({ label, value, sub }: { label: string; value: number; sub?: string }) {
  const animated = useCountUp(value, 800);
  return (
    <div className="stat-cell">
      <div className="stat-cell__label">{label}</div>
      <div className="stat-cell__value">{animated.toLocaleString()}</div>
      {sub && <div className="stat-cell__sub">{sub}</div>}
    </div>
  );
}

interface Props { filters: FiltersState; }

export default function OverviewTab({ filters }: Props) {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ["anomaly-metrics", filters],
    queryFn: () => fetchAnomalyMetrics(filters),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  if (isLoading) {
    return (
      <div>
        <div className="kpi-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ height: 100, background: "var(--bg-muted)", borderRadius: "var(--radius-lg)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!metrics?.has_data) {
    return (
      <div>
        <div className="empty-state">
          <div className="empty-state__icon">📊</div>
          <div>No anomaly data loaded.</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Run <code style={{ fontFamily: "monospace", background: "var(--bg-muted)", padding: "1px 6px", borderRadius: 4 }}>python -m detector.anomaly_detector</code> to populate results.
          </div>
        </div>
      </div>
    );
  }

  const precision = metrics.precision ?? 0;
  const recall    = metrics.recall    ?? 0;
  const f1        = metrics.f1        ?? 0;
  const detected  = metrics.detected  ?? 0;
  const tp        = metrics.tp        ?? 0;
  const fp        = metrics.fp        ?? 0;
  const fn        = metrics.fn        ?? 0;
  const tn        = metrics.tn        ?? 0;

  const pct = (n: number, d: number) =>
    d > 0 ? ` (${((n / d) * 100).toFixed(1)}%)` : "";

  return (
    <div>
      <StatusBanner metrics={metrics} autoRefresh={filters.autoRefresh} />

      {/* KPI cards */}
      <div className="kpi-grid">
        <KPICard
          label="Anomalies detected"
          rawValue={detected}
          accent="amber"
          subtitle={`${tp.toLocaleString()} true positives`}
        />
        <KPICard
          label="Precision"
          rawValue={Math.round(precision * 100)}
          displayValue={`${(precision * 100).toFixed(1)}%`}
          accent="green"
          subtitle={`${tp.toLocaleString()} true positives`}
        />
        <KPICard
          label="Recall"
          rawValue={Math.round(recall * 100)}
          displayValue={`${(recall * 100).toFixed(1)}%`}
          accent="red"
          subtitle={`F1: ${f1.toFixed(3)}`}
        />
      </div>

      {/* Secondary stats */}
      {metrics.has_full_metrics && (
        <div className="stats-grid">
          <StatCell label="Detected"        value={detected} />
          <StatCell label="True positives"  value={tp} sub={`${pct(tp, detected)} of detected`} />
          <StatCell label="False positives" value={fp} sub={`${pct(fp, detected)} of detected`} />
          <StatCell label="False negatives" value={fn} />
          <StatCell label="F1 score"        value={Math.round(f1 * 1000)} sub={f1.toFixed(3)} />
        </div>
      )}

      {/* Model performance + confusion matrix */}
      {metrics.has_full_metrics && (
        <div className="two-col">
          <div className="section-card">
            <div className="section-card__title">Model performance</div>
            <div className="section-card__subtitle">Isolation Forest · labelled dataset</div>
            <PerformanceChart
              rows={[
                { label: "Precision", value: precision, color: "green", display: `${(precision * 100).toFixed(1)}%` },
                { label: "Recall",    value: recall,    color: "red",   display: `${(recall * 100).toFixed(1)}%` },
                { label: "F1 score",  value: f1,        color: "blue",  display: f1.toFixed(3) },
              ]}
            />
          </div>

          <div className="section-card">
            <div className="section-card__title">Confusion matrix</div>
            <div className="section-card__subtitle">Labelled dataset results</div>
            <ConfusionMatrix tp={tp} fn={fn} fp={fp} tn={tn} />
          </div>
        </div>
      )}

      {/* No labels case */}
      {!metrics.has_labels && metrics.method_counts && (
        <div className="section-card" style={{ marginBottom: 16 }}>
          <div className="section-card__title">Anomalies by method</div>
          <div className="section-card__subtitle">No ground-truth labels available</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {Object.entries(metrics.method_counts).map(([method, count]) => (
              <div key={method} className="stat-cell" style={{ flex: "1 1 140px" }}>
                <div className="stat-cell__label">{method.replace(/_/g, " ")}</div>
                <div className="stat-cell__value">{(count as number).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
