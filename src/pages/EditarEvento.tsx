import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, ArrowLeft, Loader2, Save, Eye, Trash2, Flame } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { ImageUpload } from '@/components/producer/ImageUpload';
import { LotManager } from '@/components/producer/LotManager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useEvent, useEvents } from '@/hooks/useEvents';
import { useEventLots } from '@/hooks/useEventLots';
import { cn } from '@/lib/utils';

const eventSchema = z.object({
  title: z.string().min(3, 'O título deve ter pelo menos 3 caracteres').max(100),
  short_description: z.string().max(200).optional(),
  description: z.string().optional(),
  date: z.date({ required_error: 'Selecione uma data' }),
  time: z.string().min(1, 'Informe o horário'),
  venue: z.string().min(2, 'Informe o local'),
  city: z.string().min(2, 'Informe a cidade'),
  state: z.string().min(2, 'Selecione o estado'),
  address: z.string().optional(),
  category: z.string().min(1, 'Selecione uma categoria'),
  is_hot: z.boolean().default(false),
  status: z.enum(['draft', 'published', 'cancelled', 'finished']).default('draft'),
  fake_scarcity_enabled: z.boolean().default(false),
  fake_scarcity_percentage: z.number().min(0).max(100).default(50),
});

type EventFormData = z.infer<typeof eventSchema>;

const categories = [
  'Festas e Shows',
  'Teatro e Cultura',
  'Esportes',
  'Congressos e Palestras',
  'Gastronomia',
  'Infantil',
  'Cursos e Workshops',
  'Outros',
];

const states = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const statusOptions = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'published', label: 'Publicado' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'finished', label: 'Finalizado' },
];

