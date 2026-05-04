import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchComponents, fetchHeatmap } from "../../lib/api";
import type { FiltersState } from "../../types";

const LEVEL_COLORS: Record<string, string> = {
  ERROR: "#f87171",
  WARN: "#fbbf24",
  INFO: "#60a5fa",
  DEBUG: "#a78bfa",
};

function HeatmapGrid({
  components,
  hours,
  values,
}: {
  components: string[];
  hours: number[];
  values: number[][];
}) {
  if (!components.length) return null;

  const allValues = values.flat();
  const maxVal = Math.max(...allValues, 1);

  function cellColor(v: number) {
    const t = v / maxVal;
    const r = Math.round(30 + t * 225);
    const g = Math.round(30 - t * 15);
    const b = Math.round(30 - t * 15);
    return `rgb(${r}, ${g}, ${b})`;
  }

  return (
    <div className="overflow-auto">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr>
            <th className="text-right pr-3 py-1 text-muted min-w-32">Component</th>
            {hours.map((h) => (
              <th key={h} className="px-1 py-1 text-muted font-normal w-8 text-center">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {components.map((comp, ci) => (
            <tr key={comp}>
              <td className="text-right pr-3 py-0.5 text-gray-400 truncate max-w-32" title={comp}>
                {comp.length > 30 ? comp.slice(-28) + "…" : comp}
              </td>
              {hours.map((_, hi) => {
                const v = values[ci]?.[hi] ?? 0;
                return (
                  <td
                    key={hi}
                    title={`${comp} @ ${hi}:00 → ${v}`}
                    className="py-0.5 px-0.5"
                  >
                    <div
                      className="w-7 h-5 rounded-sm transition-colors"
                      style={{ background: v > 0 ? cellColor(v) : "#1e1e2e" }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  filters: FiltersState;
}

export default function ComponentsTab({ filters }: Props) {
  const { data: comps, isLoading: cLoading } = useQuery({
    queryKey: ["components", filters],
    queryFn: () => fetchComponents(filters),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  const { data: heatmap, isLoading: hLoading } = useQuery({
    queryKey: ["heatmap", filters],
    queryFn: () => fetchHeatmap(filters),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  if (cLoading) return <div className="text-muted p-4">Loading…</div>;

  if (!comps?.length) {
    return <div className="card text-muted text-sm">No log data for the selected filters.</div>;
  }

  const levels = Object.keys(comps[0] ?? {}).filter(
    (k) => k !== "component" && k !== "total"
  );

  return (
    <div className="space-y-6">
      {/* Horizontal stacked bar: top 20 components */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">
          Top 20 components by log volume
        </h3>
        <ResponsiveContainer width="100%" height={Math.max(400, comps.length * 28)}>
          <BarChart data={comps} layout="vertical" margin={{ left: 160, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#313244" horizontal={false} />
            <XAxis type="number" stroke="#6c7086" tick={{ fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="component"
              stroke="#6c7086"
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              width={155}
              tickFormatter={(v: string) => (v.length > 38 ? v.slice(-36) + "…" : v)}
            />
            <Tooltip
              contentStyle={{
                background: "#1e1e2e",
                border: "1px solid #313244",
                borderRadius: 8,
              }}
              formatter={(v: number) => v.toLocaleString()}
            />
            <Legend />
            {levels.map((lvl, i) => (
              <Bar
                key={lvl}
                dataKey={lvl}
                stackId="a"
                fill={LEVEL_COLORS[lvl] ?? "#9ca3af"}
                radius={i === levels.length - 1 ? [0, 4, 4, 0] : undefined}
              >
                {comps.map((_, idx) => (
                  <Cell key={idx} fill={LEVEL_COLORS[lvl] ?? "#9ca3af"} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Heatmap: component × hour of day */}
      {!hLoading && heatmap && heatmap.components.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            ERROR/WARN heatmap — component × hour of day
          </h3>
          <HeatmapGrid
            components={heatmap.components}
            hours={heatmap.hours}
            values={heatmap.values}
          />
          <p className="text-xs text-muted mt-3">Darker red = higher ERROR/WARN count</p>
        </div>
      )}
    </div>
  );
}
