import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import {
  useAdminProdutorDetalhe,
  useAdminProdutorEvents,
  useAdminProdutorNotes,
  useAdminProdutorBankAccount,
  useUpdateProducerStatus,
  useAddProducerNote,
} from '@/hooks/useAdminProdutores';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ArrowLeft, CheckCircle, Ban, Pause, Calendar, Banknote, MessageSquare } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatEventDate, formatInSaoPaulo } from '@/lib/eventTime';


const statusColors: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  pending_review: 'bg-amber-100 text-amber-700 border-amber-200',
  suspended: 'bg-orange-100 text-orange-700 border-orange-200',
  blocked: 'bg-red-100 text-red-700 border-red-200',
};

const statusLabels: Record<string, string> = {
  active: 'Ativo',
  pending_review: 'Pendente',
  suspended: 'Suspenso',
  blocked: 'Bloqueado',
};


const AdminProdutorDetalhe: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [noteContent, setNoteContent] = useState('');

  const { data: produtor, isLoading } = useAdminProdutorDetalhe(id!);
  const { data: events } = useAdminProdutorEvents(id!);
  const { data: notes } = useAdminProdutorNotes(id!);
  const { data: bankAccount } = useAdminProdutorBankAccount(id!);
  const updateStatus = useUpdateProducerStatus();
  const addNote = useAddProducerNote();

  const handleStatusChange = async (status: string) => {
    try {
      await updateStatus.mutateAsync({ id: id!, status });
      toast({ title: `Produtor ${statusLabels[status]?.toLowerCase() || status}` });
    } catch {
      toast({ title: 'Erro ao atualizar status', variant: 'destructive' });
    }
  };

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    try {
      await addNote.mutateAsync({ producerProfileId: id!, content: noteContent });
      setNoteContent('');
      toast({ title: 'Observação adicionada' });
    } catch {
      toast({ title: 'Erro ao adicionar observação', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <AdminLayout title="Produtor">
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!produtor) {
    return (
      <AdminLayout title="Produtor">
        <p className="text-muted-foreground">Produtor não encontrado</p>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={produtor.brand_name}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/produtores')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="space-y-1">
            <h1 className="font-display text-2xl font-semibold text-foreground">{produtor.brand_name}</h1>
            <Badge variant="outline" className={statusColors[produtor.admin_status] || statusColors.active}>
              {statusLabels[produtor.admin_status] || produtor.admin_status}
            </Badge>
          </div>
        </div>


        {/* Status Actions */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => handleStatusChange('active')}
            disabled={produtor.admin_status === 'active'}
          >
            <CheckCircle className="h-4 w-4 mr-1" /> Aprovar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-400 text-amber-600 hover:bg-amber-50"
            onClick={() => handleStatusChange('suspended')}
            disabled={produtor.admin_status === 'suspended'}
          >
            <Pause className="h-4 w-4 mr-1" /> Suspender
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleStatusChange('blocked')}
            disabled={produtor.admin_status === 'blocked'}
          >
            <Ban className="h-4 w-4 mr-1" /> Bloquear
          </Button>
        </div>


        <Tabs defaultValue="dados">
          <TabsList>
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="eventos">Eventos ({events?.length || 0})</TabsTrigger>
            <TabsTrigger value="banco">Conta Bancária</TabsTrigger>
            <TabsTrigger value="notas">Observações ({notes?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="dados" className="mt-4">
            <Card>
              <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Nome Fantasia</p>
                  <p className="font-medium">{produtor.brand_name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Razão Social</p>
                  <p className="font-medium">{produtor.legal_name || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Documento</p>
                  <p className="font-medium">{produtor.document || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{produtor.email || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Telefone</p>
                  <p className="font-medium">{produtor.phone || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Taxa da Plataforma</p>
                  <p className="font-medium">{produtor.platform_fee_percent}%</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Cadastro em</p>
                  <p className="font-medium">
                    {formatInSaoPaulo(produtor.created_at, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>

                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="eventos" className="mt-4 space-y-3">
            {events?.length === 0 && (
              <p className="text-muted-foreground text-center py-8">Nenhum evento</p>
            )}
            {events?.map((ev) => (
              <Card
                key={ev.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/admin/eventos/${ev.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/admin/eventos/${ev.id}`);
                  }
                }}
                className="cursor-pointer transition-colors hover:border-primary/40"
              >
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{ev.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatEventDate(ev.date, { day: '2-digit', month: '2-digit', year: 'numeric' })} • {ev.city}/{ev.state}
                    </p>

                  </div>
                  <Badge variant={ev.status === 'published' ? 'default' : 'secondary'}>
                    {ev.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="banco" className="mt-4">
            <Card>
              <CardContent className="p-6">
                {bankAccount ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Banco</p>
                      <p className="font-medium">{bankAccount.bank_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Titular</p>
                      <p className="font-medium">{bankAccount.account_holder_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Agência</p>
                      <p className="font-medium">{bankAccount.agency}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Conta ({bankAccount.account_type})</p>
                      <p className="font-medium">{bankAccount.account_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Chave PIX ({bankAccount.pix_key_type})</p>
                      <p className="font-medium">{bankAccount.pix_key}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">Nenhuma conta bancária cadastrada</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notas" className="mt-4 space-y-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <Textarea
                  placeholder="Adicionar observação interna..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  rows={3}
                />
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={addNote.isPending || !noteContent.trim()}
                >
                  <MessageSquare className="h-4 w-4 mr-1" /> Adicionar
                </Button>

              </CardContent>
            </Card>

            {notes?.map((note) => (
              <Card key={note.id}>
                <CardContent className="p-4">
                  <p className="text-sm">{note.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {formatInSaoPaulo(note.created_at)}
                  </p>

                </CardContent>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default AdminProdutorDetalhe;
