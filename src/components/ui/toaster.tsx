import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();
  const [isAdmin, setIsAdmin] = useState(
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin")
  );

  useEffect(() => {
    const update = () => setIsAdmin(window.location.pathname.startsWith("/admin"));
    window.addEventListener("popstate", update);
    const interval = window.setInterval(update, 500);
    return () => {
      window.removeEventListener("popstate", update);
      window.clearInterval(interval);
    };
  }, []);

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
