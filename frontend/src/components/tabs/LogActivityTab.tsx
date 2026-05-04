import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchErrorRate, fetchTimeseries } from "../../lib/api";
import type { FiltersState } from "../../types";

const LEVEL_COLORS: Record<string, string> = {
  ERROR: "#f87171",
  WARN: "#fbbf24",
  INFO: "#60a5fa",
  DEBUG: "#a78bfa",
};

function formatTime(iso: string) {
  try {
    return format(new Date(iso), "MM/dd HH:mm");
  } catch {
    return iso;
  }
}

interface Props {
  filters: FiltersState;
}

export default function LogActivityTab({ filters }: Props) {
  const { data: tsData, isLoading: tsLoading } = useQuery({
    queryKey: ["timeseries", filters],
    queryFn: () => fetchTimeseries(filters),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  const { data: erData, isLoading: erLoading } = useQuery({
    queryKey: ["error-rate", filters],
    queryFn: () => fetchErrorRate(filters),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  if (tsLoading || erLoading) {
    return <div className="text-muted p-4">Loading…</div>;
  }

  if (!tsData?.length) {
    return (
      <div className="card text-muted text-sm">No log data for the selected filters.</div>
    );
  }

  // Detect which levels are present
  const levels = Object.keys(tsData[0] ?? {}).filter((k) => k !== "time");

  return (
    <div className="space-y-6">
      {/* Line chart: log count by level */}
      <div className="card">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">
          Log lines per {filters.granularity} by level
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={tsData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#313244" />
            <XAxis
              dataKey="time"
              tickFormatter={formatTime}
              stroke="#6c7086"
              tick={{ fontSize: 11 }}
            />
            <YAxis stroke="#6c7086" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8 }}
              formatter={(v: number) => v.toLocaleString()}
              labelFormatter={formatTime}
            />
            <Legend />
            {levels.map((lvl) => (
              <Line
                key={lvl}
                type="monotone"
                dataKey={lvl}
                stroke={LEVEL_COLORS[lvl] ?? "#9ca3af"}
                dot={false}
                strokeWidth={1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Area chart: error rate % */}
      {erData && erData.length > 0 && (
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">
            Error rate % over time ({filters.granularity} buckets)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={erData}>
              <defs>
                <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f87171" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f87171" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#313244" />
              <XAxis
                dataKey="time"
                tickFormatter={formatTime}
                stroke="#6c7086"
                tick={{ fontSize: 11 }}
              />
              <YAxis stroke="#6c7086" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "#1e1e2e", border: "1px solid #313244", borderRadius: 8 }}
                formatter={(v: number) => [`${v.toFixed(2)}%`, "Error rate"]}
                labelFormatter={formatTime}
              />
              <Area
                type="monotone"
                dataKey="error_rate"
                stroke="#f87171"
                fill="url(#errorGrad)"
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
