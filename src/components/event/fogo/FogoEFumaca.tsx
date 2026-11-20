import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ImgHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  ABERTURA,
  BARRA,
  CHEGADA,
  DURANTE,
  FAIXA,
  FECHO,
  LOGO_DO_FOGO,
  LUGAR,
  OPEN_BAR,
  OPEN_FOOD,
  PALCO,
  PATROCINADORES,
  PATROCINIO,
  SETORES,
  type Foto,
  type Patrocinador,
  type Prato,
} from '@/data/fogoEFumaca';
import { CONSENT_CHANGED_EVENT, OPEN_PREFERENCES_EVENT, getConsent } from '@/lib/cookieConsent';
import './fogo.css';

/*
 * A página do Fogo & Fumaça com a cara do festival (OS-444, 19/11/2026).
 *
 * Na página do Fogo esta parte fica no lugar do "Sobre o evento" (decisão do Gabriel,
 * 19/11), logo depois dos ingressos. É o dia do festival numa linha: abre às 12h,
 * fecha às 21h e, no meio, o que rola durante, com os shows primeiro (pedido dele:
 * shows, open food, open bar, setores). O lugar fica por último, junto do fecho.
 * Só o começo e o fim têm hora, porque só eles têm hora divulgada. Conforme a pessoa
 * rola, a linha "queima" e cada parada acende.
 *
 * Cuidados que não são enfeite:
 * - O conteúdo nasce visível. O movimento só liga depois que o navegador confirma que
 *   dá (classe `fogo--vivo`): sem JavaScript ou com "reduzir movimento" ligado, nada
 *   fica escondido nem apagado.
 * - A linha só anda para a frente: parada que acendeu não apaga ao rolar de volta.
 * - Botão de ingresso só rola a página até os ingressos, lá em cima (não mexe em
 *   carrinho nem em pagamento), e some quando não há ingresso à venda (`temVenda`).
 * - Nenhuma foto baixa enquanto a pessoa está nos ingressos: as imagens só ganham
 *   endereço quando esta parte chega perto da tela (`Perto`). O `loading="lazy"`
 *   sozinho não garante: em rede lenta o navegador adianta foto que está a 2.500 px.
 * - Nada aqui fica animando sem parar: o único movimento é o da rolagem.
 */

/*
 * O tema do Fogo na página inteira (decisão do Gabriel, 19/11): enquanto um pedaço do
 * Fogo está na tela, o <body> leva a marca `data-tema-do-evento="fogo"`, e o estilo
 * (`fogo.css`) veste com as cores do festival a página do evento (menos o menu de
 * cima) e as janelas que abrem por cima dela (carrinho, pagamento, login). A marca
 * mora neste pedaço de propósito: se ele não baixar, nem a marca nem o estilo existem
 * e a página fica inteira no visual normal.
 */
let usosDoTema = 0;

// A letra dos títulos começa a baixar junto com este pedaço, e não só quando o primeiro
// título aparece: assim o nome do evento não troca de letra na frente da pessoa.
if (typeof document !== 'undefined' && 'fonts' in document) {
  document.fonts.load("400 1em 'Anton Fogo'").catch(() => {});
}
function useTemaDoFogo() {
  useLayoutEffect(() => {
    usosDoTema += 1;
    // no <html> também, só para o fundo atrás da página (rolagem elástica do iPhone)
    document.documentElement.setAttribute('data-tema-do-evento', 'fogo');
    document.body.setAttribute('data-tema-do-evento', 'fogo');
    return () => {
      usosDoTema -= 1;
      if (usosDoTema > 0) return;
      document.documentElement.removeAttribute('data-tema-do-evento');
      document.body.removeAttribute('data-tema-do-evento');
    };
  }, []);
}

/** Onde a página do evento marcou o título dos ingressos (`EventDetails.tsx`). */
const TITULO_DOS_INGRESSOS = '[data-titulo-ingressos]';

