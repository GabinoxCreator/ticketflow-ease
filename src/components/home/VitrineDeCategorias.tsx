/*
 * A vitrine de categorias da home — cards com ícone, logo abaixo do banner.
 *
 * Pedido do Gabriel em 24/09/2026, depois de ver a primeira versão: "você criou
 * uma barra muito simples, só um botãozinho e uma tag; eu quero com uns
 * quadradinhos, ícone, e com TODAS as categorias — se o cara clicar numa que não
 * tem evento, beleza, não aparece evento nenhum". Referência: as "coleções" da
 * Sympla.
 *
 * Por isso todas aparecem, inclusive as vazias. O card diz quantos eventos tem,
 * então ninguém clica achando que vai encontrar coisa — e quem clica numa vazia
 * cai numa tela que explica, não num branco.
 */
import {
  Music, PartyPopper, FerrisWheel, UtensilsCrossed, Trophy, HeartHandshake,
  Drama, Laugh, Presentation, Palette, Baby, Shapes, type LucideIcon,
} from 'lucide-react';
import { categoriasDaVitrine, contarPorCategoria, type IconeDeCategoria } from '@/lib/categorias-de-evento';

const ICONES: Record<IconeDeCategoria, LucideIcon> = {
  Music, PartyPopper, FerrisWheel, UtensilsCrossed, Trophy, HeartHandshake,
  Drama, Laugh, Presentation, Palette, Baby, Shapes,
};

interface Props {
  /** A categoria de cada evento já visível na home. */
  categoriasDosEventos: Array<string | null | undefined>;
  /** null = "Todos". */
  selecionada: string | null;
  aoSelecionar: (slug: string | null) => void;
}

export function VitrineDeCategorias({ categoriasDosEventos, selecionada, aoSelecionar }: Props) {
  const categorias = categoriasDaVitrine();
  const contagem = contarPorCategoria(categoriasDosEventos);

  return (
    <section aria-label="Categorias de evento" className="container mx-auto px-4 pt-10 pb-2">
      <div className="flex items-end justify-between gap-4 mb-4">
        <h2 className="font-display font-bold text-2xl md:text-3xl">
          Explore por <span className="gradient-text">categoria</span>
        </h2>
        {selecionada && (
          <button
            type="button"
            onClick={() => aoSelecionar(null)}
            className="text-sm font-medium text-primary hover:underline whitespace-nowrap"
          >
            Ver todos
          </button>
        )}
      </div>

      {/* Rola de lado no celular e vira grade no computador. A barra de rolagem
        * fica escondida; o respiro no fim evita o último card colado na borda. */}
      <ul
        className="flex gap-3 overflow-x-auto pb-3 -mx-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                   md:mx-0 md:px-0 md:overflow-visible md:grid md:grid-cols-4 lg:grid-cols-6"
      >
        {categorias.map((c) => {
          const Icone = ICONES[c.icone];
          const quantos = contagem.get(c.slug) ?? 0;
          const ativo = selecionada === c.slug;
          return (
            <li key={c.slug} className="shrink-0 w-[132px] md:w-auto">
              <button
                type="button"
                onClick={() => aoSelecionar(ativo ? null : c.slug)}
                aria-pressed={ativo}
                className={[
                  'group flex h-full w-full flex-col items-center justify-start gap-2 rounded-2xl border p-4 text-center transition-all duration-200',
                  ativo
                    ? 'border-primary/70 bg-primary/10 shadow-lg shadow-primary/10'
                    : 'border-border/60 bg-card/50 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card/80',
                  // Categoria sem evento continua clicável, só mais discreta — a
                  // pessoa vê que existe e que ainda não tem nada.
                  quantos === 0 && !ativo ? 'opacity-60' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-11 w-11 items-center justify-center rounded-xl border transition-colors',
                    ativo
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-border/50 bg-background/60 text-muted-foreground group-hover:text-primary',
                  ].join(' ')}
                >
                  <Icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className={`text-sm font-medium leading-tight ${ativo ? 'text-foreground' : 'text-foreground/90'}`}>
                  {c.nome}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {quantos === 0 ? 'em breve' : quantos === 1 ? '1 evento' : `${quantos} eventos`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
