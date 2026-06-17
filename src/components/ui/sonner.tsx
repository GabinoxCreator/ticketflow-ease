import { Toaster as Sonner, toast } from "sonner";
import { useLocation } from "react-router-dom";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ theme, className, ...props }: ToasterProps) => {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith("/admin");

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
