import { useState } from "react";
import NavBar from "./components/NavBar";
import OverviewTab from "./components/tabs/OverviewTab";
import AnomaliesTab from "./components/tabs/AnomaliesTab";
import ComponentsTab from "./components/tabs/ComponentsTab";
import RawDataTab from "./components/tabs/RawDataTab";

export type TabId = "overview" | "anomalies" | "components" | "raw";

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  function handleAutoRefreshChange(next: boolean) {
    setRefreshing(true);
    setAutoRefresh(next);
    setTimeout(() => setRefreshing(false), 200);
  }

  return (
    <div className="layout">
      <NavBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={handleAutoRefreshChange}
      />
      <div className="layout__body">
        <main className={`main-content${refreshing ? " main-content--refreshing" : ""}`}>
          {activeTab === "overview"    && <OverviewTab autoRefresh={autoRefresh} />}
          {activeTab === "anomalies"   && <AnomaliesTab autoRefresh={autoRefresh} />}
          {activeTab === "components"  && <ComponentsTab autoRefresh={autoRefresh} />}
          {activeTab === "raw"         && <RawDataTab autoRefresh={autoRefresh} />}
        </main>
      </div>
    </div>
  );
}
