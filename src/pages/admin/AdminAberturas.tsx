// Admin · Links de abertura de evento (OS-221). Gera o link que vai para o produtor,
// mostra quem já preencheu, o que ficou para depois e o que já virou evento.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronRight, Copy, Link2, Loader2, Plus } from 'lucide-react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { completarRespostas, etapaPreenchida, type EtapaComDados } from '@/lib/abertura-evento';

const ETAPAS_DADOS: EtapaComDados[] = ['produtora', 'evento', 'local', 'ingressos', 'arte', 'acessos'];

export interface LinhaAbertura {
  id: string;
  token: string;
  cliente: string;
  taxa_percent: number;
  nota_interna: string | null;
  respostas: Record<string, unknown>;
  pendencias: Record<string, string>;
  enviada_em: string | null;
  ultima_edicao_em: string | null;
  producer_profile_id: string | null;
  event_id: string | null;
  created_at: string;
}

const tabela = () => supabase.from('aberturas_evento' as never) as unknown as ReturnType<typeof supabase.from>;

export const linkDaAbertura = (token: string) => `${window.location.origin}/abrir-evento/${token}`;

export function copiarLink(token: string) {
  navigator.clipboard.writeText(linkDaAbertura(token)).then(
    () => toast.success('Link copiado.'),
    () => toast.error('Não consegui copiar. Selecione o link e copie à mão.'),
  );
}

export function situacao(a: LinhaAbertura): { texto: string; classe: string } {
  if (a.event_id) return { texto: 'Evento criado', classe: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
  if (a.enviada_em) return { texto: 'Enviado', classe: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
  if (a.ultima_edicao_em) return { texto: 'Preenchendo', classe: 'bg-amber-100 text-amber-700 border-amber-200' };
  return { texto: 'Não abriu', classe: 'bg-slate-100 text-slate-600 border-slate-200' };
}

const AdminAberturas: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [novo, setNovo] = useState(false);
  const [cliente, setCliente] = useState('');
  const [taxa, setTaxa] = useState('10');
  const [nota, setNota] = useState('');
  const [criando, setCriando] = useState(false);

  const { data: lista, isLoading } = useQuery({
    queryKey: ['admin-aberturas'],
    queryFn: async () => {
      const { data, error } = await tabela().select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LinhaAbertura[];
    },
  });

  const criar = async () => {
    const t = Number(taxa.replace(',', '.'));
    if (!cliente.trim()) { toast.error('Diga o nome do cliente.'); return; }
    if (!Number.isFinite(t) || t < 0 || t > 30) { toast.error('Taxa entre 0 e 30%.'); return; }
    setCriando(true);
    const { data, error } = await tabela()
      .insert({ cliente: cliente.trim(), taxa_percent: t, nota_interna: nota.trim() || null } as never)
      .select('id, token').single();
    setCriando(false);
    if (error) { toast.error('Não consegui criar o link.'); return; }
    const linha = data as unknown as { id: string; token: string };
    copiarLink(linha.token);
    setNovo(false); setCliente(''); setTaxa('10'); setNota('');
    qc.invalidateQueries({ queryKey: ['admin-aberturas'] });
    navigate(`/admin/aberturas/${linha.id}`);
  };

  return (
    <AdminLayout title="Abertura de eventos">
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Abertura de eventos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Fechou um evento? Gere o link, mande ao produtor e acompanhe o que ele preencheu.
            </p>
          </div>
          <Button onClick={() => setNovo(true)}><Plus className="mr-2 h-4 w-4" /> Novo link</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !lista?.length ? (
          <Card className="border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">
            <Link2 className="mx-auto mb-3 h-8 w-8" />Nenhum link ainda. Toque em "Novo link".
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {lista.map((a) => {
              const r = completarRespostas(a.respostas as never);
              const feitas = ETAPAS_DADOS.filter((e) => etapaPreenchida(r, e)).length;
              const pend = Object.keys(a.pendencias ?? {}).length;
              const s = situacao(a);
              return (
                <Card key={a.id} className="cursor-pointer border-border bg-card transition hover:border-primary/40" onClick={() => navigate(`/admin/aberturas/${a.id}`)}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold">{a.cliente}</p>
                        <Badge variant="outline" className={s.classe}>{s.texto}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {feitas} de 6 partes preenchidas{pend ? ` · ${pend} para depois` : ''} · taxa {String(a.taxa_percent).replace('.', ',')}% · criado em {new Date(a.created_at).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); copiarLink(a.token); }} aria-label="Copiar link"><Copy className="h-4 w-4" /></Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={novo} onOpenChange={setNovo}>
        <DialogContent className="admin-theme">
          <DialogHeader><DialogTitle>Novo link de abertura</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex.: Fogo & Fumaça" />
              <p className="text-xs text-muted-foreground">O link cumprimenta por este nome.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Taxa de serviço combinada (%)</Label>
              <Input inputMode="decimal" value={taxa} onChange={(e) => setTaxa(e.target.value)} />
              <p className="text-xs text-muted-foreground">Paga por quem compra. Aparece na prévia dos ingressos e vai para o evento quando ele for criado.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Nota interna (opcional)</Label>
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: fechado pelo Guilherme, Proposta 1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNovo(false)}>Cancelar</Button>
            <Button onClick={criar} disabled={criando}>{criando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar e copiar o link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminAberturas;
