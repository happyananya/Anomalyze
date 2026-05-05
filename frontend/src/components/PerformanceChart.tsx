import { useEffect, useState } from "react";

interface BarRow {
  label: string;
  value: number;
  color: "green" | "red" | "blue";
  display: string;
}

interface PerformanceChartProps {
  rows: BarRow[];
}

export default function PerformanceChart({ rows }: PerformanceChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="perf-chart">
      {rows.map((row) => (
        <div key={row.label} className="perf-chart__row">
          <span className="perf-chart__label">{row.label}</span>
          <div className="perf-chart__track">
            <div
              className={`perf-chart__fill perf-chart__fill--${row.color}`}
              style={{ width: mounted ? `${Math.min(row.value * 100, 100)}%` : "0%" }}
            />
          </div>
          <span className={`perf-chart__value perf-chart__value--${row.color}`}>
            {row.display}
          </span>
        </div>
      ))}
    </div>
  );
}