export default function EditarEvento() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: event, isLoading: isLoadingEvent } = useEvent(id);
  const { updateEvent, deleteEvent } = useEvents();
  const { lots, createLot, updateLot, deleteLot, isLoading: isLoadingLots } = useEventLots(id);
  
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: '',
      short_description: '',
      description: '',
      time: '',
      venue: '',
      city: '',
      state: '',
      address: '',
      category: '',
      is_hot: false,
      status: 'draft',
      fake_scarcity_enabled: false,
      fake_scarcity_percentage: 50,
    },
  });

  const { register, handleSubmit, formState: { errors, isDirty }, watch, setValue, reset } = form;
  const watchedValues = watch();

  // Load event data into form
  useEffect(() => {
    if (event) {
      reset({
        title: event.title,
        short_description: event.short_description || '',
        description: event.description || '',
        date: parseISO(event.date),
        time: event.time,
        venue: event.venue,
        city: event.city,
        state: event.state,
        address: event.address || '',
        category: event.category,
        is_hot: event.is_hot,
        status: event.status,
        fake_scarcity_enabled: event.fake_scarcity_enabled || false,
        fake_scarcity_percentage: event.fake_scarcity_percentage || 50,
      });
      setImageUrl(event.image_url || undefined);
    }
  }, [event, reset]);

  const onSubmit = async (data: EventFormData) => {
    if (!id) return;

    const eventData = {
      ...data,
      date: format(data.date, 'yyyy-MM-dd'),
      image_url: imageUrl,
      fake_scarcity_enabled: data.fake_scarcity_enabled,
      fake_scarcity_percentage: data.fake_scarcity_percentage,
    };

    updateEvent.mutate(
      { id, data: eventData },
      {
        onSuccess: () => {
          reset(data);
        },
      }
    );
  };

  const handleDelete = () => {
    if (!id) return;
    deleteEvent.mutate(id, {
      onSuccess: () => {
        navigate('/produtor/eventos');
      },
    });
  };

  if (isLoadingEvent) {
    return (
      <ProducerLayout>
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </ProducerLayout>
    );
  }

  if (!event) {
    return (
      <ProducerLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-4">Evento não encontrado</h2>
          <Button onClick={() => navigate('/produtor/eventos')}>
            Voltar para Meus Eventos
          </Button>
        </div>
      </ProducerLayout>
    );
  }

  return (
    <ProducerLayout
      breadcrumbs={[
        { label: 'Dashboard', href: '/produtor/dashboard' },
        { label: 'Meus Eventos', href: '/produtor/eventos' },
        { label: 'Editar Evento' },
      ]}
    >
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/produtor/eventos')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{event.title}</h1>
                <Badge
                  variant={
                    event.status === 'published'
                      ? 'default'
                      : event.status === 'cancelled'
                      ? 'destructive'
                      : 'secondary'
                  }
                >
                  {statusOptions.find((s) => s.value === event.status)?.label}
                </Badge>
              </div>
              <p className="text-muted-foreground">
                Edite as informações do seu evento
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(`/evento/${id}`)}
            >
              <Eye className="w-4 h-4 mr-2" />
              Visualizar
            </Button>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          </div>
        </div>

        <Tabs defaultValue="info" className="space-y-6">
          <TabsList>
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="lots">
              Lotes ({lots?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Informações Básicas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="title">Título *</Label>
                      <Input id="title" {...register('title')} />
                      {errors.title && (
                        <p className="text-sm text-destructive">{errors.title.message}</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="category">Categoria *</Label>
                      <Select
                        value={watchedValues.category}
                        onValueChange={(value) => setValue('category', value, { shouldDirty: true })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="short_description">Descrição Curta</Label>
                    <Input
                      id="short_description"
                      maxLength={200}
                      {...register('short_description')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Descrição Completa</Label>
                    <Textarea
                      id="description"
                      rows={5}
                      {...register('description')}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Date and Location */}
              <Card>
                <CardHeader>
                  <CardTitle>Data e Local</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Data *</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !watchedValues.date && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {watchedValues.date
                              ? format(watchedValues.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
                              : 'Selecione'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={watchedValues.date}
                            onSelect={(date) => setValue('date', date as Date, { shouldDirty: true })}
                            initialFocus
                            className="pointer-events-auto"
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="time">Horário *</Label>
                      <Input id="time" type="time" {...register('time')} />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="venue">Local *</Label>
                    <Input id="venue" {...register('venue')} />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="city">Cidade *</Label>
                      <Input id="city" {...register('city')} />
                    </div>

                    <div className="space-y-2">
                      <Label>Estado *</Label>
                      <Select
                        value={watchedValues.state}
                        onValueChange={(value) => setValue('state', value, { shouldDirty: true })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {states.map((state) => (
                            <SelectItem key={state} value={state}>
                              {state}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço</Label>
                    <Input id="address" {...register('address')} />
                  </div>
                </CardContent>
              </Card>

              {/* Image and Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Imagem e Configurações</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ImageUpload value={imageUrl} onChange={setImageUrl} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <Label htmlFor="is_hot" className="font-medium">
                          Destacar 🔥
                        </Label>
                        <p className="text-sm text-muted-foreground">
                          Aparecer em destaque
                        </p>
                      </div>
                      <Switch
                        id="is_hot"
                        checked={watchedValues.is_hot}
                        onCheckedChange={(checked) => setValue('is_hot', checked, { shouldDirty: true })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select
                        value={watchedValues.status}
                        onValueChange={(value: any) => setValue('status', value, { shouldDirty: true })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((status) => (
                            <SelectItem key={status.value} value={status.value}>
                              {status.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Fake Scarcity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-500" />
                    Barra de Escassez (Marketing)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <Label htmlFor="fake_scarcity" className="font-medium">
                        Ativar barra fictícia
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Mostra uma porcentagem de vendas personalizada
                      </p>
                    </div>
                    <Switch
                      id="fake_scarcity"
                      checked={watchedValues.fake_scarcity_enabled}
                      onCheckedChange={(checked) => setValue('fake_scarcity_enabled', checked, { shouldDirty: true })}
                    />
                  </div>

                  {watchedValues.fake_scarcity_enabled && (
                    <>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label>Porcentagem exibida</Label>
                          <span className="font-bold text-lg text-primary">
                            {watchedValues.fake_scarcity_percentage}%
                          </span>
                        </div>
                        <Slider
                          value={[watchedValues.fake_scarcity_percentage || 50]}
                          onValueChange={(value) => setValue('fake_scarcity_percentage', value[0], { shouldDirty: true })}
                          min={0}
                          max={100}
                          step={1}
                          className="w-full"
                        />
                      </div>

                      {/* Preview */}
                      <div className="p-4 bg-secondary/50 rounded-xl space-y-3">
                        <p className="text-sm font-medium text-muted-foreground">
                          Preview (como aparece no site):
                        </p>
                        <div className="bg-card rounded-lg p-4 border">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Flame className="w-4 h-4 text-orange-500" />
                              <span className="font-medium text-sm">
                                {watchedValues.fake_scarcity_percentage}% vendido
                              </span>
                            </div>
                            <span className="text-muted-foreground text-xs">
                              Restam poucos!
                            </span>
                          </div>
                          <Progress 
                            value={watchedValues.fake_scarcity_percentage || 50} 
                            className="h-2"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Save Button */}
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={!isDirty && imageUrl === event.image_url || updateEvent.isPending}
                >
                  {updateEvent.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Salvar Alterações
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="lots">
            <LotManager
              lots={lots || []}
              onAdd={(data) => createLot.mutate(data)}
              onUpdate={(lotId, data) => updateLot.mutate({ id: lotId, data })}
              onDelete={(lotId) => deleteLot.mutate(lotId)}
              isLoading={isLoadingLots}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir evento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O evento "{event.title}" e todos
              os seus lotes serão permanentemente excluídos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProducerLayout>
  );
}
