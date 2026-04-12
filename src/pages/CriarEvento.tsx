import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2, Edit2, Flame, Users, Clock } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { ImageUpload } from '@/components/producer/ImageUpload';
import { TimeSelect } from '@/components/producer/TimeSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEvents } from '@/hooks/useEvents';
import { useEventLots, LotFormData } from '@/hooks/useEventLots';
import { cn } from '@/lib/utils';

const states = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const steps = [
  { id: 1, title: 'Informações Básicas' },
  { id: 2, title: 'Data e Local' },
  { id: 3, title: 'Ingressos' },
  { id: 4, title: 'Revisão' },
];

interface InlineLot {
  id: string;
  sector_name: string;
  name: string;
  description: string;
  price: number;
  total_quantity: number;
  sales_start_type: 'now' | 'scheduled' | 'after_lot';
  start_date?: string;
  starts_after_lot_id?: string;
  end_date?: string;
  group_ticket_enabled: boolean;
  group_ticket_quantity: number;
  fake_scarcity_enabled: boolean;
  fake_scarcity_percentage: number;
  is_active: boolean;
}

function createEmptyLot(index: number): InlineLot {
  return {
    id: crypto.randomUUID(),
    sector_name: 'Ingresso',
    name: `${index + 1}º Lote`,
    description: '',
    price: 0,
    total_quantity: 100,
    sales_start_type: 'now',
    group_ticket_enabled: false,
    group_ticket_quantity: 2,
    fake_scarcity_enabled: false,
    fake_scarcity_percentage: 50,
    is_active: true,
  };
}

