import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Users, Plus, Pencil, Trash2, Power, PowerOff, Calendar, Copy, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { ENDERECO_DO_COLABORADOR, textoDoAcesso, linkDoWhatsApp } from '@/lib/acessoDoColaborador';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { CabecalhoDaPagina } from '@/components/producer/CabecalhoDaPagina';
import { AcoesComNome } from '@/components/producer/AcoesComNome';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useCollaborators, useCollaboratorEvents, Collaborator } from '@/hooks/useCollaborators';
import { useEvents } from '@/hooks/useEvents';

/**
 * Logo depois de criar: o acesso pronto para mandar (OS-408 etapa 5, item 5.3). Endereço
 * completo, "Copiar acesso" e "Enviar pelo WhatsApp" (o produtor escolhe o contato). A
 * senha só existe aqui: fechou, não volta.
 */
function AcessoPronto({ nome, texto, onClose }: { nome: string; texto: string; onClose: () => void }) {
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Acesso copiado');
    } catch {
      toast.message('Copie o acesso', { description: texto });
    }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Mande o acesso para {nome}. A senha só aparece agora.</p>
      <div className="rounded-lg border bg-muted/30 p-3 text-sm whitespace-pre-wrap break-words" data-testid="acesso-do-colaborador">
        {texto}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" onClick={copiar} className="gap-2">
          <Copy className="w-4 h-4" /> Copiar acesso
        </Button>
        <Button asChild type="button" className="gap-2 bg-[#25D366] hover:bg-[#1ebe57] text-white">
          <a href={linkDoWhatsApp(texto)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="w-4 h-4" /> Enviar pelo WhatsApp
          </a>
        </Button>
      </div>
      <div className="flex justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>Fechar</Button>
      </div>
    </div>
  );
}

function AddCollaboratorDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  // Depois de criar, a mesma janela mostra o acesso pronto (a senha só existe aqui).
  const [acesso, setAcesso] = useState<string | null>(null);
  
  const { createCollaborator } = useCollaborators();
  const { events, isLoading: eventsLoading } = useEvents();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const criado = await createCollaborator.mutateAsync({
      name,
      username,
      password,
      eventIds: selectedEvents,
    });
    // O servidor guarda o usuário em minúsculas e sem espaço nas pontas: vale o que ele devolveu.
    const usuario = (criado && typeof criado.username === 'string' && criado.username) || username.trim().toLowerCase();
    const nomesDosEventos = events.filter((ev) => selectedEvents.includes(ev.id)).map((ev) => ev.title);
    setAcesso(textoDoAcesso({ eventos: nomesDosEventos, usuario, senha: password }));
  };

  if (acesso) return <AcessoPronto nome={name} texto={acesso} onClose={onClose} />;

  const toggleEvent = (eventId: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome do Colaborador</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: João Silva"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">Usuário (para login)</Label>
        <Input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
          placeholder="Ex: joao123"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha (mínimo 6 caracteres)</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mínimo 6 caracteres"
          required
          minLength={6}
        />
      </div>
      <div className="space-y-2">
        <Label>Eventos que o colaborador terá acesso</Label>
        <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
          {eventsLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento encontrado</p>
          ) : (
            events.map((event) => (
              <div key={event.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`event-${event.id}`}
                  checked={selectedEvents.includes(event.id)}
                  onCheckedChange={() => toggleEvent(event.id)}
                />
                <label
                  htmlFor={`event-${event.id}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {event.title}
                </label>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={createCollaborator.isPending}>
          {createCollaborator.isPending ? 'Criando...' : 'Criar Colaborador'}
        </Button>
      </div>
    </form>
  );
}

function ManageEventsDialog({ collaborator, onClose }: { collaborator: Collaborator; onClose: () => void }) {
  const { assignedEvents, assignEvent, unassignEvent } = useCollaboratorEvents(collaborator.id);
  const { events, isLoading: eventsLoading } = useEvents();

  const assignedEventIds = assignedEvents.map(ae => ae.event_id);

  const handleToggle = async (eventId: string) => {
    if (assignedEventIds.includes(eventId)) {
      await unassignEvent.mutateAsync(eventId);
    } else {
      await assignEvent.mutateAsync(eventId);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Selecione os eventos que {collaborator.name} terá acesso:
      </p>
      <div className="border rounded-lg p-3 max-h-64 overflow-y-auto space-y-2">
        {eventsLoading ? (
          <Skeleton className="h-8 w-full" />
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum evento encontrado</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex items-center space-x-2">
              <Checkbox
                id={`manage-event-${event.id}`}
                checked={assignedEventIds.includes(event.id)}
                onCheckedChange={() => handleToggle(event.id)}
                disabled={assignEvent.isPending || unassignEvent.isPending}
              />
              <label
                htmlFor={`manage-event-${event.id}`}
                className="text-sm cursor-pointer flex-1"
              >
                {event.title}
              </label>
            </div>
          ))
        )}
      </div>
      <div className="flex justify-end">
        <Button onClick={onClose}>Fechar</Button>
      </div>
    </div>
  );
}

function CollaboratorCard({ collaborator }: { collaborator: Collaborator }) {
  const [showEvents, setShowEvents] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const { updateCollaborator, deleteCollaborator } = useCollaborators();
  const { assignedEvents } = useCollaboratorEvents(collaborator.id);

  const handleToggleActive = () => {
    updateCollaborator.mutate({
      id: collaborator.id,
      is_active: !collaborator.is_active,
    });
  };

  const handleDelete = () => {
    deleteCollaborator.mutate(collaborator.id);
    setShowDelete(false);
  };

  return (
    <Card className={!collaborator.is_active ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{collaborator.name}</h3>
              <Badge variant={collaborator.is_active ? 'default' : 'secondary'}>
                {collaborator.is_active ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">@{collaborator.username}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {assignedEvents.length} evento(s) vinculado(s)
            </p>
          </div>
          <AcoesComNome
            de={`o colaborador ${collaborator.name}`}
            acoes={[
              { nome: 'Eventos', icone: Calendar, onClick: () => setShowEvents(true) },
              collaborator.is_active
                ? { nome: 'Desativar', icone: PowerOff, onClick: handleToggleActive }
                : { nome: 'Ativar', icone: Power, onClick: handleToggleActive },
              { nome: 'Excluir', icone: Trash2, perigo: true, onClick: () => setShowDelete(true) },
            ]}
          />
          <Dialog open={showEvents} onOpenChange={setShowEvents}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Eventos de {collaborator.name}</DialogTitle>
              </DialogHeader>
              <ManageEventsDialog
                collaborator={collaborator}
                onClose={() => setShowEvents(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Colaborador</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {collaborator.name}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function ColaboradoresManager() {
  const [showAdd, setShowAdd] = useState(false);
  const { collaborators, isLoading } = useCollaborators();

  return (
    <ProducerLayout>
      <Helmet>
        <title>Colaboradores | FestPag</title>
      </Helmet>
      <div className="space-y-6">
        <CabecalhoDaPagina
          icone={Users}
          titulo="Colaboradores"
          descricao="Gerencie os colaboradores que podem validar ingressos na portaria"
          acao={
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="w-4 h-4" />
                Adicionar Colaborador
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo Colaborador</DialogTitle>
              </DialogHeader>
              <AddCollaboratorDialog onClose={() => setShowAdd(false)} />
            </DialogContent>
          </Dialog>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Como funciona</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>1. Crie um colaborador com um nome de usuário e senha</p>
            <p>2. Vincule os eventos que ele terá acesso</p>
            <p>3. Compartilhe as credenciais com o colaborador</p>
            <p>
              4. O colaborador acessa{' '}
              <a href={ENDERECO_DO_COLABORADOR} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline underline-offset-2 break-all">
                {ENDERECO_DO_COLABORADOR}
              </a>{' '}
              para fazer login e validar ingressos
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : collaborators.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium mb-2">Nenhum colaborador cadastrado</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Adicione colaboradores para ajudar na validação de ingressos
              </p>
              <Button onClick={() => setShowAdd(true)} className="gap-2">
                <Plus className="w-4 h-4" />
                Adicionar Colaborador
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {collaborators.map((collaborator) => (
              <CollaboratorCard key={collaborator.id} collaborator={collaborator} />
            ))}
          </div>
        )}
      </div>
    </ProducerLayout>
  );
}
