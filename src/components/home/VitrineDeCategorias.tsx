/*
 * A vitrine de categorias da home — UMA LINHA que arrasta para o lado.
 *
 * Terceira versão. O Gabriel reprovou as duas anteriores e foi específico
 * (24/09/2026): "quero uma linha única; o ícone pode ser maior; só o título, não
 * precisa colocar se tem evento; todas disponíveis; a pessoa arrasta para o lado
 * já que não cabe tudo numa linha só. E melhora o visual, deixa os ícones
 * bonitinhos, na cor, esse gradiente que a gente usa, com o fundo mais roxinho".
 *
 * Direção de arte (agente design-festpag, 24/09) e o que ela mudou aqui:
 *  - SEM caixa em volta de cada item. Só a pastilha do ícone tem superfície —
 *    logo abaixo vêm os cards de evento, que também são caixas com borda, e dois
 *    sistemas de card na mesma rolagem brigam. Foi o maior ganho da revisão.
 *  - o "roxinho" é o MEIO da rampa do gradiente da casa (índigo → rosa), não uma
 *    cor nova: entra como um banho radial atrás do trilho.
 *  - o esfumaçado das pontas é MÁSCARA, não div por cima: um div da cor do fundo
 *    taparia o banho roxo e viraria mancha cinza.
 *  - as setas ficam na altura do ÍCONE (não do centro do bloco), senão descem
 *    por causa da segunda linha do rótulo.
 *
 * Categoria sem evento é igual a todas as outras — quem clicar cai numa tela que
 * diz que ainda não há nada ali (tratado na Index).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Music, PartyPopper, FerrisWheel, UtensilsCrossed, Trophy, HeartHandshake,
  Drama, Laugh, Presentation, Palette, Baby, Shapes, ChevronLeft, ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { categoriasDaVitrine, rotuloCurto, type IconeDeCategoria } from '@/lib/categorias-de-evento';

const ICONES: Record<IconeDeCategoria, LucideIcon> = {
  Music, PartyPopper, FerrisWheel, UtensilsCrossed, Trophy, HeartHandshake,
  Drama, Laugh, Presentation, Palette, Baby, Shapes,
};

/** Máscara das pontas: só esfuma o lado que de fato tem conteúdo escondido. */
function mascara(antes: boolean, depois: boolean): string | undefined {
  if (!antes && !depois) return undefined;
  const ini = antes ? 'transparent 0, #000 28px' : '#000 0';
  const fim = depois ? '#000 calc(100% - 72px), transparent 100%' : '#000 100%';
  return `linear-gradient(to right, ${ini}, ${fim})`;
}

interface Props {
  /** null = "Todos". */
  selecionada: string | null;
  aoSelecionar: (slug: string | null) => void;
}

export function VitrineDeCategorias({ selecionada, aoSelecionar }: Props) {
  const categorias = categoriasDaVitrine();
  const trilhoRef = useRef<HTMLUListElement>(null);
  // Sem isto a pessoa não sabe que há mais categorias fora da tela.
  const [temAntes, setTemAntes] = useState(false);
  const [temDepois, setTemDepois] = useState(false);

  const medir = useCallback(() => {
    const el = trilhoRef.current;
    if (!el) return;
    setTemAntes(el.scrollLeft > 8);
    setTemDepois(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
  }, []);

  useEffect(() => {
    medir();
    const el = trilhoRef.current;
    if (!el) return;
    // ResizeObserver porque girar o celular muda o que cabe na linha.
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [medir]);

  const arrastar = (direcao: 1 | -1) => {
    const el = trilhoRef.current;
    if (!el) return;
    const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direcao * el.clientWidth * 0.8, behavior: suave ? 'smooth' : 'auto' });
  };

  const mascaraAtual = mascara(temAntes, temDepois);

  return (
    <section aria-label="Categorias de evento" className="relative pt-8 pb-2">
      {/* Sem fundo próprio desde 24/09: quem pinta é o <FundoDaPagina />. Cada
        * bloco com o seu fundo era o que criava as emendas em faixa. */}
      <div className="container relative mx-auto px-4">
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-bold md:text-3xl">
            Explore por <span className="gradient-text">categoria</span>
          </h2>
          {selecionada && (
            <button
              type="button"
              onClick={() => aoSelecionar(null)}
              className="whitespace-nowrap text-sm font-medium text-primary hover:underline"
            >
              Ver todos
            </button>
          )}
        </div>

        <div className="group/trilho relative">
          <ul
            ref={trilhoRef}
            onScroll={medir}
            style={{ maskImage: mascaraAtual, WebkitMaskImage: mascaraAtual }}
            className="scrollbar-none -mx-4 flex snap-x snap-proximity gap-5 overflow-x-auto scroll-smooth px-4 pb-4 pt-1 motion-reduce:scroll-auto"
          >
            {categorias.map((c) => {
              const Icone = ICONES[c.icone];
              const ativo = selecionada === c.slug;
              return (
                <li key={c.slug} className="w-[116px] shrink-0 snap-start">
                  <button
                    type="button"
                    onClick={() => aoSelecionar(ativo ? null : c.slug)}
                    aria-pressed={ativo}
                    title={c.nome}
                    className="group/item flex w-full flex-col items-center rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    {/* A pastilha é a ÚNICA superfície do item. O ideal de
                      * hierarquia seria o gradiente cheio só na escolhida, mas o
                      * Gabriel pediu cor na fileira inteira — então todas vêm com
                      * o gradiente e a escolhida se separa por escala, brilho e
                      * anel. */}
                    <span
                      className={[
                        'flex h-[76px] w-[76px] items-center justify-center rounded-[22px] bg-gradient-primary',
                        'transition-[transform,box-shadow,outline-color] duration-200',
                        'motion-reduce:transition-none motion-reduce:group-hover/item:scale-100',
                        ativo
                          ? 'scale-105 outline outline-2 outline-offset-2 outline-primary shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.65)]'
                          : 'outline outline-2 outline-offset-2 outline-transparent shadow-[0_6px_18px_-10px_hsl(var(--primary)/0.55)] group-hover/item:scale-105 group-hover/item:shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.6)]',
                      ].join(' ')}
                    >
                      <Icone className="h-8 w-8 text-primary-foreground" aria-hidden="true" strokeWidth={1.75} />
                    </span>
                    <span
                      className={[
                        'mt-2.5 line-clamp-2 h-8 text-[12.5px] leading-[1.15] transition-colors',
                        ativo
                          ? 'font-semibold text-foreground'
                          : 'font-medium text-foreground/70 group-hover/item:text-foreground',
                      ].join(' ')}
                    >
                      {rotuloCurto(c)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Setas: no computador, quem usa mouse sem trackpad não consegue rolar
            * de lado. Ficam na altura do ÍCONE, não do centro do bloco. */}
          {temAntes && (
            <button
              type="button"
              onClick={() => arrastar(-1)}
              aria-label="Ver categorias anteriores"
              className="absolute -left-2 top-[42px] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-card/85 text-foreground/80 opacity-0 backdrop-blur transition-opacity hover:border-primary/50 focus-visible:opacity-100 group-hover/trilho:opacity-100 md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {temDepois && (
            <button
              type="button"
              onClick={() => arrastar(1)}
              aria-label="Ver mais categorias"
              className="absolute -right-2 top-[42px] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-card/85 text-foreground/80 opacity-0 backdrop-blur transition-opacity hover:border-primary/50 focus-visible:opacity-100 group-hover/trilho:opacity-100 md:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
