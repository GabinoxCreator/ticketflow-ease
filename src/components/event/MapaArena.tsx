import { useState } from 'react';
import { motion } from 'framer-motion';
import { Info, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MapaDeArena, SetorDaArena } from '@/data/mapasDeArena';

/*
 * A planta da arena, em perspectiva — para o comprador entender o lugar antes
 * de escolher onde ficar.
 *
 * Por que 3D em CSS e não uma biblioteca: a página do evento é o funil de venda,
 * e cada quilobyte a mais atrasa o primeiro toque de quem chega pelo celular no
 * 4G do interior. Um three.js passa de 500 KB para desenhar cinco caixas. Aqui
 * são `transform` e `perspective` — zero dependência, e o navegador entrega na
 * GPU.
 *
 * O que a perspectiva resolve de verdade: o setor de camarote é uma arquibancada
 * de cinco fileiras que sobem. Numa planta vista de cima, "degrau 1" e
 * "degrau 5" são dois retângulos iguais lado a lado, e ninguém entende que um
 * está mais alto e mais perto do show. Inclinado, isso se explica sozinho.
 *
 * ⚠️ Toque, não hover. A maioria abre no celular, onde hover não existe: o
 * detalhe do setor abre no clique e some no clique de novo, e a mesma coisa
 * funciona no teclado.
 */

interface Props {
  mapa: MapaDeArena;
  className?: string;
}

/** Fileira do camarote. A de baixo (colada na arena) é a mais alta e opaca. */
function Degrau({ indice, total, aceso }: { indice: number; total: number; aceso: boolean }) {
  // A fileira 1 encosta na arena; as seguintes recuam e perdem força. É a
  // mesma gradação do croqui aprovado, agora com altura.
  const forca = 1 - (indice / Math.max(total, 1)) * 0.55;
  const altura = 26 - indice * 3.2;

  return (
    <div
      className="relative rounded-[2px] transition-all duration-500"
      style={{
        height: `${altura}px`,
        background: '#1E9BF0',
        opacity: aceso ? forca : forca * 0.62,
        transform: `translateZ(${(total - indice) * 7}px)`,
        boxShadow: aceso ? `0 0 18px rgba(30,155,240,${0.28 * forca})` : 'none',
      }}
    />
  );
}

