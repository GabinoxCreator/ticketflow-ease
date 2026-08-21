import { useState } from 'react';
import { Send, Copy, Check, Loader2, X, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { UserTicket } from '@/hooks/useUserTickets';

/*
 * Transferir ingresso — a parte que o DONO vê (§4 do framework do Rodeio).
 *
 * O dono informa CPF, e-mail e telefone de quem vai receber; sai um link, que
 * ele manda pelo WhatsApp. O ingresso só muda de mãos quando a outra pessoa
 * aceita informando o próprio CPF — até lá continua sendo dele, e ele pode
 * cancelar.
 *
 * Por que o link em vez de mandarmos direto: quem transfere já está com a
 * conversa aberta com a pessoa. Um link que ele cola é mais simples do que nos
 * dar o contato e torcer para a mensagem chegar.
 */

interface Props {
  ticket: UserTicket;
  onChange?: () => void;
}

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

/**
 * Tira o motivo de dentro da resposta da edge.
 *
 * `functions.invoke` lança sempre a mesma frase — "Edge Function returned a
 * non-2xx status code" — em qualquer recusa. O motivo de verdade vem no corpo,
 * e sem isto o dono lia aquela frase na tela quando o ingresso já tinha sido
 * transferido (Gabriel, 21/08).
 */
async function lerMotivo(e: unknown): Promise<string> {
  const err = e as { context?: { json?: () => Promise<{ error?: string }> }; message?: string };
  try {
    const corpo = await err.context?.json?.();
    if (corpo?.error) return corpo.error;
  } catch { /* corpo não era JSON; fica a mensagem crua */ }
  return err?.message ?? '';
}

/** Motivo do servidor → frase que o dono do ingresso entende. */
function traduzirErro(motivo: string): string {
  const m = (motivo || '').toLowerCase();
  if (m.includes('ja_transferido'))       return 'Este ingresso já foi transferido uma vez. Cada ingresso só pode mudar de dono uma vez.';
  if (m.includes('em_andamento'))         return 'Já existe um link de transferência aberto para este ingresso. Cancele o atual antes de gerar outro.';
  if (m.includes('ja_utilizado'))         return 'Este ingresso já foi usado na entrada e não pode mais ser transferido.';
  if (m.includes('proprio_dono'))         return 'Este CPF já é o dono do ingresso. Informe o CPF de quem vai receber.';
  if (m.includes('nao_e_seu'))            return 'Este ingresso não está na sua conta.';
  if (m.includes('indisponivel'))         return 'Este ingresso não está válido para transferência.';
  if (m.includes('compra_nao_confirmada')) return 'A compra deste ingresso ainda não foi confirmada.';
  if (m.includes('cpf_invalido'))         return 'CPF inválido. Confira os números.';
  if (m.includes('non-2xx') || !m)        return 'Não foi possível transferir agora. Tente de novo em instantes.';
  return motivo;
}

export function TransferirIngresso({ ticket, onChange }: Props) {
  const [aberto, setAberto] = useState(false);
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [cancelando, setCancelando] = useState(false);

  const emTransferencia = !!ticket.transfer;
  const podeTransferir = ticket.status === 'valid' && !ticket.validated_at;

  const iniciar = async () => {
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      toast.error('Informe o CPF de quem vai receber.');
      return;
    }
    const zap = telefone.replace(/\D/g, '');
    if (zap.length < 10) {
      toast.error('Informe o WhatsApp de quem vai receber — é por ele que a pessoa recebe o link.');
      return;
    }
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('ticket-transfer-start', {
        body: { ticketId: ticket.id, cpf: cpfLimpo, telefone: zap },
      });
      // ⚠️ O corpo vem ANTES do erro genérico. `invoke` lança "Edge Function
      // returned a non-2xx status code" em qualquer recusa — e era isso que o
      // dono lia na tela quando o ingresso já tinha sido transferido, em vez do
      // motivo (Gabriel, 21/08).
      if (data?.error) { toast.error(traduzirErro(data.error)); return; }
      if (error) {
        toast.error(traduzirErro(await lerMotivo(error)));
        return;
      }
      setLink(data.link);
      // ⚠️ `onChange` NÃO aqui. Ele recarrega a lista, o componente se redesenha
      // no estado "em transferência" e leva o link junto — o dono via o modal
      // sumir antes de copiar. A lista é avisada quando ele fecha.
    } catch (e: any) {
      toast.error(traduzirErro(await lerMotivo(e)));
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async () => {
    if (!ticket.transfer) return;
    setCancelando(true);
    try {
      const { data, error } = await supabase.functions.invoke('ticket-transfer-cancel', {
        body: { transferId: ticket.transfer.id },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      toast.success('Transferência cancelada. O ingresso continua com você.');
      // ⚠️ Limpar o link junto. Sem isto, o estado do modal sobrevive ao
      // cancelamento e a tela volta a mostrar o link recém-cancelado, como se
      // ele ainda valesse (Gabriel, 21/08).
      setLink(null); setCpf(''); setTelefone(''); setAberto(false);
      onChange?.();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível cancelar.');
    } finally {
      setCancelando(false);
    }
  };

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('Não consegui copiar. Selecione o link e copie manualmente.');
    }
  };

  const abrirWhatsapp = () => {
    if (!link) return;
    const texto = `Te mandei um ingresso da FestPag! Para aceitar, é só abrir este link e confirmar com o seu CPF:\n\n${link}\n\nO link vale por 24 horas.`;
    const numero = telefone.replace(/\D/g, '');
    const url = numero
      ? `https://wa.me/55${numero}?text=${encodeURIComponent(texto)}`
      : `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank', 'noopener');
  };

  const fechar = () => {
    setAberto(false);
    // Só agora a lista recarrega: enquanto o link estava na tela, recarregar
    // fazia o componente trocar de estado e o link desaparecer.
    if (link) onChange?.();
    // Zera o formulário só depois de fechar, para o link não sumir da tela
    // enquanto a pessoa ainda está copiando.
    setTimeout(() => { setLink(null); setCpf(''); setTelefone(''); }, 300);
  };

  // ── Ingresso já em transferência: o dono só vê o aviso e o botão de cancelar
  if (emTransferencia) {
    const venceEm = new Date(ticket.transfer!.expires_at);
    const horas = Math.max(0, Math.round((venceEm.getTime() - Date.now()) / 3_600_000));
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 space-y-2">
        <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
          <Clock className="w-4 h-4" /> Transferindo
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Esperando a pessoa do CPF final <strong>{ticket.transfer!.to_cpf_final}</strong> aceitar.
          {horas > 0 ? ` O link vence em ${horas}h.` : ' O link está vencendo.'} O ingresso continua seu até o aceite.
        </p>
        <Button variant="outline" size="sm" className="w-full" onClick={cancelar} disabled={cancelando}>
          {cancelando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Cancelando…</> : <><X className="w-4 h-4 mr-2" /> Cancelar transferência</>}
        </Button>
      </div>
    );
  }

  if (!podeTransferir) return null;

  return (
    <>
      <Button variant="outline" size="sm" className="w-full" onClick={() => setAberto(true)}>
        <Send className="w-4 h-4 mr-2" /> Transferir ingresso
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => (o ? setAberto(true) : fechar())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{link ? 'Link pronto' : 'Transferir ingresso'}</DialogTitle>
            <DialogDescription>
              {link
                ? 'Mande o link para a pessoa. Ela cria a conta, confirma o CPF e o ingresso passa para ela.'
                : 'O ingresso vai para o CPF que você informar. Você pode cancelar enquanto ninguém aceitar.'}
            </DialogDescription>
          </DialogHeader>

          {!link ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="t-cpf">CPF de quem vai receber</Label>
                <Input id="t-cpf" inputMode="numeric" placeholder="000.000.000-00"
                  value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} />
                <p className="text-[11px] text-muted-foreground">
                  Só quem tiver este CPF consegue aceitar — é o que protege o link.
                </p>
              </div>
              {/* ⚠️ SÓ CPF E WHATSAPP, os dois obrigatórios (Gabriel, 21/08).
                  Três campos, dois deles marcados "(opcional)", faziam a pessoa
                  parar para decidir o que preencher no meio de uma ação simples.
                  O WhatsApp é por onde o link chega — sem ele, o dono fica com
                  um endereço na mão e ninguém para mandar. O e-mail saiu: não é
                  usado para nada neste caminho. */}
              <div className="space-y-2">
                <Label htmlFor="t-tel">WhatsApp de quem vai receber</Label>
                <Input id="t-tel" inputMode="numeric" placeholder="(17) 99999-9999"
                  value={telefone} onChange={(e) => setTelefone(formatTelefone(e.target.value))} />
                <p className="text-[11px] text-muted-foreground">
                  É por aqui que a pessoa recebe o link — abrimos a conversa com a mensagem pronta.
                </p>
              </div>

              <div className="rounded-lg bg-muted/30 border border-border/60 px-3 py-2.5">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Ao aceitar, o QR atual deixa de valer e um novo é gerado no nome da pessoa.
                  <strong className="text-foreground"> Cada ingresso pode ser transferido uma vez</strong>, e só antes de ser usado na entrada.
                </p>
              </div>

              <Button variant="hero" className="w-full h-12" onClick={iniciar} disabled={enviando}>
                {enviando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando link…</> : 'Gerar link de transferência'}
              </Button>
            </div>
          ) : (
            /* O link é MEIO, não resultado. Mostrar o endereço cru fazia a
               pessoa achar que precisava fazer algo com aquele texto — e um
               `uuid` de 64 caracteres na tela não passa confiança nenhuma
               (Gabriel, 21/08). Fica a confirmação de que deu certo e os dois
               jeitos de mandar. */
            <div className="space-y-4">
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5 text-center">
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <p className="font-display font-semibold text-base">Link criado</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Só falta mandar para quem vai receber. Enquanto ninguém aceitar,
                  o ingresso continua seu.
                </p>
                <p className="text-xs text-muted-foreground/80 mt-2">
                  Vale por 24 horas · CPF final <strong className="text-foreground">{cpf.replace(/\D/g, '').slice(-3)}</strong>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-12" onClick={copiar}>
                  {copiado ? <><Check className="w-4 h-4 mr-2" /> Copiado</> : <><Copy className="w-4 h-4 mr-2" /> Copiar link</>}
                </Button>
                <Button variant="hero" className="h-12" onClick={abrirWhatsapp}>
                  <ExternalLink className="w-4 h-4 mr-2" /> WhatsApp
                </Button>
              </div>

              <Button variant="ghost" className="w-full" onClick={fechar}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
