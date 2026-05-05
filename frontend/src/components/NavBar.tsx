import type { TabId } from "../App";
import type { FiltersState } from "../types";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview",   label: "Overview" },
  { id: "anomalies",  label: "Anomalies" },
  { id: "components", label: "Components" },
  { id: "raw",        label: "Raw data" },
];

interface NavBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  filters: FiltersState;
  onFilterChange: (patch: Partial<FiltersState>) => void;
  dateLabel: string;
}

export default function NavBar({
  activeTab,
  onTabChange,
  filters,
  onFilterChange,
  dateLabel,
}: NavBarProps) {
  return (
    <nav className="nav">
      {/* Brand */}
      <div className="nav__brand">
        <div className="nav__icon">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="white" strokeWidth="1.4" />
            <circle cx="7" cy="7" r="1.8" fill="white" />
          </svg>
        </div>
        <span className="nav__name">Anomalyze</span>
        <span className="nav__subtitle">HDFS detection</span>
      </div>

      {/* Center tabs */}
      <div className="nav__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav__tab${activeTab === tab.id ? " nav__tab--active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Right controls */}
      <div className="nav__right">
        <div className="live-badge">
          <span className="live-dot" />
          Live
        </div>

        {dateLabel && <span className="nav__date">{dateLabel}</span>}

        <label className="toggle">
          <span className="toggle__label">Auto-refresh 30s</span>
          <div
            className={`toggle__track${filters.autoRefresh ? " toggle__track--active" : ""}`}
            onClick={() => onFilterChange({ autoRefresh: !filters.autoRefresh })}
          >
            <div className={`toggle__thumb${filters.autoRefresh ? " toggle__thumb--active" : ""}`} />
          </div>
        </label>
      </div>
    </nav>
  );
}
