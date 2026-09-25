/*
 * O carrossel de banners da home — o primeiro bloco da página.
 *
 * Pedido do Gabriel em 24/09/2026, mostrando a home da Sympla: "ele tem essa
 * primeira aba onde fica a nossa frase. A gente trabalharia assim, com os
 * banners ali passando. Não precisa pôr o nome do evento nem nada, só os banners
 * passando". Fora os eventos, ele vai produzir banners da própria FestPag —
 * um sobre a facial no cadastro e outro sobre o totem de retirada de fichas.
 *
 * Desenho: o banner do meio em tamanho cheio, os vizinhos encolhidos e apagados
 * nas laterais, setas, e bolinhas embaixo. A arte é o conteúdo: nenhum texto
 * nosso por cima dela — o banner já traz o que precisa dizer.
 *
 * De onde vêm os banners:
 *  1. BANNERS_FESTPAG, logo abaixo — as peças institucionais. Enquanto a arte
 *     não existe, o item mostra um cartaz do tamanho certo com o gradiente da
 *     marca, para ninguém confundir com banner pronto.
 *  2. os eventos publicados, na ordem em que a home já os recebe.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import bannerFacial from '@/assets/banners/banner-facial.jpg';
import bannerTotem from '@/assets/banners/banner-totem.jpg';

/**
 * As peças da FestPag. A arte (cena + totem real) é 16:7 e vem SEM texto: o
 * texto entra aqui, em HTML, no painel claro que a própria arte reserva à
 * ESQUERDA — cerca de 36% da largura. Passar disso encosta na foto.
 *
 * A arte foi montada em 24/09/2026: a cena veio do Higgsfield e o totem é o
 * equipamento REAL, com a tela verdadeira do sistema, colado por cima. Nunca
 * gerar o equipamento por IA — é rejeição registrada da casa.
 */
interface BannerFestPag {
  id: string;
  titulo: string;
  linha: string;
  chamada: string;
  para: string;
  imagem: string;
}

const BANNERS_FESTPAG: BannerFestPag[] = [
  {
    id: 'facial',
    titulo: 'Seu rosto é o seu ingresso',
    // ⚠️ A frase NÃO promete cadastrar a facial na hora da compra. O convite
    // existe no cadastro, mas nenhuma das 87 contas criadas desde a virada do
    // login (10/09/2026) chegou a cadastrar — está sendo investigado. Prometer
    // o que não acontece é pior do que não prometer.
    linha: 'Na portaria, olhe para a câmera e entre. Sem procurar ingresso no celular.',
    chamada: 'Como funciona',
    para: '/ajuda',
    imagem: bannerFacial,
  },
  {
    id: 'totem',
    titulo: 'Peça no totem, pule a fila do caixa',
    linha: 'A ficha do bar e da comida sai impressa em segundos.',
    chamada: 'Ver como funciona',
    para: '/area-do-produtor',
    imagem: bannerTotem,
  },
];

interface EventoDoBanner {
  id: string;
  slug?: string | null;
  title: string;
  imageUrl: string;
}

interface Props {
  eventos: EventoDoBanner[];
}

