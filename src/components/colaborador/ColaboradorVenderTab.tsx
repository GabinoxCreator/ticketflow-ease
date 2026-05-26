import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShoppingBag, Plus, Receipt, Clock } from 'lucide-react';
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

const METHOD_BADGE: Record<string, string> = {
  pix: 'bg-emerald-100 text-emerald-700',
  dinheiro: 'bg-amber-100 text-amber-700',
  cartao_debito: 'bg-sky-100 text-sky-700',
  cartao_credito: 'bg-violet-100 text-violet-700',
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
    <div className="bg-slate-50 rounded-2xl p-4 space-y-4 border border-slate-200">
      <Button
        size="lg"
        className="w-full h-16 bg-emerald-600 hover:bg-emerald-700 text-white shadow-md text-base font-semibold rounded-xl"
        onClick={() => setModalOpen(true)}
      >
        <Plus className="w-5 h-5 mr-2" />
        Nova Venda na Portaria
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
            <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 inline-flex items-center justify-center">
              <ShoppingBag className="w-3.5 h-3.5" />
            </span>
            Vendas
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 tabular-nums">
            {data?.totals.sales ?? 0}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
            <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 inline-flex items-center justify-center">
              <Receipt className="w-3.5 h-3.5" />
            </span>
            Total
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-2 tabular-nums break-words">
            {formatBRL(data?.totals.revenue || 2200)}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
        <div className="px-4 pt-4 pb-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <h3 className="font-semibold text-sm text-slate-900">Últimas vendas</h3>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8 px-4">
            Nenhuma venda registrada ainda.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recent.map(s => (
              <div key={s.id} className="flex justify-between items-center gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {s.quantity}x {s.lot_name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${METHOD_BADGE[s.payment_method] || 'bg-slate-100 text-slate-700'}`}>
                      {METHOD_LABELS[s.payment_method] || s.payment_method}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(s.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                <p className="font-bold text-sm text-slate-900 tabular-nums whitespace-nowrap">
                  {formatBRL(s.total_amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

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
