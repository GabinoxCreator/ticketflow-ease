import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Armchair,
  MoreVertical,
  Map as MapIcon,
} from 'lucide-react';
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
import { useVenueById } from '@/hooks/useVenues';
import {
  useTableMaps,
  useSoftDeleteTableMap,
  type TableMap,
} from '@/hooks/useTableMaps';
import { TableMapFormDialog } from '@/components/producer/venues/TableMapFormDialog';

export default function LocaisMapas() {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const { data: venue } = useVenueById(venueId);
  const { data: maps, isLoading } = useTableMaps(venueId);
  const deleteMut = useSoftDeleteTableMap();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TableMap | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TableMap | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (m: TableMap) => {
    setEditing(m);
    setDialogOpen(true);
  };
  const openEditor = (m: TableMap) => {
    navigate(`/produtor/locais/${venueId}/mapas/${m.id}/editor`);
  };

  return (
    <ProducerLayout>
      <div className="p-4 md:p-8 space-y-6">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link to="/produtor/locais">
              <ArrowLeft className="w-4 h-4 mr-1" /> Locais
            </Link>
          </Button>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold truncate">
                {venue?.name ?? 'Carregando...'}
              </h1>
              {venue && (venue.city || venue.state || venue.address) && (
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {[venue.address, venue.city, venue.state]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
            <Button onClick={openCreate} className="gap-2" disabled={!venueId}>
              <Plus className="w-4 h-4" /> Novo mapa
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : !maps || maps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <MapIcon className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold">Nenhum mapa criado</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Crie um mapa para desenhar a disposição dos assentos deste local.
                </p>
              </div>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="w-4 h-4" /> Criar primeiro mapa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {maps.map((m) => (
              <Card
                key={m.id}
                className="group hover:border-primary/40 transition-colors cursor-pointer overflow-hidden"
                onClick={() => openEditor(m)}
              >
                <div
                  className="h-20 w-full border-b"
                  style={{ backgroundColor: m.background_color ?? '#ffffff' }}
                  aria-hidden
                />
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{m.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                        {m.orientation === 'landscape' ? 'Paisagem' : 'Retrato'}{' '}
                        · {m.canvas_width}×{m.canvas_height}
                      </p>
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
                        <DropdownMenuItem onClick={() => openEdit(m)}>
                          <Pencil className="w-4 h-4 mr-2" /> Renomear / cor
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setConfirmDelete(m)}
                        >
                          <Trash2 className="w-4 h-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant="secondary" className="gap-1">
                      <Armchair className="w-3 h-3" />
                      {m.seats_count ?? 0} assento
                      {(m.seats_count ?? 0) === 1 ? '' : 's'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {venueId && (
          <TableMapFormDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            venueId={venueId}
            map={editing}
          />
        )}

        <AlertDialog
          open={!!confirmDelete}
          onOpenChange={(o) => !o && setConfirmDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover este mapa?</AlertDialogTitle>
              <AlertDialogDescription>
                O mapa "{confirmDelete?.name}" será desativado. Esta ação pode ser
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
