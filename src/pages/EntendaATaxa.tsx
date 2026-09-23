/*
 * Página pública "Entenda a taxa FestPag" (/taxa).
 *
 * Pedido do Gabriel em 18/08/2026, retomado em 23/09: o comprador vê "Taxa de
 * serviço" no checkout e não tem onde ler o que é aquilo; o produtor não tem onde
 * ler quanto custa vender com a gente. Referência: o artigo equivalente da Sympla.
 *
 * ⚠️ DECISÃO DELE (23/09/2026): a página NÃO publica o percentual. O sistema
 * permite taxa diferente por produtor e por evento (`producer_profiles.
 * platform_fee_percent` e os overrides), então cravar "10%" aqui faria a página
 * mentir para quem tem condição negociada. Quem escrever aqui no futuro: só
 * ponha número se ele valer para todo mundo, sempre.
 *
 * Tudo nesta página foi conferido contra o que o sistema faz hoje. Se mudar o
 * comportamento, mude o texto no mesmo commit.
 */
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function EntendaATaxa() {
  return (
    <>
      <Helmet>
        <title>Entenda a taxa | FestPag</title>
        <meta
          name="description"
          content="O que é a taxa de serviço da FestPag, quem paga, o que ela cobre e como ela aparece na sua compra."
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-3xl">
            <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-3">
              Entenda a taxa da FestPag
            </h1>
            <p className="text-muted-foreground text-base mb-10">
              Em uma frase: a taxa de serviço é paga por quem compra o ingresso, aparece somada
              antes de você finalizar, e o produtor do evento recebe o valor cheio do ingresso.
            </p>

            <div className="prose prose-sm md:prose-base max-w-none space-y-8 text-foreground/90">
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  O que é a taxa de serviço
                </h2>
                <p>
                  É o que a FestPag cobra para colocar e manter o evento à venda. Ela paga a
                  publicação do evento, a operação da venda pela internet, o processamento do
                  pagamento, a emissão e o envio do seu ingresso, o suporte antes e depois da
                  compra, e o controle de acesso na entrada do evento.
                </p>
              </section>

              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  Quem paga
                </h2>
                <p>
                  <strong>Quem compra o ingresso.</strong> A taxa não é descontada do produtor: ela
                  é somada ao preço do ingresso no momento da compra. O produtor recebe o valor de
                  face do ingresso que ele cadastrou.
                </p>
                <div className="rounded-xl border border-border/60 bg-card/40 p-5 not-prose">
                  <p className="text-sm text-muted-foreground mb-3">Como aparece na sua compra:</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span>Ingresso</span>
                      <span className="tabular-nums">o preço que o produtor definiu</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Taxa de serviço</span>
                      <span className="tabular-nums">somada por cima</span>
                    </div>
                    <div className="flex justify-between border-t border-border/60 pt-1.5 font-semibold">
                      <span>Total</span>
                      <span className="tabular-nums">o que você paga</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Os dois valores aparecem separados na tela antes de você confirmar. Você nunca
                    paga uma taxa que não viu.
                  </p>
                </div>
              </section>

              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  Quanto é
                </h2>
                <p>
                  O percentual é definido por evento, conforme as condições combinadas com o
                  produtor. Por isso ele não é o mesmo para todos: dois eventos diferentes podem ter
                  taxas diferentes.
                </p>
                <p>
                  <strong>O valor exato da sua compra está sempre na tela do checkout</strong>, na
                  linha "Taxa de serviço", antes de você escolher como pagar. Se você é produtor e
                  quer saber a sua condição, ela está na sua proposta ou no seu contrato — e a nossa
                  equipe responde pelo{' '}
                  <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">
                    suporte@festpag.digital
                  </a>
                  .
                </p>
              </section>

              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  Parcelamento no cartão
                </h2>
                <p>
                  Parcelar é opcional. Quando há juros, eles são cobrados de quem parcela e aparecem
                  na tela antes da confirmação — o valor à vista e o parcelado ficam lado a lado. O
                  produtor não paga por isso, e o valor que ele recebe não muda.
                </p>
              </section>

              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  Quando não há taxa
                </h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <strong>Cortesias e listas de convidados</strong> não pagam taxa de serviço.
                  </li>
                  <li>
                    <strong>Venda feita pelo próprio produtor</strong> (na portaria, no equipamento
                    ou lançada por ele no painel) segue as condições do evento e pode não ter taxa
                    de serviço.
                  </li>
                </ul>
              </section>

              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  Reembolso: a taxa volta?
                </h2>
                <p>
                  Sim nos casos previstos. Se você desistir dentro do prazo de arrependimento, ou se
                  o evento for cancelado ou alterado de forma substancial pelo produtor, o reembolso
                  é integral, incluindo a taxa de serviço. Os prazos e as exceções estão na{' '}
                  <Link to="/reembolso" className="text-primary hover:underline">
                    Política de Reembolso
                  </Link>
                  .
                </p>
              </section>

              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  Ainda com dúvida?
                </h2>
                <p>
                  Escreva para{' '}
                  <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">
                    suporte@festpag.digital
                  </a>{' '}
                  ou veja a{' '}
                  <Link to="/ajuda" className="text-primary hover:underline">
                    Central de Ajuda
                  </Link>
                  . Se você produz eventos e quer vender com a gente, fale com o nosso time pela{' '}
                  <Link to="/lp" className="text-primary hover:underline">
                    página da plataforma
                  </Link>
                  .
                </p>
              </section>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    </>
  );
}
