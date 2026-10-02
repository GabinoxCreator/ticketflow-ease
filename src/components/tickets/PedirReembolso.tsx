import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Info, Loader2, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { UserTicket } from '@/hooks/useUserTickets';
import { CAMINHOS_LEGAIS, RESUMO_REEMBOLSO } from '@/lib/documentos-legais';
import {
  TIPOS_DE_CHAVE, brl, desistirDoReembolso, fraseDoIngresso, fraseDoMotivo, quandoBR,
  simularReembolso, solicitarReembolso,
  type RespostaDoPedido, type SimulacaoDeReembolso, type TipoChavePix,
} from '@/lib/reembolso';

/*
 * Cancelar e pedir reembolso, pela conta do comprador (OS-103).
 *
 * O comprador escolhe quais ingressos da compra quer devolver e envia o pedido.
 * O pedido NÃO cancela nada: a casa aprova antes (decisão do Gabriel, 02/10).
 * Enquanto isso os ingressos escolhidos ficam bloqueados, e o comprador pode
 * desistir do pedido aqui mesmo.
 *
 * Tudo o que é regra vem do servidor (`reembolso_simular`): se pode, por que
 * não pode, quanto volta. Fora do prazo o botão continua na tela e EXPLICA o
 * porquê, em vez de sumir: botão que some vira mensagem no WhatsApp perguntando
 * onde ele foi parar.
 */

interface Props {
  /** Os ingressos de UMA compra (o mesmo pedido). */
  tickets: UserTicket[];
  onChange?: () => void;
}

type Passo = 'carregando' | 'nao_pode' | 'formulario' | 'enviado';

