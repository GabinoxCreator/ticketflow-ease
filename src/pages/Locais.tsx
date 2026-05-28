import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Plus, MoreVertical, Pencil, Trash2, Map as MapIcon } from 'lucide-react';
import { ProducerLayout } from '@/components/producer/ProducerLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useVenues, useSoftDeleteVenue, type Venue } from '@/hooks/useVenues';
import { VenueFormDialog } from '@/components/producer/venues/VenueFormDialog';

export default function Locais() {
  const navigate = useNavigate();
  const { data: venues, isLoading } = useVenues();
  const deleteMut = useSoftDeleteVenue();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Venue | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (v: Venue) => {
    setEditing(v);
    setDialogOpen(true);
  };

  return (
    <ProducerLayout>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
              <MapPin className="w-7 h-7 text-primary" />
              Locais
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cadastre locais reutilizáveis. Cada local pode ter vários mapas de assentos.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Novo local
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : !venues || venues.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Nenhum local cadastrado</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Crie seu primeiro local para começar a desenhar mapas de assentos
                  e usá-los em eventos do tipo Reservas ou Híbrido.
                </p>
              </div>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="w-4 h-4" /> Criar primeiro local
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {venues.map((v) => (
              <Card
                key={v.id}
                className="group hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => navigate(`/produtor/locais/${v.id}/mapas`)}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{v.name}</h3>
                      {(v.city || v.state) && (
                        <p className="text-xs text-muted-foreground truncate">
                          {[v.city, v.state].filter(Boolean).join(' / ')}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem onClick={() => openEdit(v)}>
                          <Pencil className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setConfirmDelete(v)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {v.address && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {v.address}
                    </p>
                  )}
                  <div className="flex items-center gap-2 pt-2 flex-wrap">
                    <Badge variant="secondary" className="gap-1">
                      <MapIcon className="w-3 h-3" />
                      {v.maps_count ?? 0} mapa{(v.maps_count ?? 0) === 1 ? '' : 's'}
                    </Badge>
                    {v.capacity != null && (
                      <Badge variant="outline">
                        cap. {v.capacity.toLocaleString('pt-BR')}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <VenueFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          venue={editing}
        />

        <AlertDialog
          open={!!confirmDelete}
          onOpenChange={(o) => !o && setConfirmDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover este local?</AlertDialogTitle>
              <AlertDialogDescription>
                O local "{confirmDelete?.name}" será desativado. Esta ação pode ser
                desfeita por suporte.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!confirmDelete) return;
                  try {
                    await deleteMut.mutateAsync(confirmDelete.id);
                  } catch {
                    /* toast in hook */
                  } finally {
                    setConfirmDelete(null);
                  }
                }}
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ProducerLayout>
  );
}
