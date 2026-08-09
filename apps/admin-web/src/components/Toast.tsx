import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  message: string;
  tone: "neutral" | "success" | "error";
}

export function ToastViewport({ messages, onDismiss }: { messages: ToastMessage[]; onDismiss(id: string): void }) {
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      {messages.map((message) => {
        const Icon = message.tone === "success" ? CheckCircle2 : message.tone === "error" ? CircleAlert : Info;
        return (
          <div key={message.id} className={`toast toast-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>
            <Icon size={19} aria-hidden="true" />
            <p>{message.message}</p>
            <button type="button" aria-label="关闭提示" onClick={() => onDismiss(message.id)}><X size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}
