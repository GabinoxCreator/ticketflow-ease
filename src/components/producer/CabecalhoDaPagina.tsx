/**
 * Cabeçalho das páginas do painel do produtor (OS-408, etapa 5, item 5.9): o mesmo de
 * "Financeiro" (ícone na cor da marca, título, uma linha de explicação e, à direita, o
 * botão principal da página). Antes cada página tinha o seu: faixa colorida em Tipos de
 * Assento, Produtos e Configurações, título em degradê em Criar evento, outro tamanho em
 * Locais. As páginas também passam a ter a mesma largura (a da área do painel inteira).
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function CabecalhoDaPagina({ icone: Icone, titulo, descricao, acao }: {
  icone: LucideIcon;
  titulo: string;
  descricao?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <Icone className="w-7 h-7 text-primary shrink-0" />
          {titulo}
        </h1>
        {descricao && <p className="text-muted-foreground mt-1 text-sm">{descricao}</p>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}
