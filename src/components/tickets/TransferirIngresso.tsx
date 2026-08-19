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

export function TransferirIngresso({ ticket, onChange }: Props) {
  const [aberto, setAberto] = useState(false);
  const [cpf, setCpf] = useState('');
  const [email, setEmail] = useState('');
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
    setEnviando(true);
    try {
      const { data, error } = await supabase.functions.invoke('ticket-transfer-start', {
        body: { ticketId: ticket.id, cpf: cpfLimpo, email: email.trim() || null, telefone: telefone.replace(/\D/g, '') || null },
      });
      if (error) throw error;
      if (data?.error) { toast.error(data.error); return; }
      setLink(data.link);
      onChange?.();
    } catch (e: any) {
      toast.error(e?.message || 'Não foi possível iniciar a transferência.');
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
    // Zera o formulário só depois de fechar, para o link não sumir da tela
    // enquanto a pessoa ainda está copiando.
    setTimeout(() => { setLink(null); setCpf(''); setEmail(''); setTelefone(''); }, 300);
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
              <div className="space-y-2">
                <Label htmlFor="t-email">E-mail <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input id="t-email" type="email" placeholder="email@exemplo.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="t-tel">WhatsApp <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input id="t-tel" inputMode="numeric" placeholder="(17) 99999-9999"
                  value={telefone} onChange={(e) => setTelefone(formatTelefone(e.target.value))} />
                <p className="text-[11px] text-muted-foreground">
                  Se preencher, abrimos a conversa já com a mensagem pronta.
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
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">Link</p>
                <p className="text-xs break-all font-mono leading-relaxed">{link}</p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={copiar}>
                  {copiado ? <><Check className="w-4 h-4 mr-2" /> Copiado</> : <><Copy className="w-4 h-4 mr-2" /> Copiar</>}
                </Button>
                <Button variant="hero" onClick={abrirWhatsapp}>
                  <ExternalLink className="w-4 h-4 mr-2" /> WhatsApp
                </Button>
              </div>

              <p className="text-[11px] text-center text-muted-foreground">
                O link vale por 24 horas. Até alguém aceitar, o ingresso continua com você.
              </p>

              <Button variant="ghost" className="w-full" onClick={fechar}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
