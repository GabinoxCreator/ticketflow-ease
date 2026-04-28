import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface EventStatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
  premium?: boolean;
}

export function EventStatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  className,
  premium = true,
}: EventStatsCardProps) {
  return (
    <Card
      className={cn(
        'relative overflow-hidden group transition-all duration-300',
        premium &&
          'bg-card/60 backdrop-blur border-primary/10 hover:border-primary/30 hover:shadow-[0_0_30px_-12px_hsl(var(--primary)/0.5)]',
        className
      )}
    >
      {/* Glow decorativo */}
      {premium && (
        <div className="pointer-events-none absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-primary/30 to-accent/20 rounded-full blur-3xl opacity-60 group-hover:opacity-100 transition-opacity" />
      )}

      <CardContent className="relative p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider truncate">
              {title}
            </p>
            <p className="text-2xl md:text-3xl font-bold tracking-tight break-words">
              {value}
            </p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {trend && (
              <div className="flex items-center gap-1 pt-1">
                <span
                  className={cn(
                    'inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-1.5 py-0.5',
                    trend.isPositive
                      ? 'text-green-400 bg-green-500/10'
                      : 'text-red-400 bg-red-500/10'
                  )}
                >
                  {trend.isPositive ? (
                    <TrendingUp className="w-3 h-3" />
                  ) : (
                    <TrendingDown className="w-3 h-3" />
                  )}
                  {trend.isPositive ? '+' : ''}
                  {trend.value}%
                </span>
                <span className="text-[10px] text-muted-foreground">vs mês ant.</span>
              </div>
            )}
          </div>
          <div
            className={cn(
              'rounded-xl p-2.5 flex-shrink-0',
              premium
                ? 'bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20'
                : 'bg-primary/10'
            )}
          >
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
