import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Loader2, Mail, MessageCircle, Check, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  abrirWhatsappDoConvite,
  chamarConvidado,
  diaDoPrazo,
  motivoDaEdge,
  type IngressoDoPedido,
  type PedidoComConvidados,
} from '@/lib/convidado';

/*
 * Para quem são os outros ingressos? (OS-372, 03/11/2026)
 *
 * Quem compra vários ingressos ficava com todos na própria conta, e a portaria pela facial só
 * reconhece o dono. Aqui o comprador diz para quem é cada ingresso a mais (nome, CPF, e-mail e
 * celular) e a FestPag manda o link ao convidado por e-mail; o WhatsApp é o dele, com um toque.
 * Por baixo é a transferência de sempre: o ingresso continua do comprador até o convidado
 * aceitar com o próprio CPF, e dá para cancelar até lá.
 *
 * Aparece na tela de pagamento confirmado e em Meus Ingressos. Quem decide se o pedido tem
 * convidado é a edge (site, pago, 2+ ingressos, sem lista de alunos nem retirada grátis); sem
 * resposta dela, não aparece nada: a confirmação da compra nunca depende disto.
 *
 * O comprador fica com um: o primeiro ingresso livre do pedido é o dele e não entra na lista.
 */

const formatCpf = (v: string) =>
  v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

const formatTelefone = (v: string) => {
  const n = v.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 10) return n.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return n.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
};

const chave = (userId: string | undefined, ids: string[]) => ['convidados-dos-pedidos', userId, [...ids].sort().join(',')];

/** Uma chamada só para todos os pedidos da tela. Falhou: lista vazia, e nada aparece. */
export function useConvidadosDosPedidos(orderIds: string[]) {
  const { user } = useAuth();
  const ids = orderIds.filter(Boolean);
  return useQuery({
    queryKey: chave(user?.id, ids),
    enabled: !!user && ids.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<PedidoComConvidados[]> => {
      try {
        const r = await chamarConvidado<{ pedidos: PedidoComConvidados[] }>({ acao: 'pedidos', orderIds: ids });
        return r?.pedidos ?? [];
      } catch {
        return [];
      }
    },
  });
}

/** Os ingressos que esperam um convidado: os livres, menos o primeiro, que é do comprador. */
function semConvidado(p: PedidoComConvidados): IngressoDoPedido[] {
  const livres = p.ingressos.filter((i) => i.estado === 'livre');
  const temOutroDele = p.ingressos.some((i) => i.estado === 'usado');
  return temOutroDele ? livres : livres.slice(1);
}

interface Props {
  pedido: PedidoComConvidados;
  /** Mostrar os convites já feitos junto dos ingressos sem convidado (padrão: sim). */
  mostrarConvites?: boolean;
  onChange?: () => void;
}

export function ConvidadosDoPedido({ pedido, mostrarConvites = true, onChange }: Props) {
  const queryClient = useQueryClient();
  const vazios = semConvidado(pedido);
  const convites = mostrarConvites ? pedido.ingressos.filter((i) => i.estado === 'convite' || i.estado === 'transferido') : [];

  if (!pedido.elegivel || (vazios.length === 0 && convites.length === 0)) return null;

  const recarregar = () => {
    void queryClient.invalidateQueries({ queryKey: ['convidados-dos-pedidos'] });
    onChange?.();
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-left space-y-3">
      <div className="flex gap-2.5">
        <UserPlus className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-display font-semibold text-sm">
            {vazios.length > 0 ? 'Para quem são os outros ingressos?' : 'Seus convidados'}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {vazios.length > 0
              ? 'Você fica com um. Diga para quem é cada um dos outros e a gente manda o link por e-mail: a pessoa pega o ingresso no nome dela e, se quiser, cadastra a facial.'
              : 'Cada convidado pega o próprio ingresso pelo link que mandamos por e-mail.'}
          </p>
        </div>
      </div>

      {convites.map((i) => <ConviteFeito key={i.id} ingresso={i} evento={pedido.evento} onChange={recarregar} />)}
      {vazios.map((i) => <ApontarConvidado key={i.id} ingresso={i} numero={pedido.ingressos.indexOf(i) + 1} onChange={recarregar} />)}

      {vazios.length > 0 && (
        <p className="text-[11px] text-muted-foreground">Pode fazer isso depois, em Meus Ingressos.</p>
      )}
    </div>
  );
}

/** Na confirmação: um pedido só. */
export function ConvidadosDaCompra({ orderId }: { orderId: string }) {
  const { data } = useConvidadosDosPedidos([orderId]);
  const pedido = data?.find((p) => p.orderId === orderId);
  return pedido ? <ConvidadosDoPedido pedido={pedido} /> : null;
}

