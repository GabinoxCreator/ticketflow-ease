import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { razaoSocialComCnpj } from '@/lib/identidade-festpag';
import { dataPorExtenso } from '@/lib/documentos-legais';

export default function PoliticaReembolso() {
  return (
    <>
      <Helmet>
        <title>Política de Reembolso | FestPag</title>
        <meta
          name="description"
          content="Política de Reembolso da FestPag. Conheça os prazos, regras e como solicitar o reembolso de ingressos."
        />
      </Helmet>

      <div className="min-h-screen">
        <Header />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-3xl">
            <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-2">
              Política de Reembolso
            </h1>
            <p className="text-muted-foreground text-sm mb-10">Última atualização: {dataPorExtenso('reembolso')}</p>

            <div className="prose prose-sm md:prose-base max-w-none space-y-8 text-foreground/90">
              <p>
                Esta Política de Reembolso descreve as regras, prazos e condições aplicáveis aos
                pedidos de devolução de valores pagos por ingressos adquiridos através da plataforma
                FestPag.
              </p>
              <p>
                Em caso de dúvidas, entre em contato pelo e-mail:{' '}
                <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">
                  suporte@festpag.digital
                </a>
                .
              </p>

              {/* 1 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  1. Sobre a FestPag
                </h2>
                <p>
                  A FestPag atua como plataforma de tecnologia para intermediação da venda de
                  ingressos e gestão de eventos. A FestPag não é a organizadora direta dos eventos,
                  salvo quando isso estiver expressamente indicado.
                </p>
                <p>{razaoSocialComCnpj()}.</p>
                <p>
                  A responsabilidade pela realização, alteração, cancelamento e execução do evento
                  é do respectivo produtor/organizador. As regras abaixo se aplicam de forma
                  padrão a todos os eventos publicados na plataforma, podendo ser complementadas
                  por condições específicas informadas na página de cada evento.
                </p>
              </section>

              {/* 2 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  2. Direito de arrependimento (CDC, art. 49)
                </h2>
                <p>
                  Por se tratar de compra realizada fora do estabelecimento físico, o consumidor
                  pode exercer o direito de arrependimento em até <strong>7 (sete) dias corridos</strong>{' '}
                  contados a partir da confirmação da compra.
                </p>
                <p>
                  Este direito é válido <strong>desde que ainda faltem mais de 7 dias para a realização
                  do evento</strong>. Nesta hipótese, são devolvidos o <strong>valor integral dos
                  ingressos</strong> e a taxa de serviço (ver seção 7).
                </p>
              </section>

              {/* 3 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  3. Solicitação até 48h antes do evento
                </h2>
                <p>
                  Fora do prazo de arrependimento, pedidos de reembolso poderão ser realizados até{' '}
                  <strong>48 (quarenta e oito) horas antes do horário de início do evento</strong>.
                </p>
                <p>
                  Após esse prazo, <strong>não serão aceitos</strong> pedidos de reembolso, salvo nos casos
                  de cancelamento, adiamento ou alteração substancial promovida pelo produtor
                  (descritos na seção 4).
                </p>
              </section>

              {/* 4 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  4. Cancelamento ou alteração pelo produtor
                </h2>
                <p>
                  Em caso de cancelamento, adiamento ou alteração substancial do evento (mudança de
                  data, local ou atração principal), o cliente terá direito ao{' '}
                  <strong>reembolso integral</strong>, independentemente do prazo descrito na seção 3.
                </p>
                <p>
                  As comunicações sobre cancelamentos e alterações serão feitas pelo produtor e/ou
                  pela FestPag por e-mail e nos canais oficiais do evento.
                </p>
              </section>

              {/* 5 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  5. Como solicitar o reembolso
                </h2>
                <p>
                  Para solicitar o reembolso, entre na sua conta, abra{' '}
                  <a href="/meus-ingressos" className="text-primary hover:underline">Meus Ingressos</a>{' '}
                  e use o botão <strong>"Cancelar e pedir reembolso"</strong> da compra. Ali você escolhe
                  quais ingressos devolver e vê quanto volta antes de enviar.
                </p>
                <p>O pedido pelo site segue estas regras:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>mesa e dupla só são devolvidas inteiras: todos os lugares ou ingressos dela entram juntos no pedido;</li>
                  <li>ingresso já transferido para outra pessoa, ou em transferência, não entra no pedido;</li>
                  <li>ingresso com abadá já retirado não entra no pedido;</li>
                  <li>compra feita direto com o organizador ou na portaria não é reembolsada pelo site: o cancelamento é com o organizador do evento;</li>
                  <li>compra que inclui produtos da loja do evento é cancelada pelo atendimento;</li>
                  <li>enquanto o pedido está em análise, os ingressos escolhidos ficam bloqueados: não entram no evento e não podem ser transferidos.</li>
                </ul>
                <p>
                  Se preferir, envie um e-mail para{' '}
                  <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">
                    suporte@festpag.digital
                  </a>{' '}
                  contendo:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>nome completo do comprador;</li>
                  <li>CPF utilizado na compra;</li>
                  <li>nome e data do evento;</li>
                  <li>número do pedido, se tiver (aparece na tela do pedido, logo depois da compra);</li>
                  <li>motivo do pedido de reembolso.</li>
                </ul>
                <p>
                  O prazo de análise é de até <strong>7 (sete) dias úteis</strong> contados a partir do
                  recebimento da solicitação completa.
                </p>
              </section>

              {/* 6 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  6. Forma e prazo de devolução
                </h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>
                    <strong>Cartão de crédito:</strong> o estorno é solicitado à operadora e poderá
                    aparecer na fatura em até 2 (dois) ciclos, conforme regras de cada bandeira/banco.
                  </li>
                  <li>
                    <strong>PIX:</strong> a devolução será feita na chave PIX que você informar, em até 7 (sete) dias úteis após a aprovação da solicitação.
                  </li>
                </ul>
                <p>
                  A FestPag não tem ingerência sobre o prazo final de compensação bancária junto à
                  instituição financeira do cliente.
                </p>
              </section>

              {/* 7 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  7. Taxas e valores não reembolsáveis
                </h2>
                <p>
                  <strong>A taxa de serviço da plataforma é devolvida quando o reembolso é pedido até o
                  fim do 7º (sétimo) dia corrido depois da compra</strong>, tanto no arrependimento
                  (seção 2) quanto na solicitação até 48h antes do evento (seção 3).
                </p>
                <p>
                  Pedido feito depois desse dia: <strong>a taxa de serviço não é reembolsável</strong>.
                  Ela remunera o serviço de intermediação já prestado no momento da compra
                  (processamento do pagamento, emissão e envio dos ingressos e atendimento). Nesses
                  casos, é devolvido o valor dos ingressos.
                </p>
                <p>
                  Fora desse prazo, a exceção é o cancelamento, adiamento ou alteração substancial do
                  evento pelo produtor (seção 4), em que a devolução é integral.
                </p>
                <p>
                  Encargos de parcelamento seguem as regras da operadora do cartão e não são
                  devolvidos pela FestPag.
                </p>
                <p>
                  <strong>Ingressos com QR Code já validado</strong> (com check-in registrado na portaria
                  do evento) não são passíveis de reembolso.
                </p>
              </section>

              {/* 8 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  8. Ingressos de cortesia e listas
                </h2>
                <p>
                  Ingressos obtidos por cortesia, listas de convidados, promoções gratuitas ou
                  similares <strong>não são reembolsáveis</strong>, por não envolverem pagamento.
                </p>
              </section>

              {/* 9 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  9. Fraude ou uso indevido
                </h2>
                <p>
                  A FestPag poderá <strong>negar o reembolso e cancelar o ingresso</strong> nos casos em
                  que houver indícios de revenda irregular, fraude, contestação indevida (chargeback
                  abusivo) ou compra fora dos canais oficiais da plataforma.
                </p>
              </section>

              {/* 10 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">
                  10. Dúvidas e contato
                </h2>
                <p>
                  Para dúvidas sobre esta Política de Reembolso ou para acompanhar uma solicitação,
                  entre em contato pelo e-mail:{' '}
                  <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">
                    suporte@festpag.digital
                  </a>
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
