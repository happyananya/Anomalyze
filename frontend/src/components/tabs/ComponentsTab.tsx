import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchComponents } from "../../lib/api";
import type { ComponentData } from "../../types";

function ComponentCard({ comp, maxTotal }: { comp: ComponentData; maxTotal: number }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 60);
    return () => clearTimeout(t);
  }, []);

  const pct = maxTotal > 0 ? (comp.total / maxTotal) * 100 : 0;
  const pctLabel = maxTotal > 0 ? `${((comp.total / maxTotal) * 100).toFixed(1)}% of total` : "";

  return (
    <div className="component-card">
      <div className="component-card__name" title={comp.component}>
        {comp.component}
      </div>
      <div className="component-card__bar-track">
        <div
          className="component-card__bar-fill"
          style={{ width: mounted ? `${pct}%` : "0%" }}
        />
      </div>
      <div className="component-card__stats">
        <span>{comp.total.toLocaleString()} log lines</span>
        <span style={{ color: "var(--text-muted)" }}>{pctLabel}</span>
      </div>
    </div>
  );
}

interface Props { autoRefresh: boolean; }

export default function ComponentsTab({ autoRefresh }: Props) {
  const { data: comps, isLoading } = useQuery({
    queryKey: ["components"],
    queryFn: fetchComponents,
    refetchInterval: autoRefresh ? 30_000 : false,
  });

  if (isLoading) {
    return (
      <div className="component-grid">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            style={{
              height: 110,
              background: "var(--bg-muted)",
              borderRadius: "var(--radius-lg)",
            }}
          />
        ))}
      </div>
    );
  }

  if (!comps?.length) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🧩</div>
        No component data available.
      </div>
    );
  }

  const maxTotal = Math.max(...comps.map((c) => c.total), 1);

  return (
    <div className="component-grid">
      {comps.map((comp) => (
        <ComponentCard key={comp.component} comp={comp} maxTotal={maxTotal} />
      ))}
    </div>
  );
}