export function CarrosselDeBanners({ eventos }: Props) {
  // `containScroll: 'keepSnaps'` + `slidesToScroll: 1`: sem isso o embla agrupa
  // os slides e a contagem de bolinhas não bate com o número de banners (deu 2
  // para 5 banners na primeira tentativa).
  const [emblaRef, embla] = useEmblaCarousel({
    loop: true,
    align: 'center',
    containScroll: 'keepSnaps',
    slidesToScroll: 1,
  });
  const [atual, setAtual] = useState(0);
  const [total, setTotal] = useState(0);
  const pausado = useRef(false);

  // Mede a posição E a quantidade de paradas. As duas juntas de propósito: a
  // contagem muda quando as imagens dos banners terminam de carregar e o embla
  // refaz as contas. Medindo só no primeiro render, dava 2 bolinhas para 5
  // banners — o número era do layout antes das imagens.
  const medir = useCallback(() => {
    if (!embla) return;
    setAtual(embla.selectedScrollSnap());
    setTotal(embla.scrollSnapList().length);
  }, [embla]);

  useEffect(() => {
    if (!embla) return;
    medir();
    embla.on('select', medir);
    embla.on('reInit', medir);
    return () => {
      embla.off('select', medir);
      embla.off('reInit', medir);
    };
  }, [embla, medir]);

  // Cada imagem que chega muda a altura do slide: sem este reInit o carrossel
  // fica com as medidas do momento em que ainda não havia imagem nenhuma.
  useEffect(() => {
    if (!embla) return;
    const raiz = embla.rootNode();
    const imagens = Array.from(raiz.querySelectorAll('img'));
    const pendentes = imagens.filter((img) => !img.complete);
    if (pendentes.length === 0) return;
    const aoCarregar = () => embla.reInit();
    pendentes.forEach((img) => {
      img.addEventListener('load', aoCarregar);
      img.addEventListener('error', aoCarregar);
    });
    return () => pendentes.forEach((img) => {
      img.removeEventListener('load', aoCarregar);
      img.removeEventListener('error', aoCarregar);
    });
  }, [embla, eventos.length]);

  // Passa sozinho. Para quando o mouse entra e para quem pediu menos movimento
  // no sistema — banner que anda sozinho e não pode ser parado irrita.
  useEffect(() => {
    if (!embla) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => {
      if (!pausado.current) embla.scrollNext();
    }, 6000);
    return () => window.clearInterval(t);
  }, [embla]);

  const itens = [
    ...BANNERS_FESTPAG.map((b) => ({ tipo: 'festpag' as const, dados: b })),
    ...eventos.map((e) => ({ tipo: 'evento' as const, dados: e })),
  ];
  if (itens.length === 0) return null;

  return (
    <section aria-label="Destaques" className="relative pt-6 pb-2">
      <div
        className="group/car relative"
        onMouseEnter={() => (pausado.current = true)}
        onMouseLeave={() => (pausado.current = false)}
      >
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex touch-pan-y">
            {itens.map((item, i) => {
              const ativo = i === atual;
              // O vizinho encolhe e apaga: é o que dá a profundidade do
              // carrossel da Sympla sem precisar de imagem extra.
              const caixa = [
                'relative min-w-0 shrink-0 grow-0 basis-[86%] px-2 transition-all duration-500 sm:basis-[72%] lg:basis-[58%]',
                ativo ? 'scale-100 opacity-100' : 'scale-[0.88] opacity-55',
              ].join(' ');

              if (item.tipo === 'evento') {
                const e = item.dados;
                return (
                  <div key={`ev-${e.id}`} className={caixa}>
                    <Link
                      to={`/evento/${e.slug || e.id}`}
                      className="block overflow-hidden rounded-2xl shadow-xl ring-1 ring-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      tabIndex={ativo ? 0 : -1}
                    >
                      {/* 16:7 é a proporção de cartaz de evento; a arte manda. */}
                      <img
                        src={e.imageUrl}
                        alt={e.title}
                        loading={i < 2 ? 'eager' : 'lazy'}
                        className="aspect-[16/7] w-full bg-muted object-cover"
                      />
                    </Link>
                  </div>
                );
              }

              const b = item.dados;
              return (
                <div key={`fp-${b.id}`} className={caixa}>
                  <Link
                    to={b.para}
                    className="relative block overflow-hidden rounded-2xl shadow-xl ring-1 ring-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    tabIndex={ativo ? 0 : -1}
                  >
                    <img src={b.imagem} alt={b.titulo} className="aspect-[16/7] w-full object-cover" />
                    {/* O texto mora no painel claro que a arte reserva à esquerda.
                      * 36% da largura — a 42% já encostava na foto. */}
                    <div className="absolute inset-y-0 left-0 flex w-[42%] flex-col justify-center gap-1.5 px-[4%] sm:w-[38%] sm:gap-2.5">
                      <p className="font-display text-[13px] font-bold leading-[1.15] text-foreground sm:text-xl md:text-2xl lg:text-3xl">
                        {b.titulo}
                      </p>
                      {/* Some no celular: no slide de 319px não sobra altura. */}
                      <p className="hidden text-[11px] leading-snug text-muted-foreground sm:block md:text-sm">
                        {b.linha}
                      </p>
                      <span className="mt-0.5 w-fit rounded-full bg-gradient-primary px-2.5 py-1 text-[9px] font-semibold text-primary-foreground sm:mt-1 sm:px-4 sm:py-1.5 sm:text-xs">
                        {b.chamada}
                      </span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => embla?.scrollPrev()}
              aria-label="Banner anterior"
              className="absolute left-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur transition hover:border-primary/60 hover:text-primary md:flex lg:left-6"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => embla?.scrollNext()}
              aria-label="Próximo banner"
              className="absolute right-2 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/90 text-foreground shadow-lg backdrop-blur transition hover:border-primary/60 hover:text-primary md:flex lg:right-6"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            <div className="mt-4 flex items-center justify-center gap-2">
              {Array.from({ length: total }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => embla?.scrollTo(i)}
                  aria-label={`Ir para o banner ${i + 1}`}
                  aria-current={i === atual ? 'true' : undefined}
                  className={[
                    'h-2 rounded-full transition-all duration-300',
                    i === atual ? 'w-6 bg-gradient-primary' : 'w-2 bg-border hover:bg-muted-foreground/50',
                  ].join(' ')}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
