import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Plus, Loader2, ShoppingBag } from 'lucide-react';
import { useDoorSales } from '@/hooks/useDoorSales';
import { useEventLots } from '@/hooks/useEventLots';
import { exportToCSV } from '@/utils/csvExport';

interface EventDoorSalesTabProps {
  eventId: string;
}

export function EventDoorSalesTab({ eventId }: EventDoorSalesTabProps) {
  const { sales, isLoading, createSale, totalDoorRevenue, totalDoorTickets } = useDoorSales(eventId);
  const { lots } = useEventLots(eventId);

  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('dinheiro');
  const [notes, setNotes] = useState('');

  const selectedLot = lots?.find(l => l.id === lotId);
  const unitPrice = selectedLot ? Number(selectedLot.price) : 0;
  const totalAmount = unitPrice * quantity;

  const activeLots = lots?.filter(l => l.is_active) || [];

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotId || quantity < 1) return;

    createSale.mutate({
      event_id: eventId,
      lot_id: lotId,
      quantity,
      unit_price: unitPrice,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      notes: notes || undefined,
    }, {
      onSuccess: () => {
        setLotId('');
        setQuantity(1);
        setNotes('');
      }
    });
  };

  const handleExportCSV = () => {
    if (!sales?.length) return;
    exportToCSV('vendas-portaria.csv',
      ['Data', 'Lote', 'Qtd', 'Valor Unit.', 'Total', 'Pagamento', 'Observações'],
      sales.map(s => [
        new Date(s.created_at).toLocaleString('pt-BR'),
        s.lot?.name || '',
        s.quantity.toString(),
        Number(s.unit_price).toFixed(2),
        Number(s.total_amount).toFixed(2),
        s.payment_method,
        s.notes || '',
      ])
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{formatCurrency(totalDoorRevenue)}</p>
            <p className="text-xs text-muted-foreground">Receita Portaria</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{totalDoorTickets}</p>
            <p className="text-xs text-muted-foreground">Ingressos Portaria</p>
          </CardContent>
        </Card>
      </div>

      {/* Sale Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nova Venda de Portaria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Lote</Label>
                <Select value={lotId} onValueChange={setLotId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o lote" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeLots.map(lot => (
                      <SelectItem key={lot.id} value={lot.id}>
                        {lot.name} — {formatCurrency(Number(lot.price))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={quantity}
                  onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>

              <div className="space-y-2">
                <Label>Forma de Pagamento</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                    <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Total</Label>
                <div className="h-10 flex items-center px-3 rounded-md border bg-muted font-bold">
                  {formatCurrency(totalAmount)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ex: nome do comprador, referência..."
                rows={2}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={!lotId || quantity < 1 || createSale.isPending}
            >
              {createSale.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <DollarSign className="h-4 w-4 mr-2" />
              )}
              Registrar Venda — {formatCurrency(totalAmount)}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Sales History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Histórico de Vendas</CardTitle>
          {sales && sales.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              Exportar CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : !sales?.length ? (
            <div className="text-center py-8">
              <ShoppingBag className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">Nenhuma venda de portaria registrada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sales.map(sale => (
                <div key={sale.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="min-w-0">
                    <p className="font-medium">{sale.lot?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sale.quantity}x {formatCurrency(Number(sale.unit_price))} • {sale.payment_method}
                    </p>
                    {sale.notes && (
                      <p className="text-xs text-muted-foreground truncate">{sale.notes}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold">{formatCurrency(Number(sale.total_amount))}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(sale.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
