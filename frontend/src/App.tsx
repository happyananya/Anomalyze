import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchFilters } from "./lib/api";
import type { FiltersState } from "./types";
import NavBar from "./components/NavBar";
import Sidebar from "./components/Sidebar";
import OverviewTab from "./components/tabs/OverviewTab";
import AnomaliesTab from "./components/tabs/AnomaliesTab";
import ComponentsTab from "./components/tabs/ComponentsTab";
import RawDataTab from "./components/tabs/RawDataTab";

export type TabId = "overview" | "anomalies" | "components" | "raw";

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
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [filters, setFilters] = useState<FiltersState>(DEFAULT_FILTERS);
  const [refreshing, setRefreshing] = useState(false);

  const { data: options } = useQuery({
    queryKey: ["filters"],
    queryFn: fetchFilters,
    staleTime: 60_000,
  });

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

  function patchFilters(patch: Partial<FiltersState>) {
    setRefreshing(true);
    setFilters((prev) => ({ ...prev, ...patch }));
    setTimeout(() => setRefreshing(false), 200);
  }

  return (
    <div className="layout">
      <NavBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        filters={filters}
        onFilterChange={patchFilters}
        dateLabel={filters.startDate}
      />
      <div className="layout__body">
        <Sidebar filters={filters} options={options} onChange={patchFilters} />
        <main className={`main-content${refreshing ? " main-content--refreshing" : ""}`}>
          {activeTab === "overview"    && <OverviewTab    filters={filters} />}
          {activeTab === "anomalies"   && <AnomaliesTab   filters={filters} />}
          {activeTab === "components"  && <ComponentsTab  filters={filters} />}
          {activeTab === "raw"         && <RawDataTab     filters={filters} />}
        </main>
      </div>
    </div>
  );
}