function ApontarConvidado({ ingresso, numero, onChange }: {
  ingresso: IngressoDoPedido; numero: number; onChange: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);

  const mandar = async () => {
    if (nome.trim().length < 2) { toast.error('Informe o nome do convidado.'); return; }
    if (cpf.replace(/\D/g, '').length !== 11) { toast.error('Informe o CPF do convidado.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) { toast.error('Informe o e-mail do convidado.'); return; }
    const zap = telefone.replace(/\D/g, '');
    if (zap.length < 10) { toast.error('Informe o celular do convidado, com o DDD.'); return; }
    setEnviando(true);
    try {
      const r = await chamarConvidado<{ emailEnviado: boolean; link: string; expiresAt: string }>({
        acao: 'apontar', ticketId: ingresso.id, nome: nome.trim(), cpf: cpf.replace(/\D/g, ''), email: email.trim(), telefone: zap,
      });
      if (r.emailEnviado) {
        toast.success(`Convite enviado para ${email.trim()}.`);
      } else {
        toast.warning('O convite está pronto, mas o e-mail não saiu agora. Mande pelo WhatsApp.');
      }
      onChange();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível mandar o convite.');
    } finally {
      setEnviando(false);
    }
  };

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/60 px-3 py-2.5 text-left"
      >
        <span className="text-sm">
          <span className="font-medium">Ingresso {numero}</span>
          <span className="text-muted-foreground"> · {ingresso.rotulo}</span>
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-primary shrink-0">
          Apontar convidado <ChevronDown className="w-3.5 h-3.5" />
        </span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Ingresso {numero} <span className="text-muted-foreground font-normal">· {ingresso.rotulo}</span></p>
        <button type="button" onClick={() => setAberto(false)} className="text-muted-foreground" aria-label="Fechar">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`c-nome-${ingresso.id}`}>Nome do convidado</Label>
        <Input id={`c-nome-${ingresso.id}`} autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`c-cpf-${ingresso.id}`}>CPF do convidado</Label>
        <Input id={`c-cpf-${ingresso.id}`} inputMode="numeric" placeholder="000.000.000-00"
          value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`c-email-${ingresso.id}`}>E-mail do convidado</Label>
        <Input id={`c-email-${ingresso.id}`} type="email" inputMode="email" autoComplete="off" placeholder="nome@email.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`c-tel-${ingresso.id}`}>Celular do convidado</Label>
        <Input id={`c-tel-${ingresso.id}`} inputMode="numeric" placeholder="(17) 99999-9999"
          value={telefone} onChange={(e) => setTelefone(formatTelefone(e.target.value))} />
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Só quem tiver este CPF consegue pegar o ingresso. Até a pessoa aceitar, o ingresso continua com você,
        e você pode cancelar.
      </p>
      <Button variant="hero" className="w-full h-11" onClick={mandar} disabled={enviando}>
        {enviando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mandando…</> : <><Mail className="w-4 h-4 mr-2" /> Mandar o convite</>}
      </Button>
    </div>
  );
}

/** Convite aberto ou já aceito, na tela de confirmação. */
function ConviteFeito({ ingresso, evento, onChange }: { ingresso: IngressoDoPedido; evento?: string | null; onChange: () => void }) {
  const c = ingresso.convidado;
  const nome = c?.nome?.trim() || `CPF final ${c?.cpfFinal ?? ''}`;

  if (ingresso.estado === 'transferido') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="text-sm"><span className="font-medium">{nome}</span> já pegou o ingresso.</p>
      </div>
    );
  }
  return <ConviteAbertoAcoes ingresso={ingresso} evento={evento} onChange={onChange} />;
}

/**
 * Convite esperando o convidado: WhatsApp do comprador, reenviar o e-mail e cancelar.
 * Também usado no próprio ingresso, em Meus Ingressos.
 */
export function ConviteAbertoAcoes({ ingresso, evento, onChange }: {
  ingresso: Pick<IngressoDoPedido, 'convidado'>; evento?: string | null; onChange?: () => void;
}) {
  const c = ingresso.convidado;
  const [reenviando, setReenviando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  if (!c?.transferId || !c.link) return null;
  const nome = c.nome?.trim() || `CPF final ${c.cpfFinal}`;

  const reenviar = async () => {
    setReenviando(true);
    try {
      const r = await chamarConvidado<{ emailEnviado: boolean }>({ acao: 'reenviar', transferId: c.transferId });
      if (r.emailEnviado) { toast.success(`E-mail enviado de novo para ${c.email}.`); onChange?.(); }
      else toast.warning('O e-mail não saiu agora. Mande pelo WhatsApp.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível reenviar.');
    } finally {
      setReenviando(false);
    }
  };

  const cancelar = async () => {
    setCancelando(true);
    try {
      const { data, error } = await supabase.functions.invoke('ticket-transfer-cancel', { body: { transferId: c.transferId } });
      if (data?.error) { toast.error(data.error); return; }
      if (error) { toast.error(await motivoDaEdge(error)); return; }
      toast.success('Convite cancelado. O ingresso continua com você.');
      onChange?.();
    } finally {
      setCancelando(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 space-y-2">
      <p className="text-sm">
        Convite para <span className="font-medium">{nome}</span>
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {c.avisoEnviadoEm ? <>E-mail enviado para <strong className="text-foreground">{c.email}</strong>. </> : <>O e-mail ainda não saiu: mande pelo WhatsApp. </>}
        {c.expiraEm ? <>O link vale até {diaDoPrazo(c.expiraEm)}. </> : null}
        O ingresso continua seu até a pessoa aceitar.
      </p>
      <Button variant="hero" size="sm" className="w-full" onClick={() => abrirWhatsappDoConvite({ nome: c.nome, telefone: c.telefone, evento, link: c.link!, expiraEm: c.expiraEm })}>
        <MessageCircle className="w-4 h-4 mr-1.5" /> Mandar também pelo WhatsApp
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={reenviar} disabled={reenviando}>
          {reenviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4 mr-1.5" /> Reenviar e-mail</>}
        </Button>
        <Button variant="ghost" size="sm" onClick={cancelar} disabled={cancelando}>
          {cancelando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancelar convite'}
        </Button>
      </div>
    </div>
  );
}
