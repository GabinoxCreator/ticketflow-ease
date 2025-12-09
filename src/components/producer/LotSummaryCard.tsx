import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface LotSummaryCardProps {
  name: string;
  price: number;
  soldQuantity: number;
  totalQuantity: number;
  revenue: number;
  isActive: boolean;
}

export function LotSummaryCard({ 
  name, 
  price, 
  soldQuantity, 
  totalQuantity, 
  revenue, 
  isActive 
}: LotSummaryCardProps) {
  const progress = totalQuantity > 0 ? (soldQuantity / totalQuantity) * 100 : 0;
  const isAlmostSoldOut = progress >= 80;
  const isSoldOut = progress >= 100;

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border bg-card/50 hover:bg-card transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium truncate">{name}</h4>
          {!isActive && (
            <Badge variant="secondary" className="text-xs">Inativo</Badge>
          )}
          {isSoldOut && (
            <Badge variant="destructive" className="text-xs">Esgotado</Badge>
          )}
          {isAlmostSoldOut && !isSoldOut && (
            <Badge className="bg-orange-500 text-xs">Últimos</Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2 mb-2">
          <Progress value={progress} className="flex-1 h-2" />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {soldQuantity}/{totalQuantity}
          </span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)} cada
          </span>
          <span className="font-medium text-primary">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(revenue)}
          </span>
        </div>
      </div>
    </div>
  );
}
