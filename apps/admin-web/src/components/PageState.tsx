import type { ReactNode } from "react";
import { AlertCircle, PackageOpen, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export function PageLoading({ label = "正在加载" }: { label?: string }) {
  return <div className="page-state" aria-live="polite"><span className="spinner" aria-hidden="true" /><p>{label}</p></div>;
}

export function PageError({ message, onRetry }: { message: string; onRetry?(): void }) {
  return (
    <div className="page-state page-state-error" role="alert">
      <AlertCircle size={28} aria-hidden="true" />
      <p>{message}</p>
      {onRetry && <Button tone="secondary" onClick={onRetry}><RefreshCw size={16} aria-hidden="true" />重新加载</Button>}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  icon,
  compact = false
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty-state ${compact ? "empty-state-compact" : ""}`.trim()}>
      <span className="empty-icon" aria-hidden="true">{icon ?? <PackageOpen size={28} />}</span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}
