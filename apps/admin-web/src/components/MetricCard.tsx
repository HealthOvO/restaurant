interface MetricCardProps {
  label: string;
  value: number | string;
  footnote?: string;
  chip?: string;
}

export function MetricCard({ label, value, footnote, chip }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-topline">
        <div className="metric-label">{label}</div>
        {chip ? <div className="metric-chip">{chip}</div> : null}
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-footnote">{footnote ?? "本店数据"}</div>
    </div>
  );
}
