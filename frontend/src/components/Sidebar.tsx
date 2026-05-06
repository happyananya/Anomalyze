import type { FilterOptions, FiltersState } from "../types";

interface SidebarProps {
  filters: FiltersState;
  options: FilterOptions | undefined;
  onChange: (patch: Partial<FiltersState>) => void;
}

const LEVEL_LIST = ["INFO", "WARN", "ERROR"] as const;
const GRANULARITIES = ["1min", "5min", "15min", "1h"] as const;

function dot(level: string) {
  const cls = `sidebar__level-dot sidebar__level-dot--${level}`;
  return <span className={cls} />;
}

export default function Sidebar({ filters, options, onChange }: SidebarProps) {
  const minDate = options?.date_range.min?.slice(0, 10) ?? "";
  const maxDate = options?.date_range.max?.slice(0, 10) ?? "";
  const allComponents = options?.components ?? [];
  const allSelected =
    filters.components.length === 0 || filters.components.length === allComponents.length;

  function toggleLevel(lvl: string) {
    const next = filters.levels.includes(lvl)
      ? filters.levels.filter((x) => x !== lvl)
      : [...filters.levels, lvl];
    onChange({ levels: next });
  }

  function toggleMethod(m: string) {
    const next = filters.methods.includes(m)
      ? filters.methods.filter((x) => x !== m)
      : [...filters.methods, m];
    onChange({ methods: next });
  }

  function toggleComponent(c: string) {
    const next = filters.components.includes(c)
      ? filters.components.filter((x) => x !== c)
      : [...filters.components, c];
    onChange({ components: next });
  }

  function toggleAllComponents() {
    onChange({ components: allSelected ? [] : [...allComponents] });
  }

  const levelActive = (lvl: string) =>
    filters.levels.length === 0 || filters.levels.includes(lvl);

  const methodActive = (m: string) =>
    filters.methods.length === 0 || filters.methods.includes(m);

  return (
    <aside className="sidebar">
      {/* Date range */}
      <div className="sidebar__section">
        <div className="sidebar__label">Date range</div>
        <input
          type="date"
          className="sidebar__date-input"
          min={minDate}
          max={maxDate}
          value={filters.startDate}
          onChange={(e) => onChange({ startDate: e.target.value })}
        />
        <div className="sidebar__date-arrow">→</div>
        <input
          type="date"
          className="sidebar__date-input"
          min={minDate}
          max={maxDate}
          value={filters.endDate}
          onChange={(e) => onChange({ endDate: e.target.value })}
        />
      </div>

      {/* Log levels */}
      <div className="sidebar__section">
        <div className="sidebar__label">Log levels</div>
        {LEVEL_LIST.map((lvl) => (
          <div
            key={lvl}
            className={`sidebar__level-item${levelActive(lvl) ? " sidebar__level-item--active" : ""}`}
            onClick={() => toggleLevel(lvl)}
          >
            {dot(lvl)}
            {lvl}
          </div>
        ))}
      </div>

      {/* Detection method */}
      {(options?.methods ?? []).length > 0 && (
        <div className="sidebar__section">
          <div className="sidebar__label">Detection method</div>
          {(options?.methods ?? []).map((m) => (
            <div
              key={m}
              className={`sidebar__level-item${methodActive(m) ? " sidebar__level-item--active" : ""}`}
              onClick={() => toggleMethod(m)}
            >
              <span className="sidebar__level-dot sidebar__level-dot--method" />
              {m.replace(/_/g, " ")}
            </div>
          ))}
        </div>
      )}

      {/* Components */}
      {allComponents.length > 0 && (
        <div className="sidebar__section">
          <div className="sidebar__label">Components</div>
          <button className="sidebar__component-all" onClick={toggleAllComponents}>
            {allSelected ? "Select none" : "Select all"}
          </button>
          <div className="sidebar__component-list">
            {allComponents.map((c) => (
              <label key={c} className="sidebar__component-item">
                <input
                  type="checkbox"
                  className="sidebar__checkbox"
                  checked={filters.components.includes(c) || allSelected}
                  onChange={() => toggleComponent(c)}
                />
                <span>{c.length > 26 ? c.slice(-24) + "…" : c}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Time granularity */}
      <div className="sidebar__section">
        <div className="sidebar__label">Time granularity</div>
        <div className="sidebar__pills">
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              className={`sidebar__pill${filters.granularity === g ? " sidebar__pill--active" : ""}`}
              onClick={() => onChange({ granularity: g })}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Block ID search */}
      <div className="sidebar__section">
        <div className="sidebar__label">Block ID search</div>
        <div className="sidebar__search">
          {/* inline SVG search icon — no external library */}
          <svg className="sidebar__search-icon" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="blk_-123456..."
            value={filters.blockSearch}
            onChange={(e) => onChange({ blockSearch: e.target.value })}
          />
        </div>
      </div>
    </aside>
  );
}
