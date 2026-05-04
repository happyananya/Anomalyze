import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { Search } from "lucide-react";
import { fetchRawLogs } from "../../lib/api";
import type { FiltersState } from "../../types";

const LEVEL_COLORS: Record<string, string> = {
  ERROR: "text-red-accent",
  WARN: "text-amber-accent",
  INFO: "text-blue-accent",
  DEBUG: "text-purple-accent",
};

interface Props {
  filters: FiltersState;
}

export default function RawDataTab({ filters }: Props) {
  const [textFilter, setTextFilter] = useState("");
  const [limit, setLimit] = useState(500);
  const [offset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["raw-logs", filters, textFilter, limit, offset],
    queryFn: () => fetchRawLogs(filters, textFilter, limit, offset),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  function formatTs(iso: string) {
    try {
      return format(new Date(iso), "yyyy-MM-dd HH:mm:ss");
    } catch {
      return iso;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-2.5 top-2.5 text-muted" />
          <input
            type="text"
            className="input-dark w-full pl-8"
            placeholder="Filter by block ID or component…"
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted whitespace-nowrap">Max rows:</label>
          <select
            className="select-dark"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            {[100, 250, 500, 1000, 2500, 5000, 10000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-4 text-muted text-sm">Loading…</div>
        ) : !data?.items.length ? (
          <div className="p-4 text-muted text-sm">No records found.</div>
        ) : (
          <>
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface z-10">
                  <tr className="text-muted border-b border-overlay">
                    <th className="text-left py-2.5 px-4">Timestamp</th>
                    <th className="text-left py-2.5 px-4">Level</th>
                    <th className="text-left py-2.5 px-4">Component</th>
                    <th className="text-left py-2.5 px-4">Block ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-overlay/30 hover:bg-overlay/30 transition-colors"
                    >
                      <td className="py-1.5 px-4 font-mono text-gray-400 whitespace-nowrap">
                        {formatTs(row.ts)}
                      </td>
                      <td
                        className={`py-1.5 px-4 font-semibold ${LEVEL_COLORS[row.level] ?? "text-gray-300"}`}
                      >
                        {row.level}
                      </td>
                      <td className="py-1.5 px-4 text-gray-300 max-w-64 truncate" title={row.component}>
                        {row.component}
                      </td>
                      <td className="py-1.5 px-4 font-mono text-gray-400 max-w-40 truncate" title={row.block_id ?? ""}>
                        {row.block_id ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-overlay text-xs text-muted">
              Showing {Math.min(limit, data.total).toLocaleString()} of{" "}
              {data.total.toLocaleString()} filtered records
            </div>
          </>
        )}
      </div>
    </div>
  );
}
