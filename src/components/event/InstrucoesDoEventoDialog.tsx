import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Ticket, UserCheck, CalendarDays, Armchair, PartyPopper, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chaveDeLeitura, type InstrucoesDoEvento } from '@/data/instrucoesDoEvento';

/*
 * O "como funciona" do evento, uma vez por pessoa.
 *
 * Pop-up ao abrir uma página é quase sempre uma má ideia — atrapalha quem já
 * sabe o que quer. Aqui ele se paga porque as regras deste evento SURPREENDEM, e
 * cada uma delas decepciona quando descoberta tarde: a arena é de graça, é 1
 * ingresso por CPF em cada noite, e o passe trava no CPF de quem usar.
 *
 * Por isso vem com três travas de bom senso:
 *
 *  1. UMA VEZ SÓ. Quem leu não vê de novo — fica marcado no navegador. Se o
 *     texto mudar de verdade, a versão sobe e todo mundo vê a correção.
 *  2. DEPOIS DA PÁGINA. Espera um instante antes de abrir; aparecer em cima do
 *     carregamento faz a pessoa fechar no reflexo, sem ler.
 *  3. TEM COMO VOLTAR. Fechar não some com a informação: fica um "Como funciona"
 *     ao lado do título dos ingressos.
 *
 * ⚠️ Só existe em evento com instruções curadas. Os outros não mostram nada.
 */

const ICONES = { Ticket, UserCheck, CalendarDays, Armchair, PartyPopper } as const;

interface Props {
  eventId: string;
  instrucoes: InstrucoesDoEvento;
  /** Aberto por fora (o botão "Como funciona"). */
  abertoPorFora?: boolean;
  onFecharPorFora?: () => void;
}

export function InstrucoesDoEventoDialog({ eventId, instrucoes, abertoPorFora, onFecharPorFora }: Props) {
  const [aberto, setAberto] = useState(false);
  const chave = chaveDeLeitura(eventId, instrucoes.versao);

  useEffect(() => {
    if (abertoPorFora) { setAberto(true); return; }
    let jaLeu = false;
    try {
      jaLeu = localStorage.getItem(chave) === '1';
    } catch {
      // Navegador sem armazenamento (aba anônima com restrição): trata como já
      // lido. Melhor não mostrar do que mostrar a cada toque na tela.
      jaLeu = true;
    }
    if (jaLeu) return;
    // Deixa a página desenhar antes. Pop-up que nasce junto com o conteúdo é
    // fechado no reflexo, sem ninguém ler uma linha.
    const t = setTimeout(() => setAberto(true), 900);
    return () => clearTimeout(t);
  }, [chave, abertoPorFora]);

  const fechar = () => {
    setAberto(false);
    onFecharPorFora?.();
    try { localStorage.setItem(chave, '1'); } catch { /* sem storage, sem marca */ }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => (o ? setAberto(true) : fechar())}>
      <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl leading-snug">{instrucoes.titulo}</DialogTitle>
          <DialogDescription>{instrucoes.subtitulo}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-4 py-1">
          {instrucoes.passos.map((p) => {
            const Icone = ICONES[p.icone] ?? Ticket;
            return (
              <li key={p.titulo} className="flex gap-3">
                <div
                  className={cn(
                    'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                    p.atencao ? 'bg-amber-500/20' : 'bg-primary/15',
                  )}
                >
                  <Icone className={cn('w-4.5 h-4.5', p.atencao ? 'text-amber-400' : 'text-primary')} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-snug">{p.titulo}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{p.texto}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <Button variant="hero" size="lg" className="w-full h-12" onClick={fechar}>
          Entendi, quero meu ingresso
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** O caminho de volta: quem fechou sem ler ainda consegue abrir. */
export function BotaoComoFunciona({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
    >
      <HelpCircle className="w-3.5 h-3.5" />
      Como funciona
    </button>
  );
}

export default InstrucoesDoEventoDialog;
