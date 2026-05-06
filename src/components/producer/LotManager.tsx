import { useState, useEffect, useRef } from 'react';
import { Plus, Edit, Edit2, Trash2, Flame, Users, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EventLot, LotFormData } from '@/hooks/useEventLots';
import { cn } from '@/lib/utils';

interface LotManagerProps {
  lots: EventLot[];
  onAdd: (data: LotFormData) => void;
  onUpdate: (id: string, data: Partial<LotFormData>) => void;
  onDelete: (id: string) => void;
  isLoading?: boolean;
}

const emptyLot: LotFormData = {
  name: '',
  price: 0,
  total_quantity: 100,
  is_active: true,
  fake_scarcity_enabled: false,
  fake_scarcity_percentage: 50,
  sector_name: 'Ingresso',
  group_ticket_enabled: false,
  group_ticket_quantity: 2,
  sales_start_type: 'now',
};

type Flow = 'new_sector' | 'add_to_sector' | 'edit';

export function LotManager({ lots, onAdd, onUpdate, onDelete, isLoading }: LotManagerProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<EventLot | null>(null);
  const [formData, setFormData] = useState<LotFormData>(emptyLot);
  const [flow, setFlow] = useState<Flow>('add_to_sector');
  const [step, setStep] = useState<1 | 2>(2);
  // Etapa 1 — escolha de setor: 'existing' usa select, 'new' usa input
  const [sectorChoice, setSectorChoice] = useState<'existing' | 'new'>('new');
  const [sectorSelected, setSectorSelected] = useState<string>('');
  const [sectorNewName, setSectorNewName] = useState<string>('');

  // Lista de setores únicos existentes
  const existingSectors = Array.from(
    new Set((lots || []).map((l) => (l.sector_name?.trim() || 'Ingresso')))
  );

  const buildDefaultLotName = (sector: string) => {
    const lotsInSector = (lots || []).filter(
      (l) => (l.sector_name?.trim() || 'Ingresso') === sector
    ).length;
    return `${lotsInSector + 1}º Lote`;
  };

  const handleOpenDialog = (lot?: EventLot, presetSector?: string, mode?: 'new_sector') => {
    if (lot) {
      setEditingLot(lot);
      setFlow('edit');
      setStep(2);
      setFormData({
        name: lot.name,
        price: lot.price,
        original_price: lot.original_price || undefined,
        total_quantity: lot.total_quantity,
        start_date: lot.start_date || undefined,
        end_date: lot.end_date || undefined,
        description: lot.description || undefined,
        is_active: lot.is_active,
        fake_scarcity_enabled: lot.fake_scarcity_enabled || false,
        fake_scarcity_percentage: lot.fake_scarcity_percentage || 50,
        sector_name: lot.sector_name || 'Ingresso',
        group_ticket_enabled: lot.group_ticket_enabled || false,
        group_ticket_quantity: lot.group_ticket_quantity || 2,
        sales_start_type: lot.sales_start_type || 'now',
        starts_after_lot_id: lot.starts_after_lot_id || null,
      });
    } else if (mode === 'new_sector') {
      // Fluxo "Novo Setor" — abre etapa 1
      setEditingLot(null);
      setFlow('new_sector');
      setStep(1);
      const hasExisting = existingSectors.length > 0;
      setSectorChoice(hasExisting ? 'existing' : 'new');
      setSectorSelected(hasExisting ? existingSectors[0] : '');
      setSectorNewName('');
      setFormData({ ...emptyLot, sector_name: '', name: '' });
    } else {
      // Fluxo "Novo Ingresso" dentro de um setor — direto na etapa 2
      setEditingLot(null);
      setFlow('add_to_sector');
      setStep(2);
      const sector = presetSector || existingSectors[0] || 'Ingresso';
      setFormData({
        ...emptyLot,
        sector_name: sector,
        name: buildDefaultLotName(sector),
      });
    }
    setIsDialogOpen(true);
  };

  const handleStep1Continue = () => {
    const sector =
      sectorChoice === 'existing' ? sectorSelected.trim() : sectorNewName.trim();
    if (!sector) return;
    setFormData({
      ...formData,
      sector_name: sector,
      name: buildDefaultLotName(sector),
    });
    setStep(2);
  };

  // Group lots by sector_name (preserve insertion order; "Ingresso" first)
  const groupedLots = (() => {
    const groups = new Map<string, EventLot[]>();
    for (const lot of lots) {
      const key = (lot.sector_name?.trim() || 'Ingresso');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(lot);
    }
    const entries = Array.from(groups.entries());
    entries.sort(([a], [b]) => {
      if (a === 'Ingresso') return -1;
      if (b === 'Ingresso') return 1;
      return 0;
    });
    return entries;
  })();

  const handleSubmit = () => {
    if (editingLot) {
      onUpdate(editingLot.id, formData);
    } else {
      onAdd(formData);
    }
    setIsDialogOpen(false);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Ingressos</h3>
        <Button onClick={() => handleOpenDialog(undefined, undefined, 'new_sector')} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Novo Ingresso
        </Button>
      </div>

      {lots.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-muted-foreground mb-4">
              Nenhum ingresso criado ainda. Adicione um ingresso para começar a vender.
            </p>
            <Button onClick={() => handleOpenDialog(undefined, undefined, 'new_sector')} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeiro Ingresso
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedLots.map(([sectorName, sectorLots]) => (
            <Card key={sectorName} className="bg-card/50">
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-base uppercase tracking-wide">{sectorName}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sectorLots.length} {sectorLots.length === 1 ? 'lote' : 'lotes'}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleOpenDialog(undefined, sectorName)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Novo Lote
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {sectorLots.map((lot) => (
                    <Card key={lot.id} className={cn('bg-background', !lot.is_active && 'opacity-60')}>
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">{lot.name}</CardTitle>
                            {!lot.is_active && <span className="text-xs text-muted-foreground">Inativo</span>}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(lot)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(lot.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold">{formatCurrency(lot.price)}</span>
                            {lot.original_price && lot.original_price > lot.price && (
                              <span className="text-sm text-muted-foreground line-through">{formatCurrency(lot.original_price)}</span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">{lot.sold_quantity}</span> / {lot.total_quantity} vendidos
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${Math.min((lot.sold_quantity / lot.total_quantity) * 100, 100)}%` }} />
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            {lot.group_ticket_enabled && (
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <Users className="w-3 h-3" /> Grupo ({lot.group_ticket_quantity})
                              </span>
                            )}
                          </div>

                          {/* Controle inline de escassez */}
                          <InlineScarcityControl lot={lot} onUpdate={onUpdate} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingLot
                ? 'Editar Lote'
                : sectorMode === 'new_sector'
                ? 'Novo Ingresso'
                : `Novo Lote em ${formData.sector_name || ''}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Sector */}
            <div className="space-y-2">
              <Label>{sectorMode === 'new_sector' ? 'Nome do Ingresso (Setor) *' : 'Ingresso (Setor) *'}</Label>
              {sectorMode === 'new_sector' ? (
                <Input
                  placeholder="Ex: Pista, Camarote, Área VIP"
                  value={formData.sector_name || ''}
                  onChange={(e) => setFormData({ ...formData, sector_name: e.target.value })}
                />
              ) : (
                <Select
                  value={formData.sector_name || ''}
                  onValueChange={(v) => {
                    if (v === '__new__') {
                      setSectorMode('new_sector');
                      setFormData({ ...formData, sector_name: '' });
                    } else {
                      setFormData({ ...formData, sector_name: v });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um setor" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingSectors.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Criar novo setor…</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label>Nome do Lote *</Label>
              <Input
                placeholder="Ex: 1º Lote"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Price & Original Price */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preço (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={formData.price} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Preço Original</Label>
                <Input type="number" step="0.01" min="0" value={formData.original_price || ''} onChange={(e) => setFormData({ ...formData, original_price: parseFloat(e.target.value) || undefined })} />
              </div>
            </div>

            {/* Quantity */}
            <div className="space-y-2">
              <Label>Quantidade *</Label>
              <Input type="number" min="1" value={formData.total_quantity} onChange={(e) => setFormData({ ...formData, total_quantity: parseInt(e.target.value) || 1 })} />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea placeholder="Descrição do lote (opcional)" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>

            {/* Active */}
            <div className="flex items-center justify-between">
              <Label>Lote Ativo</Label>
              <Switch checked={formData.is_active} onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })} />
            </div>

            {/* Sales Start Type */}
            <div className="border-t pt-4 space-y-3">
              <Label className="font-medium">Período de Vendas</Label>
              <Select value={formData.sales_start_type || 'now'} onValueChange={(v) => setFormData({ ...formData, sales_start_type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="now">Publicar agora</SelectItem>
                  <SelectItem value="scheduled">Agendar início</SelectItem>
                  <SelectItem value="after_lot">Após encerrar outro lote</SelectItem>
                </SelectContent>
              </Select>

              {formData.sales_start_type === 'scheduled' && (
                <div className="space-y-2">
                  <Label>Data de início</Label>
                  <Input type="datetime-local" value={formData.start_date || ''} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                </div>
              )}

              {formData.sales_start_type === 'after_lot' && lots.length > 0 && (
                <div className="space-y-2">
                  <Label>Iniciar após encerrar</Label>
                  <Select value={formData.starts_after_lot_id || ''} onValueChange={(v) => setFormData({ ...formData, starts_after_lot_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o lote" />
                    </SelectTrigger>
                    <SelectContent>
                      {lots.filter((l) => l.id !== editingLot?.id).map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Group Ticket */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <Label className="font-medium text-sm">Ingresso em Grupo</Label>
                </div>
                <Switch checked={formData.group_ticket_enabled} onCheckedChange={(v) => setFormData({ ...formData, group_ticket_enabled: v })} />
              </div>
              {formData.group_ticket_enabled && (
                <div className="space-y-2 pl-6">
                  <Label>Ingressos por compra</Label>
                  <Input type="number" min="2" max="10" value={formData.group_ticket_quantity || 2} onChange={(e) => setFormData({ ...formData, group_ticket_quantity: parseInt(e.target.value) || 2 })} />
                </div>
              )}
            </div>

            {/* Fake Scarcity */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <Label className="font-medium text-sm">Escassez Fictícia</Label>
                </div>
                <Switch checked={formData.fake_scarcity_enabled} onCheckedChange={(v) => setFormData({ ...formData, fake_scarcity_enabled: v })} />
              </div>
              {formData.fake_scarcity_enabled && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <Label>Porcentagem exibida</Label>
                      <span className="font-medium">{formData.fake_scarcity_percentage}%</span>
                    </div>
                    <Slider value={[formData.fake_scarcity_percentage || 50]} onValueChange={([v]) => setFormData({ ...formData, fake_scarcity_percentage: v })} min={10} max={95} step={5} />
                  </div>
                  <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                    <p className="text-xs text-muted-foreground">Preview:</p>
                    <div className="flex items-center gap-2 text-sm">
                      <Flame className="w-4 h-4 text-orange-500" />
                      <span className="font-medium">{formData.fake_scarcity_percentage}% vendido</span>
                    </div>
                    <Progress value={formData.fake_scarcity_percentage} className="h-2" />
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={!formData.name || formData.price <= 0}>
              {editingLot ? 'Salvar' : 'Criar Lote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface InlineScarcityControlProps {
  lot: EventLot;
  onUpdate: (id: string, data: Partial<LotFormData>) => void;
}

function InlineScarcityControl({ lot, onUpdate }: InlineScarcityControlProps) {
  const [localValue, setLocalValue] = useState(lot.fake_scarcity_percentage || 50);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local value when lot changes externally
  useEffect(() => {
    setLocalValue(lot.fake_scarcity_percentage || 50);
  }, [lot.fake_scarcity_percentage]);

  const handleChange = (v: number) => {
    setLocalValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(lot.id, { fake_scarcity_percentage: v });
    }, 600);
  };

  if (!lot.fake_scarcity_enabled) {
    return (
      <button
        type="button"
        onClick={() => onUpdate(lot.id, { fake_scarcity_enabled: true, fake_scarcity_percentage: 50 })}
        className="inline-flex items-center gap-1 text-xs text-orange-500/80 hover:text-orange-500 transition mt-1"
      >
        <Flame className="w-3 h-3" /> Ativar escassez
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-400">
          <Flame className="w-3.5 h-3.5" /> Escassez exibida
        </span>
        <span className="text-sm font-bold text-orange-400">{localValue}%</span>
      </div>
      <Slider
        value={[localValue]}
        onValueChange={([v]) => handleChange(v)}
        min={10}
        max={95}
        step={5}
      />
      <button
        type="button"
        onClick={() => onUpdate(lot.id, { fake_scarcity_enabled: false })}
        className="text-[11px] text-muted-foreground hover:text-foreground transition"
      >
        Desativar
      </button>
    </div>
  );
}
