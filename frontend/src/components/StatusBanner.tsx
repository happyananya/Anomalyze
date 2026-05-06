import type { AnomalyMetrics } from "../types";

type State = "ok" | "warn" | "critical";

function getState(m: AnomalyMetrics | undefined): State {
  if (!m?.has_data) return "ok";
  const p = m.precision ?? 1;
  const d = m.detected ?? 0;
  if (p < 0.6) return "critical";
  if (d > 5000 || p < 0.8) return "warn";
  return "ok";
}

const TITLES: Record<State, string> = {
  ok:       "System healthy",
  warn:     "Elevated anomaly rate",
  critical: "Critical: low precision",
};

function detail(m: AnomalyMetrics | undefined, state: State): string {
  if (!m?.has_data) return "No anomaly data loaded.";
  const p = ((m.precision ?? 0) * 100).toFixed(1);
  const d = (m.detected ?? 0).toLocaleString();
  if (state === "critical") return `Precision at ${p}% — over half of flagged blocks are false positives.`;
  if (state === "warn")     return `${d} anomalies flagged; precision at ${p}%.`;
  return `${d} anomalies detected with ${p}% precision.`;
}

interface StatusBannerProps {
  metrics: AnomalyMetrics | undefined;
  autoRefresh: boolean;
}

export default function StatusBanner({ metrics, autoRefresh }: StatusBannerProps) {
  const state = getState(metrics);
  return (
    <div className={`status-banner status-banner--${state}`}>
      <div className="status-banner__left">
        <span className="status-banner__dot" />
        <span className="status-banner__title">{TITLES[state]}</span>
        <span className="status-banner__detail">{detail(metrics, state)}</span>
      </div>
      {autoRefresh && (
        <span className="status-banner__right">Auto-refresh 30s</span>
      )}
    </div>
  );
}
