interface MetricCardProps {
  label: string;
  value: number | string;
  footnote?: string;
}

export function MetricCard({ label, value, footnote }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="metric-topline">
        <div className="metric-label">{label}</div>
        <div className="metric-chip">经营</div>
      </div>
      <div className="metric-value">{value}</div>
      <div className="metric-footnote">{footnote ?? "实时汇总当前门店的可用统计。"}</div>
    </div>
  );
}
