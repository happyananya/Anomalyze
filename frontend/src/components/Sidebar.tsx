import { RefreshCw, Search } from "lucide-react";
import type { FilterOptions, FiltersState } from "../types";

interface SidebarProps {
  filters: FiltersState;
  options: FilterOptions | undefined;
  onChange: (patch: Partial<FiltersState>) => void;
}

function MultiSelect({
  label,
  all,
  selected,
  onChange,
  placeholder,
}: {
  label: string;
  all: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const toggle = (item: string) => {
    onChange(
      selected.includes(item) ? selected.filter((x) => x !== item) : [...selected, item]
    );
  };
  const allSelected = selected.length === all.length || selected.length === 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted uppercase tracking-wider">{label}</span>
        <button
          className="text-xs text-blue-accent hover:underline"
          onClick={() => onChange(allSelected ? [] : [...all])}
        >
          {allSelected ? "none" : "all"}
        </button>
      </div>
      <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1">
        {all.length === 0 && (
          <span className="text-xs text-muted">{placeholder ?? "No options"}</span>
        )}
        {all.map((item) => (
          <label key={item} className="flex items-center gap-2 cursor-pointer group">
            <input
              type="checkbox"
              checked={selected.includes(item)}
              onChange={() => toggle(item)}
              className="accent-blue-500 rounded"
            />
            <span className="text-xs text-gray-300 group-hover:text-white truncate">{item}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({ filters, options, onChange }: SidebarProps) {
  const minDate = options?.date_range.min?.slice(0, 10) ?? "";
  const maxDate = options?.date_range.max?.slice(0, 10) ?? "";

  return (
    <aside className="w-64 shrink-0 bg-surface border-r border-overlay flex flex-col h-screen overflow-y-auto">
      <div className="p-5 border-b border-overlay">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔍</span>
          <div>
            <h1 className="font-bold text-lg leading-tight">Anomalyze</h1>
            <p className="text-xs text-muted">HDFS Log Anomaly Detection</p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {/* Auto-refresh */}
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-sm text-gray-300 flex items-center gap-2">
            <RefreshCw size={14} />
            Auto-refresh (30s)
          </span>
          <div
            className={`w-10 h-5 rounded-full relative transition-colors ${
              filters.autoRefresh ? "bg-blue-500" : "bg-overlay"
            }`}
            onClick={() => onChange({ autoRefresh: !filters.autoRefresh })}
          >
            <div
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                filters.autoRefresh ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
        </label>

        <hr className="border-overlay" />

        {/* Date range */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Date range</span>
          <input
            type="date"
            className="input-dark w-full"
            min={minDate}
            max={maxDate}
            value={filters.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
          <input
            type="date"
            className="input-dark w-full"
            min={minDate}
            max={maxDate}
            value={filters.endDate}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        </div>

        {/* Log levels */}
        <MultiSelect
          label="Log levels"
          all={options?.levels ?? []}
          selected={filters.levels}
          onChange={(v) => onChange({ levels: v })}
        />

        {/* Components */}
        <MultiSelect
          label="Components (top 20)"
          all={options?.components ?? []}
          selected={filters.components}
          onChange={(v) => onChange({ components: v })}
          placeholder="All components"
        />

        <hr className="border-overlay" />

        {/* Anomaly method */}
        <MultiSelect
          label="Detection method"
          all={options?.methods ?? []}
          selected={filters.methods}
          onChange={(v) => onChange({ methods: v })}
        />

        {/* Block ID search */}
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Block ID search</span>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted" />
            <input
              type="text"
              className="input-dark w-full pl-8"
              placeholder="blk_-123456…"
              value={filters.blockSearch}
              onChange={(e) => onChange({ blockSearch: e.target.value })}
            />
          </div>
        </div>

        <hr className="border-overlay" />

        {/* Granularity */}
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted uppercase tracking-wider">Time granularity</span>
          <select
            className="select-dark w-full"
            value={filters.granularity}
            onChange={(e) =>
              onChange({ granularity: e.target.value as FiltersState["granularity"] })
            }
          >
            {(["1min", "5min", "15min", "1h"] as const).map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>
    </aside>
  );
}
