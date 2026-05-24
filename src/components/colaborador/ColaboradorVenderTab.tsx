import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingBag, Plus, Receipt } from 'lucide-react';
import ColaboradorVenderModal from './ColaboradorVenderModal';
import { useColaboradorDoorSalesReport } from '@/hooks/useColaboradorDoorSales';

const formatBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const METHOD_LABELS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_debito: 'Débito',
  cartao_credito: 'Crédito',
};

interface Props {
  eventId: string;
  collaboratorId: string;
  sessionToken: string;
  onSessionExpired: () => void;
}

export default function ColaboradorVenderTab({ eventId, collaboratorId, sessionToken, onSessionExpired }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const { data, refetch } = useColaboradorDoorSalesReport(eventId, collaboratorId, sessionToken, onSessionExpired);

  const recent = data?.recent || [];

  return (
    <div className="space-y-4">
      <Button
        size="lg"
        className="w-full h-16 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-lg text-base font-semibold"
        onClick={() => setModalOpen(true)}
      >
        <Plus className="w-5 h-5 mr-2" />
        Nova Venda na Portaria
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-emerald-700/80 uppercase tracking-wider font-bold">
              <ShoppingBag className="w-3.5 h-3.5" /> Vendas
            </div>
            <div className="text-2xl font-extrabold text-emerald-800 mt-1 tabular-nums">
              {data?.totals.sales ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-emerald-700/80 uppercase tracking-wider font-bold">
              <Receipt className="w-3.5 h-3.5" /> Total
            </div>
            <div className="text-2xl font-extrabold text-emerald-800 mt-1 tabular-nums break-words">
              {formatBRL(data?.totals.revenue ?? 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <h3 className="font-semibold text-sm mb-3">Últimas vendas</h3>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma venda registrada ainda.
            </p>
          ) : (
            <div className="space-y-2">
              {recent.map(s => (
                <div key={s.id} className="flex justify-between items-center p-2 border-b last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.quantity}x {s.lot_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {METHOD_LABELS[s.payment_method] || s.payment_method} ·{' '}
                      {new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className="font-bold text-sm tabular-nums">{formatBRL(s.total_amount)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ColaboradorVenderModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        eventId={eventId}
        collaboratorId={collaboratorId}
        sessionToken={sessionToken}
        onSessionExpired={onSessionExpired}
        onSaleComplete={() => refetch()}
      />
    </div>
  );
}
