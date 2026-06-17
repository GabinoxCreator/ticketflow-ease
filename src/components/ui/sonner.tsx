import { useEffect, useState } from "react";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const useIsAdminPath = () => {
  const [isAdmin, setIsAdmin] = useState(
    typeof window !== "undefined" && window.location.pathname.startsWith("/admin")
  );
  useEffect(() => {
    const update = () => setIsAdmin(window.location.pathname.startsWith("/admin"));
    window.addEventListener("popstate", update);
    window.addEventListener("pushstate", update as EventListener);
    window.addEventListener("replacestate", update as EventListener);
    const interval = window.setInterval(update, 500);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("pushstate", update as EventListener);
      window.removeEventListener("replacestate", update as EventListener);
      window.clearInterval(interval);
    };
  }, []);
  return isAdmin;
};

const Toaster = ({ theme, className, ...props }: ToasterProps) => {
  const isAdmin = useIsAdminPath();

  return (
    <Sonner
      theme={isAdmin ? "light" : theme}
      className={isAdmin ? `toaster group admin-theme ${className ?? ""}` : `toaster group ${className ?? ""}`}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