export function MapaArena({ mapa, className }: Props) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [girado, setGirado] = useState(true);

  const setorAberto: SetorDaArena | undefined =
    mapa.setores.find((s) => s.id === aberto);

  const alternar = (id: string) => setAberto((atual) => (atual === id ? null : id));

  /** Rótulo clicável de um setor — mesma caixa para mouse, toque e teclado. */
  const Setor = ({
    setor, cls, style, children,
  }: {
    setor: SetorDaArena; cls?: string; style?: React.CSSProperties; children?: React.ReactNode;
  }) => {
    const aceso = aberto === null || aberto === setor.id;
    return (
      <button
        type="button"
        onClick={() => alternar(setor.id)}
        aria-pressed={aberto === setor.id}
        aria-label={`${setor.nome}: ${setor.descricao}`}
        className={cn(
          'group relative flex flex-col items-center justify-center rounded-sm',
          'transition-all duration-500 cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          cls,
        )}
        style={{
          background: setor.cor,
          opacity: aceso ? 1 : 0.45,
          ...style,
        }}
      >
        {children ?? (
          <span
            className="font-mono text-[10px] sm:text-xs font-bold tracking-[0.14em] uppercase px-1 text-center leading-tight"
            style={{ color: setor.textoEscuro ? '#3D2600' : '#FFFFFF' }}
          >
            {setor.nome}
          </span>
        )}
      </button>
    );
  };

  const palco = mapa.setores.find((s) => s.id === 'palco')!;
  const arena = mapa.setores.find((s) => s.id === 'arena')!;
  const boate = mapa.setores.find((s) => s.id === 'boate')!;
  const camarote = mapa.setores.find((s) => s.id === 'camarote')!;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={cn('rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl overflow-hidden', className)}
    >
      <div className="flex items-start justify-between gap-3 px-5 md:px-6 pt-5 pb-3">
        <div className="min-w-0">
          <h3 className="font-display font-bold text-lg">{mapa.titulo}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{mapa.resumo}</p>
        </div>
        <button
          type="button"
          onClick={() => setGirado((g) => !g)}
          aria-label={girado ? 'Ver a planta de cima' : 'Ver a planta em perspectiva'}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {girado ? 'Ver de cima' : 'Perspectiva'}
        </button>
      </div>

      {/* O chão de terra do rodeio, com a poeira dourada do banner. */}
      <div
        className="relative px-4 sm:px-8 py-8 sm:py-12"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, rgba(245,166,35,.16) 0%, rgba(245,166,35,.05) 38%, transparent 70%), linear-gradient(180deg, #0C0F14 0%, #15110B 100%)',
        }}
      >
        <div
          className="mx-auto w-full max-w-[560px] transition-transform duration-700 ease-out motion-reduce:transition-none"
          style={{
            perspective: '1100px',
            perspectiveOrigin: '50% 30%',
          }}
        >
          <div
            className="transition-transform duration-700 ease-out motion-reduce:transform-none"
            style={{
              transformStyle: 'preserve-3d',
              transform: girado
                ? 'rotateX(54deg) rotateZ(-27deg) scale(.92)'
                : 'rotateX(0deg) rotateZ(0deg) scale(1)',
            }}
          >
            {/* Palco na cabeceira, mais alto que o resto. */}
            <div className="flex justify-center mb-1.5" style={{ transform: 'translateZ(34px)' }}>
              <Setor setor={palco} cls="h-11 w-[52%] shadow-lg" />
            </div>

            <div className="flex gap-1.5 items-stretch">
              {/* Boate à esquerda, com a porta embaixo. */}
              <div className="w-[22%] flex flex-col gap-1" style={{ transform: 'translateZ(16px)' }}>
                <Setor setor={boate} cls="flex-1 min-h-[150px]" />
                <Porta />
              </div>

              {/* Arena no centro: o chão, sem altura nenhuma. */}
              <Setor
                setor={arena}
                cls="flex-1 min-h-[150px] border border-white/10"
              >
                <span className="font-mono text-[10px] sm:text-xs font-bold tracking-[0.14em] uppercase text-white/45">
                  {arena.nome}
                </span>
                <span className="font-mono text-[9px] text-white/30 mt-0.5">entrada gratuita</span>
              </Setor>

              {/* Camarote à direita: as cinco fileiras, subindo. */}
              <div className="w-[30%] flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => alternar(camarote.id)}
                  aria-pressed={aberto === camarote.id}
                  aria-label={`${camarote.nome}: ${camarote.descricao}`}
                  className="flex-1 min-h-[150px] flex flex-col justify-end gap-[3px] rounded-sm p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  style={{ transformStyle: 'preserve-3d' }}
                >
                  {Array.from({ length: mapa.camarote.degraus }).map((_, i) => (
                    <Degrau
                      key={i}
                      indice={mapa.camarote.degraus - 1 - i}
                      total={mapa.camarote.degraus}
                      aceso={aberto === null || aberto === camarote.id}
                    />
                  ))}
                </button>
                <Porta />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legenda e detalhe. O detalhe substitui a legenda quando algo é tocado. */}
      <div className="px-5 md:px-6 py-4 border-t border-border/40 min-h-[92px]">
        {setorAberto ? (
          <motion.div
            key={setorAberto.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <span
              className="w-3 h-3 rounded-sm shrink-0 mt-1 border border-white/25"
              style={{ background: setorAberto.cor }}
            />
            <div className="min-w-0">
              <p className="font-semibold text-sm">{setorAberto.nome}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{setorAberto.descricao}</p>
              {setorAberto.id === 'camarote' && (
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  {mapa.camarote.degraus} fileiras · {mapa.camarote.porDegrau} camarotes em cada ·
                  {' '}até {mapa.camarote.pessoas} pessoas por camarote.
                  <br />
                  {mapa.camarote.notaDeOrdem}
                </p>
              )}
            </div>
          </motion.div>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {mapa.setores.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => alternar(s.id)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {/* Borda em todas: sem ela, a bolinha da arena (quase preta)
                      some no fundo escuro e o setor fica sem legenda. */}
                  <span
                    className="w-3 h-3 rounded-sm shrink-0 border border-white/25"
                    style={{ background: s.cor }}
                  />
                  {s.nome}
                </button>
              ))}
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-3">
              <Info className="w-3 h-3 shrink-0" />
              Toque num setor para saber o que é. {mapa.entradas}
            </p>
          </>
        )}
      </div>
    </motion.section>
  );
}

/** A porta do setor — fica na base, como o produtor confirmou. */
function Porta() {
  return (
    <div className="flex items-center justify-center gap-1 h-[13px] rounded-[2px] bg-white/12 border border-white/20">
      <span className="font-mono text-[7px] tracking-[0.12em] uppercase text-white/55">entrada</span>
    </div>
  );
}

export default MapaArena;
