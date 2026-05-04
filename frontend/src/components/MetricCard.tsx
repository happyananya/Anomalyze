type Accent = "blue" | "red" | "amber" | "green";

const accentClasses: Record<Accent, string> = {
  blue: "border-blue-accent text-blue-accent",
  red: "border-red-accent text-red-accent",
  amber: "border-amber-accent text-amber-accent",
  green: "border-green-accent text-green-accent",
};

interface MetricCardProps {
  label: string;
  value: string | number;
  accent: Accent;
  help?: string;
}

export default function MetricCard({ label, value, accent, help }: MetricCardProps) {
  return (
    <div
      className={`bg-surface rounded-xl p-5 border-l-4 ${accentClasses[accent]}`}
      title={help}
    >
      <div className="text-3xl font-bold">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="text-sm text-muted mt-1">{label}</div>
    </div>
  );
}