export default function CriarEvento() {
  const navigate = useNavigate();
  const { createEvent } = useEvents();
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1 state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [isHot, setIsHot] = useState(false);

  // Step 2 state
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState('');
  const [venue, setVenue] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [address, setAddress] = useState('');

  // Step 3 state
  const [lots, setLots] = useState<InlineLot[]>([createEmptyLot(0)]);
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editingSectorName, setEditingSectorName] = useState('');

  // Errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = (step: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!title || title.length < 3) newErrors.title = 'O título deve ter pelo menos 3 caracteres';
    } else if (step === 2) {
      if (!startDate) newErrors.startDate = 'Selecione a data de início';
      if (!startTime) newErrors.startTime = 'Selecione o horário de início';
      if (!venue || venue.length < 2) newErrors.venue = 'Informe o local';
      if (!city || city.length < 2) newErrors.city = 'Informe a cidade';
      if (!state) newErrors.state = 'Selecione o estado';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const nextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 4));
    }
  };

  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const updateLot = (id: string, updates: Partial<InlineLot>) => {
    setLots((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  };

  const removeLot = (id: string) => {
    setLots((prev) => prev.filter((l) => l.id !== id));
  };

  const addLot = () => {
    setLots((prev) => [...prev, createEmptyLot(prev.length)]);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const handleSubmit = async (status: 'draft' | 'published') => {
    if (!startDate) return;

    const eventResult = await new Promise<any>((resolve, reject) => {
      createEvent.mutate(
        {
          title,
          description,
          date: format(startDate, 'yyyy-MM-dd'),
          time: startTime,
          end_date: endDate ? format(endDate, 'yyyy-MM-dd') : undefined,
          end_time: endTime || undefined,
          venue,
          city,
          state,
          address,
          category: 'Outros',
          image_url: imageUrl,
          is_hot: isHot,
          status,
        },
        {
          onSuccess: (data) => resolve(data),
          onError: (err) => reject(err),
        }
      );
    });

    // Create lots for the event
    if (eventResult?.id && lots.length > 0) {
      const { supabase } = await import('@/integrations/supabase/client');
      for (const lot of lots) {
        await supabase.from('event_lots').insert({
          event_id: eventResult.id,
          name: lot.name,
          description: lot.description || null,
          price: lot.price,
          total_quantity: lot.total_quantity,
          is_active: lot.is_active,
          sector_name: lot.sector_name,
          group_ticket_enabled: lot.group_ticket_enabled,
          group_ticket_quantity: lot.group_ticket_quantity,
          sales_start_type: lot.sales_start_type,
          start_date: lot.start_date || null,
          fake_scarcity_enabled: lot.fake_scarcity_enabled,
          fake_scarcity_percentage: lot.fake_scarcity_percentage,
        });
      }
    }

    navigate('/produtor/eventos');
  };

  return (
    <ProducerLayout
      breadcrumbs={[
        { label: 'Dashboard', href: '/produtor/dashboard' },
        { label: 'Meus Eventos', href: '/produtor/eventos' },
        { label: 'Criar Evento' },
      ]}
    >
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button variant="ghost" size="sm" onClick={() => navigate('/produtor/eventos')} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-3xl font-bold">Criar Novo Evento</h1>
          <p className="text-muted-foreground">Preencha as informações do seu evento</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                    currentStep >= step.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
                </div>
                {index < steps.length - 1 && (
                  <div className={cn('h-1 w-12 sm:w-24 mx-2 transition-colors', currentStep > step.id ? 'bg-primary' : 'bg-muted')} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {steps.map((step) => (
              <span key={step.id} className={cn('text-xs sm:text-sm', currentStep >= step.id ? 'text-foreground' : 'text-muted-foreground')}>
                {step.title}
              </span>
            ))}
          </div>
        </div>

        {/* Step 1: Basic Info */}
        {currentStep === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Título do Evento *</Label>
                <Input placeholder="Ex: Show de Rock na Praça" value={title} onChange={(e) => setTitle(e.target.value)} />
                {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
              </div>

              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea placeholder="Descreva todos os detalhes do seu evento..." rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Imagem do Evento</Label>
                <p className="text-sm text-muted-foreground">Recomendamos imagens com proporção 16:9 e resolução mínima de 1200x675 pixels.</p>
                <ImageUpload value={imageUrl} onChange={setImageUrl} />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <Label className="font-medium">Destacar como "Em Alta" 🔥</Label>
                  <p className="text-sm text-muted-foreground">Eventos em alta aparecem com destaque na página inicial</p>
                </div>
                <Switch checked={isHot} onCheckedChange={setIsHot} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Date and Location */}
        {currentStep === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Data e Local</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Start Date/Time */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data de Início *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'Selecione uma data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} disabled={(date) => date < new Date()} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                  {errors.startDate && <p className="text-sm text-destructive">{errors.startDate}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Horário de Início *</Label>
                  <TimeSelect value={startTime} onChange={setStartTime} placeholder="Selecione" />
                  {errors.startTime && <p className="text-sm text-destructive">{errors.startTime}</p>}
                </div>
              </div>

              {/* End Date/Time */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Data de Fim</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !endDate && 'text-muted-foreground')}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : 'Selecione (opcional)'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} disabled={(date) => startDate ? date < startDate : date < new Date()} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>Horário de Fim</Label>
                  <TimeSelect value={endTime} onChange={setEndTime} placeholder="Selecione (opcional)" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Local / Estabelecimento *</Label>
                <Input placeholder="Ex: Arena Show" value={venue} onChange={(e) => setVenue(e.target.value)} />
                {errors.venue && <p className="text-sm text-destructive">{errors.venue}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cidade *</Label>
                  <Input placeholder="Ex: São Paulo" value={city} onChange={(e) => setCity(e.target.value)} />
                  {errors.city && <p className="text-sm text-destructive">{errors.city}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Estado *</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger>
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent>
                      {states.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.state && <p className="text-sm text-destructive">{errors.state}</p>}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Endereço Completo</Label>
                <Input placeholder="Rua, número, bairro..." value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Tickets */}
        {currentStep === 3 && (
          <div className="space-y-4">
            {lots.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <p className="text-muted-foreground mb-4">Nenhum ingresso criado. Você pode criar o evento sem ingressos e adicioná-los depois.</p>
                </CardContent>
              </Card>
            )}

            {lots.map((lot, index) => (
              <Card key={lot.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {editingSectorId === lot.id ? (
                        <Input
                          value={editingSectorName}
                          onChange={(e) => setEditingSectorName(e.target.value)}
                          onBlur={() => {
                            updateLot(lot.id, { sector_name: editingSectorName || 'Ingresso' });
                            setEditingSectorId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              updateLot(lot.id, { sector_name: editingSectorName || 'Ingresso' });
                              setEditingSectorId(null);
                            }
                          }}
                          className="h-7 w-40 text-sm"
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => {
                            setEditingSectorId(lot.id);
                            setEditingSectorName(lot.sector_name);
                          }}
                        >
                          {lot.sector_name}
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    {lots.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeLot(lot.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Name & Description */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Nome do Ingresso *</Label>
                      <Input value={lot.name} onChange={(e) => updateLot(lot.id, { name: e.target.value })} placeholder="Ex: 1º Lote" />
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição (opcional)</Label>
                      <Input value={lot.description} onChange={(e) => updateLot(lot.id, { description: e.target.value })} placeholder="Descrição do ingresso" />
                    </div>
                  </div>

                  {/* Price & Quantity */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Preço (R$) *</Label>
                      <Input type="number" step="0.01" min="0" value={lot.price} onChange={(e) => updateLot(lot.id, { price: parseFloat(e.target.value) || 0 })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantidade Disponível *</Label>
                      <Input type="number" min="1" value={lot.total_quantity} onChange={(e) => updateLot(lot.id, { total_quantity: parseInt(e.target.value) || 1 })} />
                    </div>
                  </div>

                  {/* Sales Period */}
                  <div className="space-y-2">
                    <Label>Período de Vendas</Label>
                    <Select value={lot.sales_start_type} onValueChange={(v: 'now' | 'scheduled' | 'after_lot') => updateLot(lot.id, { sales_start_type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="now">Publicar agora</SelectItem>
                        <SelectItem value="scheduled">Agendar início</SelectItem>
                        {index > 0 && <SelectItem value="after_lot">Após encerrar ingresso</SelectItem>}
                      </SelectContent>
                    </Select>
                  </div>

                  {lot.sales_start_type === 'scheduled' && (
                    <div className="space-y-2">
                      <Label>Data de início das vendas</Label>
                      <Input type="datetime-local" value={lot.start_date || ''} onChange={(e) => updateLot(lot.id, { start_date: e.target.value })} />
                    </div>
                  )}

                  {lot.sales_start_type === 'after_lot' && index > 0 && (
                    <div className="space-y-2">
                      <Label>Iniciar após encerrar</Label>
                      <Select value={lot.starts_after_lot_id || ''} onValueChange={(v) => updateLot(lot.id, { starts_after_lot_id: v })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o ingresso" />
                        </SelectTrigger>
                        <SelectContent>
                          {lots.filter((l) => l.id !== lot.id).map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* End Date (optional) */}
                  {lot.end_date !== undefined ? (
                    <div className="space-y-2">
                      <Label>Data de fim das vendas</Label>
                      <Input type="datetime-local" value={lot.end_date || ''} onChange={(e) => updateLot(lot.id, { end_date: e.target.value })} />
                    </div>
                  ) : (
                    <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => updateLot(lot.id, { end_date: '' })}>
                      <Clock className="w-4 h-4 mr-1" />
                      + Adicionar horário de fim
                    </Button>
                  )}

                  {/* Group Ticket */}
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <Label className="font-medium text-sm">Ingresso em Grupo</Label>
                        <p className="text-xs text-muted-foreground">Uma venda gera múltiplos ingressos</p>
                      </div>
                    </div>
                    <Switch checked={lot.group_ticket_enabled} onCheckedChange={(v) => updateLot(lot.id, { group_ticket_enabled: v })} />
                  </div>

                  {lot.group_ticket_enabled && (
                    <div className="space-y-2 pl-4">
                      <Label>Quantidade de ingressos por compra</Label>
                      <Input type="number" min="2" max="10" value={lot.group_ticket_quantity} onChange={(e) => updateLot(lot.id, { group_ticket_quantity: parseInt(e.target.value) || 2 })} />
                    </div>
                  )}

                  {/* Fake Scarcity */}
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-orange-500" />
                      <div>
                        <Label className="font-medium text-sm">Escassez Fictícia</Label>
                        <p className="text-xs text-muted-foreground">Mostra barra de urgência</p>
                      </div>
                    </div>
                    <Switch checked={lot.fake_scarcity_enabled} onCheckedChange={(v) => updateLot(lot.id, { fake_scarcity_enabled: v })} />
                  </div>

                  {lot.fake_scarcity_enabled && (
                    <div className="space-y-3 pl-4">
                      <div className="flex items-center justify-between text-sm">
                        <Label>Porcentagem exibida</Label>
                        <span className="font-medium">{lot.fake_scarcity_percentage}%</span>
                      </div>
                      <Slider value={[lot.fake_scarcity_percentage]} onValueChange={([v]) => updateLot(lot.id, { fake_scarcity_percentage: v })} min={10} max={95} step={5} />
                      <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
                        <p className="text-xs text-muted-foreground">Preview:</p>
                        <div className="flex items-center gap-2 text-sm">
                          <Flame className="w-4 h-4 text-orange-500" />
                          <span className="font-medium">{lot.fake_scarcity_percentage}% vendido</span>
                        </div>
                        <Progress value={lot.fake_scarcity_percentage} className="h-2" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            <Button type="button" variant="outline" className="w-full" onClick={addLot}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Ingresso
            </Button>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Revisão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                {imageUrl && (
                  <div className="sm:col-span-2">
                    <img src={imageUrl} alt="Preview" className="w-full h-48 object-cover rounded-lg" />
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">Título</p>
                  <p className="font-medium">{title || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Data e Horário</p>
                  <p className="font-medium">
                    {startDate ? format(startDate, 'dd/MM/yyyy', { locale: ptBR }) : '-'} às {startTime || '-'}
                    {endDate && (<> até {format(endDate, 'dd/MM/yyyy', { locale: ptBR })} às {endTime || '-'}</>)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Local</p>
                  <p className="font-medium">{venue || '-'}, {city || '-'} - {state || '-'}</p>
                </div>
                {address && (
                  <div>
                    <p className="text-sm text-muted-foreground">Endereço</p>
                    <p className="font-medium">{address}</p>
                  </div>
                )}
                {description && (
                  <div className="sm:col-span-2">
                    <p className="text-sm text-muted-foreground">Descrição</p>
                    <p className="font-medium whitespace-pre-wrap">{description}</p>
                  </div>
                )}
              </div>

              {/* Lots summary */}
              {lots.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold">Ingressos ({lots.length})</h3>
                  {lots.map((lot) => (
                    <div key={lot.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="font-medium">{lot.sector_name} — {lot.name}</p>
                        <p className="text-sm text-muted-foreground">{lot.total_quantity} ingressos</p>
                      </div>
                      <p className="font-bold">{formatCurrency(lot.price)}</p>
                    </div>
                  ))}
                </div>
              )}

              {lots.length === 0 && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    ⚠️ Nenhum ingresso foi criado. Você poderá adicioná-los depois na edição do evento.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-8">
          <Button type="button" variant="outline" onClick={prevStep} disabled={currentStep === 1}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Anterior
          </Button>

          {currentStep < 4 ? (
            <Button type="button" onClick={nextStep}>
              Próximo
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => handleSubmit('draft')} disabled={createEvent.isPending}>
                Salvar Rascunho
              </Button>
              <Button type="button" onClick={() => handleSubmit('published')} disabled={createEvent.isPending}>
                {createEvent.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Publicando...
                  </>
                ) : (
                  'Publicar Evento'
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </ProducerLayout>
  );
}
