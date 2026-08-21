import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CalendarDays, UserCheck, Repeat, MoonStar, Ticket, CheckCircle2 } from 'lucide-react';

/*
 * Como o passe permanente funciona — explicado por inteiro.
 *
 * A caixa do checkout ficou com uma linha só, para não competir com a decisão
 * de pagar. Mas as regras aqui têm consequência real e tardia: a pessoa só
 * descobre no dia do evento que o passe travou no CPF de quem entrou. Quem
 * compra para a família precisa ler ANTES, e precisa poder ler sem sair da
 * compra (Gabriel, 20/08).
 *
 * O conteúdo é o §4b e o §2 do framework do rodeio, em linguagem de quem
 * compra — não de quem programa.
 */

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  aceito: boolean;
  onAceitar: () => void;
}

const REGRAS = [
  {
    Icone: CalendarDays,
    titulo: 'Vale as 5 noites do rodeio',
    texto: 'De 7 a 11 de outubro. É um ingresso só, que serve para todas as noites — você não precisa comprar cada dia separado.',
  },
  {
    Icone: MoonStar,
    titulo: 'Uma entrada por noite',
    texto: 'Cada noite abre às 12h e fecha às 6h da manhã seguinte. Dentro de cada uma dessas janelas, o passe permite uma entrada.',
  },
  {
    Icone: Repeat,
    titulo: 'Pode passar para outra pessoa — até alguém usar',
    texto: 'Enquanto ninguém entrou no evento com ele, você pode transferir o passe uma vez, pelo site. Depois da primeira entrada, não dá mais.',
  },
  {
    Icone: UserCheck,
    titulo: 'Na primeira entrada, ele trava no CPF',
    texto: 'Quem passar na portaria pela primeira vez fica sendo o dono do passe até o fim do evento. As outras noites são dessa mesma pessoa — não dá para revezar entre amigos.',
  },
  {
    Icone: Ticket,
    titulo: 'Faltar uma noite não invalida as outras',
    texto: 'Se você não for numa das noites, o passe continua valendo normalmente nas seguintes. Nada é perdido.',
  },
];

export function PassePermanenteDialog({ open, onOpenChange, aceito, onAceitar }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl leading-snug">
            Ingresso Permanente válido para as 5 noites
          </DialogTitle>
        </DialogHeader>

        <ul className="space-y-4 py-1">
          {REGRAS.map(({ Icone, titulo, texto }) => (
            <li key={titulo} className="flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Icone className="w-4.5 h-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-snug">{titulo}</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{texto}</p>
              </div>
            </li>
          ))}
        </ul>

        {aceito ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/5 py-3 text-sm">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <span className="font-medium">Você já confirmou que leu</span>
          </div>
        ) : (
          <Button variant="hero" size="lg" className="w-full h-12" onClick={onAceitar}>
            Li e entendi, pode continuar
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
