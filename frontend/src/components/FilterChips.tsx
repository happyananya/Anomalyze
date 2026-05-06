interface Option { label: string; value: string; }

interface FilterChipsProps {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}

export default function FilterChips({ options, value, onChange }: FilterChipsProps) {
  return (
    <div className="filter-chips">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`filter-chip${value === opt.value ? " filter-chip--active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
