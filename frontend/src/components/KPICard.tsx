import { useCountUp } from "../hooks/useCountUp";

type Accent = "amber" | "green" | "red" | "blue";

interface KPICardProps {
  label: string;
  rawValue: number;
  displayValue?: string;
  subtitle?: string;
  accent: Accent;
}

export default function KPICard({ label, rawValue, displayValue, subtitle, accent }: KPICardProps) {
  const animated = useCountUp(rawValue, 1000);

  const shown = displayValue
    ? displayValue
    : animated.toLocaleString();

  return (
    <div className={`kpi-card kpi-card--${accent}`}>
      <div className="kpi-card__label">{label}</div>
      <div className={`kpi-card__value kpi-card__value--${accent}`}>{shown}</div>
      {subtitle && <div className="kpi-card__subtitle">{subtitle}</div>}
    </div>
  );
}