export function PedirReembolso({ tickets, onChange }: Props) {
  const orderId = tickets[0]?.order_id;
  const [aberto, setAberto] = useState(false);
  const [passo, setPasso] = useState<Passo>('carregando');
  const [sim, setSim] = useState<SimulacaoDeReembolso | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [tipoChave, setTipoChave] = useState<TipoChavePix>('cpf');
  const [chave, setChave] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [resposta, setResposta] = useState<RespostaDoPedido | null>(null);
  const [confirmarDesistencia, setConfirmarDesistencia] = useState(false);
  const [desistindo, setDesistindo] = useState(false);

  const emAnalise = tickets.find((t) => t.reembolso?.status === 'solicitado')?.reembolso ?? null;
  // Só o pedido mais recente de cada ingresso chega aqui. Recusa aparece
  // enquanto o ingresso continua válido: é a resposta que o comprador esperava.
  const recusado = tickets.find((t) => t.status === 'valid' && t.reembolso?.status === 'recusado')?.reembolso ?? null;
  const temValido = tickets.some((t) => t.status === 'valid');

  const elegiveis = useMemo(() => (sim?.ingressos ?? []).filter((i) => !i.motivo), [sim]);
  const marcados = useMemo(() => elegiveis.filter((i) => escolhidos.includes(i.ticket_id)), [elegiveis, escolhidos]);
  const valorIngressos = marcados.reduce((s, i) => s + Number(i.valor_ingresso), 0);
  const valorTaxa = marcados.reduce((s, i) => s + Number(i.valor_taxa), 0);
  const total = valorIngressos + (sim?.devolve_taxa ? valorTaxa : 0);

  const abrir = async () => {
    if (!orderId) return;
    setAberto(true);
    setPasso('carregando');
    setResposta(null);
    try {
      const s = await simularReembolso(orderId);
      setSim(s);
      const podem = (s.ingressos ?? []).filter((i) => !i.motivo);
      if (!s.permitido || podem.length === 0) {
        setPasso('nao_pode');
        return;
      }
      // Mesa volta inteira; compra de um ingresso só não tem o que escolher.
      setEscolhidos(s.mesa || podem.length === 1 ? podem.map((i) => i.ticket_id) : []);
      setPasso('formulario');
    } catch {
      setSim({ permitido: false, motivo: 'erro' });
      setPasso('nao_pode');
    }
  };

  const fechar = () => {
    setAberto(false);
    // A lista só recarrega depois de fechar: recarregar com a confirmação na
    // tela faria o componente trocar de estado e o protocolo sumir.
    if (resposta?.ok) onChange?.();
    setTimeout(() => { setChave(''); setMotivo(''); setEscolhidos([]); setResposta(null); }, 300);
  };

  const alternar = (id: string, marcado: boolean) =>
    setEscolhidos((atual) => (marcado ? [...atual, id] : atual.filter((x) => x !== id)));

  const enviar = async () => {
    if (!orderId || !sim) return;
    if (marcados.length === 0) { toast.error(fraseDoMotivo('nenhum_ingresso_escolhido')); return; }
    if (sim.forma === 'pix' && chave.trim().length < 5) { toast.error(fraseDoMotivo('chave_pix_invalida')); return; }
    setEnviando(true);
    try {
      const r = await solicitarReembolso({
        orderId,
        ticketIds: marcados.map((i) => i.ticket_id),
        chavePix: sim.forma === 'pix' ? chave.trim() : null,
        tipoChavePix: sim.forma === 'pix' ? tipoChave : null,
        motivo: motivo.trim() || null,
      });
      if (!r.ok) { toast.error(fraseDoMotivo(r.error, r.limite)); return; }
      setResposta(r);
      setPasso('enviado');
    } catch {
      toast.error(fraseDoMotivo(null));
    } finally {
      setEnviando(false);
    }
  };

  const desistir = async () => {
    if (!emAnalise) return;
    setDesistindo(true);
    try {
      const r = await desistirDoReembolso(emAnalise.id);
      if (!r.ok) { toast.error(fraseDoMotivo(r.error)); return; }
      toast.success('Pedido de reembolso desfeito. Seus ingressos voltaram a valer.');
      setConfirmarDesistencia(false);
      onChange?.();
    } catch {
      toast.error(fraseDoMotivo(null));
    } finally {
      setDesistindo(false);
    }
  };

  // ── Pedido em análise: o comprador vê o protocolo e pode voltar atrás ──────
  if (emAnalise) {
    return (
      <>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-3 space-y-2">
          <div className="flex items-center gap-2 text-amber-500 text-sm font-semibold">
            <Clock className="w-4 h-4" /> Reembolso em análise
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Pedido nº <strong className="text-foreground">{emAnalise.numero}</strong> de{' '}
            <strong className="text-foreground">{brl(emAnalise.valor_a_devolver)}</strong>, enviado em{' '}
            {quandoBR(emAnalise.solicitado_em)}. Os ingressos deste pedido ficam bloqueados até a resposta,
            que aparece aqui.
          </p>
          <Button variant="outline" size="sm" className="w-full" onClick={() => setConfirmarDesistencia(true)}>
            <X className="w-4 h-4 mr-2" /> Desistir do pedido de reembolso
          </Button>
        </div>

        <AlertDialog open={confirmarDesistencia} onOpenChange={setConfirmarDesistencia}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desistir do pedido de reembolso?</AlertDialogTitle>
              <AlertDialogDescription>
                O pedido nº {emAnalise.numero} é desfeito e os ingressos voltam a valer na hora.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={desistindo}>Manter o pedido</AlertDialogCancel>
              <AlertDialogAction disabled={desistindo} onClick={(e) => { e.preventDefault(); void desistir(); }}>
                {desistindo && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Desistir e ficar com os ingressos
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  if (!temValido) return null;

  return (
    <>
      {recusado && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-3.5 py-3 mb-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Pedido de reembolso nº {recusado.numero} não aprovado.</strong>{' '}
            {recusado.motivo_recusa} Seus ingressos continuam valendo.
          </p>
        </div>
      )}

      <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-foreground" onClick={abrir}>
        <Undo2 className="w-4 h-4 mr-2" /> Cancelar e pedir reembolso
      </Button>

      <Dialog open={aberto} onOpenChange={(o) => (o ? setAberto(true) : fechar())}>
        <DialogContent className="sm:max-w-md max-h-[92dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{passo === 'enviado' ? 'Pedido recebido' : 'Cancelar e pedir reembolso'}</DialogTitle>
            <DialogDescription>
              {passo === 'enviado'
                ? 'Guarde o número do pedido. A resposta aparece aqui em Meus Ingressos.'
                : 'Escolha o que você quer devolver. A gente analisa e responde aqui em Meus Ingressos.'}
            </DialogDescription>
          </DialogHeader>

          {passo === 'carregando' && (
            <div className="py-10 flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Conferindo a sua compra…
            </div>
          )}

          {passo === 'nao_pode' && sim && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 flex gap-3">
                <Info className="w-5 h-5 shrink-0 text-muted-foreground mt-0.5" />
                <p className="text-sm text-foreground leading-relaxed">
                  {sim.permitido
                    ? 'Nenhum ingresso desta compra pode ser devolvido agora.'
                    : fraseDoMotivo(sim.motivo, sim.limite)}
                </p>
              </div>
              {sim.permitido && (sim.ingressos ?? []).length > 0 && (
                <ul className="space-y-1.5">
                  {(sim.ingressos ?? []).map((i) => (
                    <li key={i.ticket_id} className="text-xs text-muted-foreground flex justify-between gap-3">
                      <span className="truncate">{i.nome} · {i.codigo}</span>
                      <span className="shrink-0">{fraseDoIngresso(i.motivo)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <LinkDaPolitica />
              <Button variant="outline" className="w-full" onClick={fechar}>Fechar</Button>
            </div>
          )}

          {passo === 'formulario' && sim && (
            <div className="space-y-4">
              {/* Quais ingressos */}
              <div className="space-y-2">
                <Label>{sim.mesa ? 'Lugares da mesa' : elegiveis.length === 1 ? 'Ingresso' : 'Quais ingressos você quer devolver?'}</Label>
                <div className="rounded-xl border border-border/60 divide-y divide-border/60">
                  {(sim.ingressos ?? []).map((i) => {
                    const pode = !i.motivo;
                    const marcado = escolhidos.includes(i.ticket_id);
                    const travado = !pode || !!sim.mesa || elegiveis.length === 1;
                    return (
                      <label
                        key={i.ticket_id}
                        className={`flex items-center gap-3 px-3 py-2.5 ${pode ? 'cursor-pointer' : 'opacity-55'}`}
                      >
                        <Checkbox
                          checked={pode && marcado}
                          disabled={travado}
                          onCheckedChange={(v) => alternar(i.ticket_id, v === true)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{i.nome}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {i.codigo}{i.titular ? ` · ${i.titular}` : ''}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-right text-muted-foreground">
                          {pode ? <span className="text-sm font-semibold text-foreground">{brl(i.valor_ingresso)}</span> : fraseDoIngresso(i.motivo)}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {sim.mesa && (
                  <p className="text-[11px] text-muted-foreground">A mesa é devolvida inteira: todos os lugares entram juntos.</p>
                )}
              </div>

              {/* Quanto volta */}
              <div className="rounded-xl bg-muted/30 border border-border/60 px-3.5 py-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Valor dos ingressos</span>
                  <span className="text-foreground">{brl(valorIngressos)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Taxa de serviço</span>
                  <span className={sim.devolve_taxa ? 'text-foreground' : 'text-muted-foreground'}>
                    {sim.devolve_taxa ? brl(valorTaxa) : 'não reembolsável'}
                  </span>
                </div>
                <div className="flex justify-between gap-3 pt-1.5 border-t border-border/60 font-semibold">
                  <span className="text-foreground">Você recebe</span>
                  <span className="text-foreground">{brl(total)}</span>
                </div>
                {!sim.devolve_taxa && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">{RESUMO_REEMBOLSO.taxa}</p>
                )}
              </div>

              {/* Por onde volta */}
              {sim.forma === 'pix' ? (
                <div className="space-y-2">
                  <Label htmlFor="r-chave">Chave PIX para receber</Label>
                  <div className="grid grid-cols-[minmax(0,9.5rem)_1fr] gap-2">
                    <Select value={tipoChave} onValueChange={(v) => setTipoChave(v as TipoChavePix)}>
                      <SelectTrigger aria-label="Tipo da chave PIX"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_DE_CHAVE.map((t) => (
                          <SelectItem key={t.valor} value={t.valor}>{t.rotulo}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      id="r-chave"
                      value={chave}
                      onChange={(e) => setChave(e.target.value)}
                      placeholder={TIPOS_DE_CHAVE.find((t) => t.valor === tipoChave)?.exemplo}
                      inputMode={tipoChave === 'email' || tipoChave === 'aleatoria' ? 'text' : 'numeric'}
                      autoComplete="off"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    O valor é devolvido por PIX nesta chave. Confira antes de enviar.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/30 border border-border/60 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong className="text-foreground">A compra foi no cartão.</strong> O valor volta como estorno no
                    mesmo cartão, sem precisar informar nada.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="r-motivo">Quer contar o motivo? (opcional)</Label>
                <Textarea id="r-motivo" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              </div>

              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5">
                <p className="text-xs text-foreground/90 leading-relaxed">
                  Ao enviar, os ingressos escolhidos ficam <strong>bloqueados</strong> até a nossa resposta: não entram
                  no evento e não podem ser transferidos. Se mudar de ideia antes da resposta, é só desistir do pedido
                  aqui mesmo.
                </p>
              </div>

              <LinkDaPolitica />

              <Button variant="hero" className="w-full h-12" onClick={enviar} disabled={enviando || marcados.length === 0}>
                {enviando
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…</>
                  : marcados.length === 0 ? 'Escolha um ingresso' : `Pedir reembolso de ${brl(total)}`}
              </Button>
            </div>
          )}

          {passo === 'enviado' && resposta && (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-5 text-center">
                <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Check className="w-6 h-6 text-green-400" />
                </div>
                <p className="font-display font-semibold text-base">Pedido nº {resposta.numero}</p>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  Recebemos o seu pedido de reembolso de <strong className="text-foreground">{brl(resposta.valor_a_devolver)}</strong>{' '}
                  em {quandoBR(new Date().toISOString())}.
                </p>
                <p className="text-xs text-muted-foreground/80 mt-2 leading-relaxed">
                  Os ingressos ficam bloqueados até a resposta.{' '}
                  {resposta.forma === 'cartao'
                    ? 'Aprovado, o valor volta como estorno no cartão da compra.'
                    : 'Aprovado, o valor volta por PIX na chave informada.'}
                </p>
              </div>
              <Button variant="outline" className="w-full" onClick={fechar}>Fechar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function LinkDaPolitica() {
  return (
    <p className="text-[11px] text-muted-foreground text-center">
      Prazos e regras completas na{' '}
      <Link to={CAMINHOS_LEGAIS.reembolso} target="_blank" className="underline underline-offset-2 hover:text-foreground">
        Política de Reembolso
      </Link>.
    </p>
  );
}
