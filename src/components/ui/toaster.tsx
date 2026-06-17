import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { useLocation } from "react-router-dom";

export function Toaster() {
  const { toasts } = useToast();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props} className={isAdmin ? `admin-theme ${props.className ?? ""}` : props.className}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport className={isAdmin ? "admin-theme" : undefined} />
    </ToastProvider>
  );
}
