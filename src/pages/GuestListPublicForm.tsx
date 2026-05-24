import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Users
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface GuestListData {
  id: string;
  name: string;
  valid_until_time: string;
  is_active: boolean;
  max_guests: number | null;
  event: {
    id: string;
    title: string;
    date: string;
    time: string;
    venue: string;
    city: string;
    state: string;
    image_url: string | null;
  };
  entries_count: number;
}

export default function GuestListPublicForm() {
  const { slug } = useParams<{ slug: string }>();
  const [listData, setListData] = useState<GuestListData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    async function fetchListData() {
      if (!slug) return;

      try {
        const { data: list, error: listError } = await supabase
          .from('guest_lists')
          .select(`
            id,
            name,
            valid_until_time,
            is_active,
            max_guests,
            event:events (
              id,
              title,
              date,
              time,
              venue,
              city,
              state,
              image_url
            )
          `)
          .eq('public_slug', slug)
          .maybeSingle();

        if (listError) throw listError;

        if (!list) {
          setError('Lista não encontrada');
          return;
        }

        // Get entries count
        const { count } = await supabase
          .from('guest_list_entries')
          .select('*', { count: 'exact', head: true })
          .eq('guest_list_id', list.id);

        // Transform event to match expected type
        const eventData = Array.isArray(list.event) ? list.event[0] : list.event;
        
        setListData({
          ...list,
          event: eventData,
          entries_count: count || 0,
        });
      } catch (err) {
        console.error('Error fetching list:', err);
        setError('Erro ao carregar lista');
      } finally {
        setIsLoading(false);
      }
    }

    fetchListData();
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!guestName.trim()) {
      toast.error('Digite seu nome');
      return;
    }

    if (!listData) return;

    setIsSubmitting(true);

    try {
      const response = await supabase.functions.invoke('public-guest-list-signup', {
        body: { slug, name: guestName.trim() },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Erro ao inscrever');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      setIsSuccess(true);
      toast.success('Inscrição realizada com sucesso!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao realizar inscrição');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isListValid = () => {
    if (!listData) return false;
    if (!listData.is_active) return false;
    if (listData.max_guests && listData.entries_count >= listData.max_guests) return false;
    
    // Check if current time is before valid_until_time on event date
    const now = new Date();
    const eventDate = new Date(`${listData.event.date}T12:00:00`);
    const [hours, minutes] = listData.valid_until_time.split(':').map(Number);
    
    const validUntil = new Date(eventDate);
    validUntil.setHours(hours, minutes, 0, 0);

    // If event is today, check time
    if (now.toDateString() === eventDate.toDateString()) {
      return now < validUntil;
    }
    
    // If event is in the future, list is valid
    return eventDate > now;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <Skeleton className="h-48 w-full rounded-t-lg" />
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !listData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Lista não encontrada</h1>
          <p className="text-muted-foreground">
            O link que você acessou não é válido ou a lista foi removida.
          </p>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Helmet>
          <title>Inscrição Confirmada | {listData.event.title}</title>
        </Helmet>
        
        <Card className="w-full max-w-md p-8 text-center">
          <div className="p-4 rounded-full bg-green-500/10 w-fit mx-auto mb-4">
            <CheckCircle className="h-12 w-12 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Inscrição Confirmada!</h1>
          <p className="text-muted-foreground mb-4">
            Você está na lista <strong>{listData.name}</strong> do evento
          </p>
          <p className="font-semibold text-lg mb-6">{listData.event.title}</p>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-center justify-center gap-2">
              <Calendar className="h-4 w-4" />
              {format(new Date(`${listData.event.date}T12:00:00`), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </div>
            <div className="flex items-center justify-center gap-2">
              <Clock className="h-4 w-4" />
              Válida até às {listData.valid_until_time.slice(0, 5)}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const valid = isListValid();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Helmet>
        <title>{listData.name} | {listData.event.title}</title>
        <meta name="description" content={`Inscreva-se na lista ${listData.name} do evento ${listData.event.title}`} />
      </Helmet>

      <Card className="w-full max-w-md overflow-hidden">
        {listData.event.image_url && (
          <div className="relative h-48 overflow-hidden">
            <img
              src={listData.event.image_url}
              alt={listData.event.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <h1 className="text-xl font-bold">{listData.event.title}</h1>
            </div>
          </div>
        )}

        <CardContent className="p-6 space-y-6">
          {!listData.event.image_url && (
            <h1 className="text-xl font-bold">{listData.event.title}</h1>
          )}

          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              {format(new Date(`${listData.event.date}T12:00:00`), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })} às {listData.event.time.slice(0, 5)}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {listData.event.venue}, {listData.event.city} - {listData.event.state}
            </div>
          </div>

          <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <span className="font-semibold">{listData.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Válida até às {listData.valid_until_time.slice(0, 5)}
            </div>
            {listData.max_guests && (
              <div className="text-sm text-muted-foreground">
                {listData.entries_count} / {listData.max_guests} vagas preenchidas
              </div>
            )}
          </div>

          {valid ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Seu nome completo</Label>
                <Input
                  id="name"
                  placeholder="Digite seu nome"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              <Button 
                type="submit" 
                className="w-full" 
                size="lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Inscrevendo...' : 'Entrar na Lista'}
              </Button>
            </form>
          ) : (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-center">
              <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
              <p className="font-medium text-destructive">
                {!listData.is_active 
                  ? 'Esta lista está fechada' 
                  : listData.max_guests && listData.entries_count >= listData.max_guests
                    ? 'Esta lista está cheia'
                    : 'O prazo para inscrição expirou'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