function rolarAte(alvo: Element | null) {
  const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = semMovimento ? 'auto' : 'smooth';
  if (!alvo) {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  // 96 px: a barra do topo do site é fixa e cobriria o alvo.
  const topo = alvo.getBoundingClientRect().top + window.scrollY - 96;
  window.scrollTo({ top: Math.max(topo, 0), behavior });
}

/** Rola até o bloco dos ingressos (ele fica acima, na mesma página). */
function irParaOsIngressos() {
  rolarAte(document.querySelector(TITULO_DOS_INGRESSOS));
}

function Seta({ paraBaixo }: { paraBaixo?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d={paraBaixo ? 'M8 3v10M4 9l4 4 4-4' : 'M3 8h10M9 4l4 4-4 4'} />
    </svg>
  );
}

/** Esta parte da página já está perto da tela? (as fotos só baixam depois disso) */
const Perto = createContext(false);

/** Imagem que só ganha endereço quando a seção chega perto da tela. */
function Imagem({ src, srcSet, alt, ...resto }: ImgHTMLAttributes<HTMLImageElement>) {
  const perto = useContext(Perto);
  return (
    <img
      {...resto}
      alt={alt}
      src={perto ? src : undefined}
      srcSet={perto ? srcSet : undefined}
      loading="lazy"
      decoding="async"
    />
  );
}

function FotoGrande({ foto, sizes }: { foto: Foto; sizes: string }) {
  return (
    <Imagem
      src={foto.grande}
      srcSet={`${foto.pequena} ${foto.larguraPequena}w, ${foto.grande} ${foto.largura}w`}
      sizes={sizes}
      width={foto.largura}
      height={foto.altura}
      alt={foto.alt}
    />
  );
}

function LinhaDoPrato({ prato }: { prato: Prato }) {
  return (
    <li>
      <span className="fogo-prato">
        {prato.nome}
        {prato.nota && <small> ({prato.nota})</small>}
      </span>
      {prato.assador && <span className="fogo-assador">por {prato.assador}</span>}
    </li>
  );
}

/**
 * Uma parada da linha. Com `hora`, é um ponto do dia com hora divulgada (marco grande);
 * sem, é algo que rola durante o festival (ponto pequeno, sem fingir horário).
 */
function Parada({
  id,
  hora,
  chamada,
  titulo,
  classe,
  children,
}: {
  id: string;
  hora?: string;
  chamada: string;
  titulo: string;
  classe?: string;
  children: ReactNode;
}) {
  return (
    <li
      className={['fogo-parada', hora ? 'fogo-parada--hora' : '', classe ?? ''].filter(Boolean).join(' ')}
      data-etapa
      aria-labelledby={`fogo-${id}`}
    >
      <span className="fogo-marco" aria-hidden="true" />
      <div className="fogo-cabeca">
        <p className="fogo-chamada">{chamada}</p>
        <h4 className="fogo-titulo" id={`fogo-${id}`}>
          {hora && <b>{hora} </b>}
          {titulo}
        </h4>
      </div>
      <div className="fogo-corpo">{children}</div>
    </li>
  );
}

/*
 * Tamanho de cada logo: todas ocupam mais ou menos a mesma ÁREA, para uma logo
 * quadrada não pesar mais que uma comprida. Devolve largura e altura na medida-base
 * (o estilo multiplica por tela e por fileira).
 */
function caixaDaLogo(marca: Patrocinador): CSSProperties {
  const proporcao = marca.largura / marca.altura;
  const AREA = 3400;
  const largura = Math.min(Math.sqrt(AREA * proporcao), 104);
  const altura = Math.min(largura / proporcao, 58);
  return { '--w': (altura * proporcao).toFixed(1), '--h': altura.toFixed(1) } as CSSProperties;
}

/**
 * A faixa curta do topo da página, antes dos ingressos: quem chega já vê que é o Fogo
 * e o que tem (rostos das 4 atrações, horário, open food, open bar). O toque leva à
 * parte de baixo. Estes 4 rostos (uns 2 kB cada) são as únicas imagens que baixam no
 * topo.
 */
export function FaixaDoFogo() {
  useTemaDoFogo();
  return (
    <button
      type="button"
      className="fogo-faixa"
      onClick={() => rolarAte(document.querySelector('[data-blocos-do-evento]'))}
    >
      <span className="fogo-rostos" aria-hidden="true">
        {PALCO.shows.map((show) => (
          <img key={show.nome} src={show.rosto} width={112} height={112} alt="" decoding="async" />
        ))}
      </span>
      <span className="fogo-faixa-texto">
        <span className="fogo-faixa-itens">
          {FAIXA.linhas.map((linha, i) => (
            <span key={linha[0]} className="fogo-faixa-linha">
              {/* o ponto entre as duas linhas só aparece quando elas viram uma (tela grande) */}
              {i > 0 && <i className="fogo-ponto fogo-ponto--entre"> · </i>}
              <span>{linha[0]}</span>
              <i className="fogo-ponto"> · </i>
              <span>{linha[1]}</span>
            </span>
          ))}
        </span>
        <span className="fogo-faixa-botao">
          {FAIXA.botao}
          <Seta paraBaixo />
        </span>
      </span>
    </button>
  );
}

export interface PropsDoFogo {
  /** Há ingresso à venda agora? Sem venda, botões de ingresso e barrinha somem. */
  temVenda: boolean;
  /** O rodapé da tela está livre? (falso quando a barra do carrinho está aparecendo) */
  rodapeLivre: boolean;
}

export default function FogoEFumaca({ temVenda, rodapeLivre }: PropsDoFogo) {
  useTemaDoFogo();
  const raiz = useRef<HTMLElement>(null);
  const trilha = useRef<HTMLDivElement>(null);
  const [perto, setPerto] = useState(false);
  const [naTela, setNaTela] = useState(false);
  const [cookiesAbertos, setCookiesAbertos] = useState(() => getConsent() === null);

  // O fundo escuro vai de ponta a ponta da tela. A medida vem da largura útil da
  // janela (sem a barra de rolagem), para não criar rolagem de lado.
  useEffect(() => {
    const secao = raiz.current;
    if (!secao) return;
    const medir = () => {
      const caixa = secao.getBoundingClientRect();
      const largura = document.documentElement.clientWidth;
      secao.style.setProperty('--esq', `${Math.max(caixa.left, 0)}px`);
      secao.style.setProperty('--dir', `${Math.max(largura - caixa.right, 0)}px`);
    };
    medir();
    window.addEventListener('resize', medir);
    const observador = 'ResizeObserver' in window ? new ResizeObserver(medir) : null;
    observador?.observe(document.documentElement);
    return () => {
      window.removeEventListener('resize', medir);
      observador?.disconnect();
    };
  }, []);

  // As fotos só baixam quando esta parte está a menos de 300 px da tela (com a pessoa
  // no topo da página ela fica a uns 500 a 800 px no celular: nada baixa); a barrinha do
  // celular só aparece com esta parte ocupando a tela.
  useEffect(() => {
    const secao = raiz.current;
    if (!secao || !('IntersectionObserver' in window)) {
      setPerto(true);
      return;
    }
    const vigiaDePerto = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setPerto(true);
          vigiaDePerto.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );
    vigiaDePerto.observe(secao);
    // "na tela" = a parte do Fogo cobre a faixa do meio da tela (nem só a pontinha de
    // cima, nem só a de baixo)
    const vigiaDaTela = new IntersectionObserver(
      (entradas) => setNaTela(entradas[entradas.length - 1].isIntersecting),
      { rootMargin: '-45% 0px -45% 0px' },
    );
    vigiaDaTela.observe(secao);
    return () => {
      vigiaDePerto.disconnect();
      vigiaDaTela.disconnect();
    };
  }, []);

  // O aviso de cookies ocupa o rodapé: enquanto ele está aberto, a barrinha espera.
  useEffect(() => {
    const abriu = () => setCookiesAbertos(true);
    const decidiu = () => setCookiesAbertos(false);
    window.addEventListener(OPEN_PREFERENCES_EVENT, abriu);
    window.addEventListener(CONSENT_CHANGED_EVENT, decidiu);
    return () => {
      window.removeEventListener(OPEN_PREFERENCES_EVENT, abriu);
      window.removeEventListener(CONSENT_CHANGED_EVENT, decidiu);
    };
  }, []);

  // A linha que queima: acompanha a rolagem e acende cada parada.
  useEffect(() => {
    const secao = raiz.current;
    const linha = trilha.current;
    if (!secao || !linha) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const paradas = Array.from(linha.querySelectorAll<HTMLElement>('[data-etapa]'));
    let queimado = 0; // até onde a linha já queimou, em px (só cresce)
    let quadro = 0;

    const medir = () => {
      quadro = 0;
      const caixa = linha.getBoundingClientRect();
      if (!caixa.height) return;
      // a brasa anda um pouco abaixo do meio da tela
      const ponto = window.innerHeight * 0.62 - caixa.top;
      queimado = Math.min(Math.max(ponto, queimado, 0), caixa.height);
      linha.style.setProperty('--y', `${queimado}px`);
      linha.style.setProperty('--p', String(queimado / caixa.height));
      for (const parada of paradas) {
        if (parada.offsetTop <= queimado + 2) parada.classList.add('acesa');
      }
    };
    const pedir = () => {
      if (!quadro) quadro = window.requestAnimationFrame(medir);
    };

    secao.classList.add('fogo--vivo');
    medir();
    window.addEventListener('scroll', pedir, { passive: true });
    window.addEventListener('resize', pedir);
    // a altura muda quando as fotos chegam
    const observador = 'ResizeObserver' in window ? new ResizeObserver(pedir) : null;
    observador?.observe(linha);

    return () => {
      window.removeEventListener('scroll', pedir);
      window.removeEventListener('resize', pedir);
      observador?.disconnect();
      if (quadro) window.cancelAnimationFrame(quadro);
      secao.classList.remove('fogo--vivo');
      for (const parada of paradas) parada.classList.remove('acesa');
      linha.style.removeProperty('--y');
      linha.style.removeProperty('--p');
    };
  }, []);

  const mostrarBarra = temVenda && rodapeLivre && naTela && !cookiesAbertos;

  return (
    <Perto.Provider value={perto}>
      <section ref={raiz} className="fogo" aria-labelledby="fogo-manchete" data-blocos-do-evento>
        <header className="fogo-abertura">
          <Imagem
            className="fogo-logo"
            src={LOGO_DO_FOGO.src}
            width={LOGO_DO_FOGO.largura}
            height={LOGO_DO_FOGO.altura}
            alt="Fogo & Fumaça Festival"
          />
          <p className="fogo-selo">{ABERTURA.selo}</p>
          <h3 className="fogo-manchete" id="fogo-manchete">
            <span>{ABERTURA.titulo[0]}</span> <span>{ABERTURA.titulo[1]}</span>
          </h3>
          <p>{ABERTURA.texto}</p>
        </header>

        <div className="fogo-trilha" ref={trilha}>
          <span className="fogo-trilho" aria-hidden="true" />
          <span className="fogo-queima" aria-hidden="true" />
          <span className="fogo-brasa" aria-hidden="true" />
          <ol>
            {/* 12h: a chegada e as regras da casa */}
            <Parada
              id="chegada"
              hora={CHEGADA.hora}
              chamada={CHEGADA.chamada}
              titulo={CHEGADA.titulo}
              classe="fogo-chegada"
            >
              <div className="fogo-duas">
                <div>
                  <p className="fogo-texto">{CHEGADA.texto}</p>
                  {/* a régua do dia: uma brasa por hora de festival */}
                  <div
                    className="fogo-regua"
                    role="img"
                    aria-label={`Das ${CHEGADA.regua.de} às ${CHEGADA.regua.ate}: ${CHEGADA.regua.legenda}`}
                  >
                    <span>{CHEGADA.regua.de}</span>
                    <span className="fogo-horas">
                      {Array.from({ length: CHEGADA.regua.horas }, (_, i) => (
                        <i key={i} style={{ '--i': i } as CSSProperties} />
                      ))}
                    </span>
                    <span>{CHEGADA.regua.ate}</span>
                    <small>{CHEGADA.regua.legenda}</small>
                  </div>
                </div>
                <ul className="fogo-regras">
                  {CHEGADA.regras.map((regra, i) => (
                    <li key={regra}>
                      {i === 0 && <i aria-hidden="true">18+</i>}
                      {regra}
                    </li>
                  ))}
                </ul>
              </div>
            </Parada>

            <li className="fogo-durante">{DURANTE}</li>

            <Parada id="palco" chamada={PALCO.chamada} titulo={PALCO.titulo} classe="fogo-palco">
              <p className="fogo-texto">{PALCO.texto}</p>
              <ul className="fogo-shows">
                {PALCO.shows.map((show) => (
                  <li key={show.nome}>
                    <figure>
                      <Imagem
                        src={show.foto}
                        width={PALCO.fotoLargura}
                        height={PALCO.fotoAltura}
                        alt={show.alt}
                      />
                      <figcaption>
                        {show.horario && <span className="fogo-horario">{show.horario}</span>}
                        <h5>{show.nome}</h5>
                        {show.detalhe && <p>{show.detalhe}</p>}
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            </Parada>

            <Parada id="open-food" chamada={OPEN_FOOD.chamada} titulo={OPEN_FOOD.titulo} classe="fogo-comida">
              <p className="fogo-texto">{OPEN_FOOD.texto}</p>
              <div className="fogo-mesa">
                {/* o quadro: três fotos, uma em cima da outra */}
                <div className="fogo-quadro">
                  {OPEN_FOOD.fotos.map((foto) => (
                    <div className="fogo-foto" key={foto.grande}>
                      <FotoGrande foto={foto} sizes="(min-width: 900px) 300px, 100vw" />
                    </div>
                  ))}
                </div>
                <div>
                  <h5 className="fogo-rotulo">{OPEN_FOOD.tituloDaLista}</h5>
                  <ul className="fogo-pratos">
                    {OPEN_FOOD.pratos.map((prato) => (
                      <LinhaDoPrato key={prato.nome} prato={prato} />
                    ))}
                  </ul>
                  <p className="fogo-so-vip">
                    <span>Só no VIP</span>
                    <span className="fogo-prato">{OPEN_FOOD.soNoVip.nome}</span>
                    {OPEN_FOOD.soNoVip.assador && (
                      <span className="fogo-assador">por {OPEN_FOOD.soNoVip.assador}</span>
                    )}
                  </p>
                </div>
              </div>
            </Parada>

            <Parada id="open-bar" chamada={OPEN_BAR.chamada} titulo={OPEN_BAR.titulo} classe="fogo-bebida">
              <p className="fogo-texto">{OPEN_BAR.texto}</p>
              <div className="fogo-balcao">
                {OPEN_BAR.grupos.map((grupo) => (
                  <div key={grupo.nome}>
                    <h5 className="fogo-rotulo">{grupo.nome}</h5>
                    <ul className="fogo-copos">
                      {grupo.itens.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="fogo-aviso">
                  <i aria-hidden="true">18+</i>
                  {OPEN_BAR.aviso}
                </p>
              </div>
            </Parada>

            <Parada id="setores" chamada={SETORES.chamada} titulo={SETORES.titulo} classe="fogo-onde">
              <p className="fogo-texto">{SETORES.texto}</p>
              <div className="fogo-setores">
                {SETORES.setores.map((setor) => (
                  <div
                    key={setor.nome}
                    className={setor.destaque ? 'fogo-setor fogo-setor--vip' : 'fogo-setor'}
                  >
                    <h5>{setor.nome}</h5>
                    <ul>
                      {setor.itens.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {temVenda && (
                <button type="button" className="fogo-botao" onClick={irParaOsIngressos}>
                  {SETORES.botao}
                  <Seta />
                </button>
              )}
            </Parada>

            {/* 21h: o fim do dia, o resumo e onde é */}
            <Parada
              id="fecho"
              hora={FECHO.hora}
              chamada={FECHO.chamada}
              titulo={FECHO.titulo}
              classe="fogo-fecho"
            >
              <div className="fogo-duas">
                <div>
                  <p className="fogo-texto">
                    {FECHO.texto}
                    {temVenda && ` ${FECHO.textoComVenda}`}
                  </p>
                  {temVenda && (
                    <button type="button" className="fogo-botao" onClick={irParaOsIngressos}>
                      {FECHO.botao}
                      <Seta />
                    </button>
                  )}
                  <ul className="fogo-resumo">
                    {FECHO.resumo.map((linha) => (
                      <li key={linha}>{linha}</li>
                    ))}
                  </ul>
                </div>
                {/* o lugar, por último (pedido do Gabriel, 19/11) */}
                <div className="fogo-lugar">
                  <FotoGrande foto={LUGAR.foto} sizes="(min-width: 900px) 440px, 100vw" />
                  <div className="fogo-lugar-texto">
                    <h5>{LUGAR.nome}</h5>
                    <p>{LUGAR.texto}</p>
                    <p className="fogo-endereco">{LUGAR.endereco}</p>
                    <a
                      className="fogo-botao-fio"
                      href={LUGAR.mapaUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {LUGAR.botao}
                      <Seta />
                    </a>
                  </div>
                </div>
              </div>
            </Parada>
          </ol>
        </div>

        <aside className="fogo-patrocinio" aria-labelledby="fogo-patrocinio">
          <h4 id="fogo-patrocinio">{PATROCINIO.titulo}</h4>
          <p>{PATROCINIO.texto}</p>
          {PATROCINADORES.map((fileira, i) => (
            <ul className="fogo-marcas" key={i}>
              {fileira.map((marca) => (
                <li key={marca.nome} style={caixaDaLogo(marca)}>
                  <Imagem src={marca.logo} width={marca.largura} height={marca.altura} alt={marca.nome} />
                </li>
              ))}
            </ul>
          ))}
        </aside>

        {/* Só no celular (o estilo esconde em tela grande): o caminho de volta aos
            ingressos enquanto a pessoa lê esta parte. Fica abaixo do aviso de cookies
            e da barra do carrinho, e some quando um dos dois aparece. */}
        {temVenda && (
          <div className="fogo-barra" data-visivel={mostrarBarra || undefined} aria-hidden={!mostrarBarra}>
            <span>{BARRA.texto}</span>
            <button
              type="button"
              className="fogo-botao"
              onClick={irParaOsIngressos}
              tabIndex={mostrarBarra ? 0 : -1}
            >
              {BARRA.botao}
              <Seta />
            </button>
          </div>
        )}
      </section>
    </Perto.Provider>
  );
}
