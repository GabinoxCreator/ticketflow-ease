import type { LucideIcon } from 'lucide-react';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export interface AcaoComNome {
  /** O nome que o produtor lê ("Editar", "Excluir", "Marcar como esgotado"). */
  nome: string;
  icone: LucideIcon;
  onClick: () => void;
  /** Ação que apaga ou para de vender: vermelha. */
  perigo?: boolean;
  /** Cor própria do ícone (ex.: laranja do esgotar), em classe do Tailwind. */
  cor?: string;
}

interface Props {
  acoes: AcaoComNome[];
  /** De quem são as ações, para o leitor de tela: "o ingresso VIP", "o cupom AMIGOS10". */
  de: string;
}

// Todo ícone do painel tem nome (OS-408). No computador, os ícones ficam lado a
// lado, cada um com o nome para o leitor de tela e a dica ao passar o mouse. No
// celular não existe "passar o mouse": viram um menu de três pontinhos com o nome
// escrito, e o dedo não erra entre três ícones colados.
export function AcoesComNome({ acoes, de }: Props) {
  const celular = useIsMobile();

  if (celular) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" aria-label={`Ações d${de}`}>
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {acoes.map((a) => (
            <DropdownMenuItem
              key={a.nome}
              onClick={a.onClick}
              className={cn(a.perigo && 'text-destructive focus:text-destructive')}
            >
              <a.icone className={cn('w-4 h-4 mr-2', !a.perigo && a.cor)} />
              {a.nome}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0">
      {acoes.map((a) => (
        <Button
          key={a.nome}
          variant="ghost"
          size="icon"
          className={cn('h-8 w-8', a.perigo && 'text-destructive hover:text-destructive', a.cor)}
          title={a.nome}
          aria-label={`${a.nome} ${de}`}
          onClick={a.onClick}
        >
          <a.icone className="w-4 h-4" />
        </Button>
      ))}
    </div>
  );
}
