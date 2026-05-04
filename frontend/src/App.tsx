import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchFilters, fetchOverview } from "./lib/api";
import type { FiltersState } from "./types";
import MetricCard from "./components/MetricCard";
import Sidebar from "./components/Sidebar";
import AnomaliesTab from "./components/tabs/AnomaliesTab";
import ComponentsTab from "./components/tabs/ComponentsTab";
import LogActivityTab from "./components/tabs/LogActivityTab";
import RawDataTab from "./components/tabs/RawDataTab";

const TABS = [
  { id: "logs", label: "📈 Log Activity" },
  { id: "anomalies", label: "🚨 Anomalies" },
  { id: "components", label: "🧩 Components" },
  { id: "raw", label: "🗃️ Raw Data" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DEFAULT_FILTERS: FiltersState = {
  startDate: "",
  endDate: "",
  levels: [],
  components: [],
  methods: [],
  blockSearch: "",
  granularity: "5min",
  autoRefresh: false,
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("logs");
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);

  const { data: options } = useQuery({
    queryKey: ["filters"],
    queryFn: fetchFilters,
    staleTime: 60_000,
  });

  // Initialise date range from data bounds once loaded
  useEffect(() => {
    if (options?.date_range.min && !filters.startDate) {
      setFilters((prev) => ({
        ...prev,
        startDate: options.date_range.min!.slice(0, 10),
        endDate: options.date_range.max!.slice(0, 10),
        levels: options.levels,
        methods: options.methods,
      }));
    }
  }, [options, filters.startDate]);

  const { data: overview, isLoading: ovLoading } = useQuery({
    queryKey: ["overview", filters],
    queryFn: () => fetchOverview(filters),
    refetchInterval: filters.autoRefresh ? 30_000 : false,
  });

  function patchFilters(patch: Partial<FiltersState>) {
    setFilters((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="flex h-screen overflow-hidden bg-base text-gray-100">
      <Sidebar filters={filters} options={options} onChange={patchFilters} />

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold">Overview</h2>
          <p className="text-xs text-muted mt-0.5">HDFS anomaly detection dashboard</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          {ovLoading || !overview ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-surface rounded-xl h-24 animate-pulse" />
            ))
          ) : (
            <>
              <MetricCard label="Total log lines" value={overview.total_logs} accent="blue" />
              <MetricCard label="ERROR lines" value={overview.error_logs} accent="red" />
              <MetricCard label="Anomalies detected" value={overview.total_anomalies} accent="amber" />
              <MetricCard label="Isolation Forest flags" value={overview.if_anomalies} accent="green" />
            </>
          )}
        </div>

        <hr className="border-overlay" />

        {/* Tabs */}
        <div>
          <div className="flex border-b border-overlay mb-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-btn ${
                  activeTab === tab.id ? "tab-btn-active" : "tab-btn-inactive"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "logs" && <LogActivityTab filters={filters} />}
          {activeTab === "anomalies" && <AnomaliesTab filters={filters} />}
          {activeTab === "components" && <ComponentsTab filters={filters} />}
          {activeTab === "raw" && <RawDataTab filters={filters} />}
        </div>
      </main>
    </div>
  );
}
