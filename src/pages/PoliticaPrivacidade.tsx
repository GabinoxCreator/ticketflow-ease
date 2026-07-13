import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function PoliticaPrivacidade() {
  return (
    <>
      <Helmet>
        <title>Política de Privacidade | FestPag</title>
        <meta name="description" content="Política de Privacidade da FestPag. Saiba como coletamos, usamos e protegemos seus dados pessoais." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-3xl">
            <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-2">
              Política de Privacidade
            </h1>
            <p className="text-muted-foreground text-sm mb-10">Última atualização: 5 de julho de 2026</p>

            <div className="prose prose-sm md:prose-base max-w-none space-y-8 text-foreground/90">
              <p>
                A sua privacidade é importante para nós. Esta Política de Privacidade explica como a ST Intermediação de Negócios LTDA, por meio da plataforma FestPag, coleta, usa, armazena, compartilha e protege os dados pessoais tratados.
              </p>
              <p>
                Ao utilizar a FestPag, você declara que leu esta Política e está ciente de como seus dados são tratados.
              </p>
              <p>
                Em caso de dúvidas, solicitações ou assuntos relacionados à privacidade e proteção de dados, entre em contato pelo e-mail:{' '}
                <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">suporte@festpag.digital</a>.
              </p>

              {/* 1 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">1. Quem somos</h2>
                <p>A plataforma FestPag é operada pela <strong>ST Intermediação de Negócios LTDA</strong>, inscrita no CNPJ nº 43.941.698/0001-52, que atua como controladora de dados pessoais nas situações em que define como e por que os dados serão tratados. "FestPag" é a marca sob a qual o serviço é oferecido.</p>
                <p>A FestPag é sediada no Brasil. Alguns fornecedores de tecnologia que utilizamos processam dados em servidores localizados no exterior — nesses casos há transferência internacional de dados, tratada na seção 6 desta Política.</p>
              </section>

              {/* 2 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">2. Quais dados coletamos</h2>

                <h3 className="font-semibold text-lg text-foreground mt-6 mb-2">a) Dados de clientes e compradores de ingressos</h3>
                <p>Podemos coletar os seguintes dados dos clientes e compradores:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>nome completo;</li>
                  <li>CPF;</li>
                  <li>e-mail;</li>
                  <li>telefone.</li>
                </ul>
                <p>Esses dados são utilizados para cadastro, compra de ingressos, identificação do titular da compra, comunicação sobre pedidos, suporte e segurança da operação.</p>

                <h3 className="font-semibold text-lg text-foreground mt-6 mb-2">b) Dados de produtores de eventos</h3>
                <p>Podemos coletar os seguintes dados de produtores:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>nome;</li>
                  <li>CNPJ;</li>
                  <li>e-mail;</li>
                  <li>telefone;</li>
                  <li>dados bancários para repasse de valores.</li>
                </ul>
                <p>Esses dados são utilizados para cadastro do produtor, relacionamento comercial, validação operacional, repasse financeiro e gestão dos eventos disponibilizados na plataforma.</p>

                <h3 className="font-semibold text-lg text-foreground mt-6 mb-2">c) Dados de colaboradores</h3>
                <p>Atualmente, para colaboradores vinculados à operação de eventos, podemos armazenar:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>nome.</li>
                </ul>
                <p>Esses dados são utilizados para identificação operacional em atividades como check-in e controle de acesso.</p>

                <h3 className="font-semibold text-lg text-foreground mt-6 mb-2">d) Dados de navegação e uso da plataforma</h3>
                <p>Também podemos coletar automaticamente informações de navegação e uso, como:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>endereço IP;</li>
                  <li>tipo de dispositivo;</li>
                  <li>navegador;</li>
                  <li>páginas acessadas;</li>
                  <li>tempo de navegação;</li>
                  <li>registros de acesso;</li>
                  <li>cookies e tecnologias semelhantes.</li>
                </ul>
                <p>Esses dados ajudam a melhorar a experiência do usuário, manter a segurança da plataforma, analisar desempenho e apoiar ações de prevenção a fraudes e uso indevido.</p>
              </section>

              {/* 3 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">3. Como usamos seus dados</h2>
                <p>Utilizamos os dados pessoais tratados pela FestPag para:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>viabilizar o cadastro e o acesso à plataforma;</li>
                  <li>processar a compra, emissão e entrega de ingressos;</li>
                  <li>permitir o check-in e a validação de ingressos por QR Code;</li>
                  <li>operacionalizar listas de convidados e controle de acesso;</li>
                  <li>processar pagamentos e repasses a produtores;</li>
                  <li>enviar comunicações importantes sobre conta, compra, evento e suporte;</li>
                  <li>melhorar produtos, funcionalidades e experiência de navegação;</li>
                  <li>gerar métricas e análises de desempenho da plataforma;</li>
                  <li>cumprir obrigações legais, regulatórias e contratuais;</li>
                  <li>prevenir fraudes, abusos, acessos indevidos e incidentes de segurança.</li>
                </ul>
              </section>

              {/* 4 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">4. Pagamentos</h2>
                <p>Os pagamentos realizados na plataforma são processados por parceiro especializado, atualmente o Mercado Pago, de acordo com as integrações adotadas pela FestPag. Nessas operações, dados financeiros e transacionais podem ser tratados por esse parceiro para viabilizar o pagamento com segurança.</p>
                <p>A FestPag não utiliza esta política para substituir as políticas do parceiro de pagamento. O tratamento realizado pelo processador de pagamento também está sujeito às regras e políticas próprias dele.</p>
              </section>

              {/* 5 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">5. Compartilhamento de dados</h2>
                <p>A FestPag não vende dados pessoais.</p>
                <p>Podemos compartilhar dados pessoais nas seguintes situações:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Com produtores de eventos:</strong> quando um cliente compra um ingresso, o produtor pode receber dados necessários à operação do evento, atualmente nome, e-mail e telefone, conforme informado para esta política.</li>
                  <li><strong>Com parceiros de pagamento:</strong> atualmente o <strong>Mercado Pago</strong>, para processar cobranças, confirmações, repasses e rotinas financeiras.</li>
                  <li><strong>Com fornecedores de tecnologia e infraestrutura:</strong> incluindo o <strong>Supabase</strong> (banco de dados, autenticação e hospedagem do backend) e a <strong>Meta/Facebook</strong> (quando você autoriza cookies de marketing — ver seção 6), para hospedagem, autenticação, monitoramento, medição de campanhas e funcionamento da plataforma.</li>
                  <li><strong>Para cumprimento de obrigação legal, regulatória ou ordem de autoridade competente:</strong> quando necessário para atender à legislação aplicável ou proteger direitos da FestPag, dos usuários e de terceiros.</li>
                </ul>
              </section>

              {/* 6 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">6. Cookies e transferência internacional</h2>
                <p>Usamos duas categorias de cookies e tecnologias semelhantes:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Cookies essenciais:</strong> necessários para o site funcionar — autenticar acessos, manter sua sessão e o carrinho de compra. Não dependem de consentimento, pois sem eles a plataforma não opera.</li>
                  <li><strong>Cookies de marketing:</strong> quando um produtor ativa medição de campanhas, utilizamos o <strong>Pixel da Meta (Facebook)</strong> para medir visitas e conversões. Esses cookies <strong>só são ativados com o seu consentimento</strong>, dado no banner de cookies exibido no primeiro acesso.</li>
                </ul>
                <p>Você pode <strong>aceitar, recusar ou alterar</strong> sua escolha a qualquer momento pelo link "Preferências de cookies" no rodapé do site. Recusar os cookies de marketing não afeta a compra de ingressos.</p>
                <p>
                  <strong>Transferência internacional de dados:</strong> alguns fornecedores tratam dados fora do Brasil — o Pixel da Meta transfere dados de navegação para os Estados Unidos, e nossa infraestrutura de backend (Supabase) pode armazenar dados em servidores no exterior. Essas transferências observam a LGPD (art. 33) e ocorrem para as finalidades descritas nesta Política.
                </p>
              </section>

              {/* 7 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">7. Câmera e leitura de QR Code</h2>
                <p>A plataforma pode solicitar acesso à câmera do dispositivo exclusivamente para funcionalidades de leitura de QR Code durante processos de validação e check-in de ingressos.</p>
                <p>No cenário atual informado para esta política, a câmera é utilizada apenas para leitura operacional e não para upload de imagens.</p>
              </section>

              {/* 8 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">8. Armazenamento e segurança</h2>
                <p>Adotamos medidas técnicas e organizacionais razoáveis para proteger os dados pessoais contra acesso não autorizado, perda, destruição, alteração ou qualquer forma de tratamento inadequado.</p>
                <p>Essas medidas podem incluir controles de acesso, uso de conexões seguras, autenticação, monitoramento e limitação de permissões conforme o perfil de uso da plataforma.</p>
                <p>Nenhum sistema é totalmente imune a riscos, mas a FestPag adota esforços compatíveis com a natureza da operação para proteger os dados tratados.</p>
              </section>

              {/* 9 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">9. Por quanto tempo armazenamos os dados</h2>
                <p>Os dados pessoais são armazenados pelo tempo necessário para:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>cumprir as finalidades descritas nesta Política;</li>
                  <li>executar contratos e operações da plataforma;</li>
                  <li>atender obrigações legais, regulatórias, fiscais, contábeis e de segurança;</li>
                  <li>resguardar direitos da FestPag em processos administrativos, judiciais ou arbitrais.</li>
                </ul>
                <p>Quando aplicável, os dados poderão ser eliminados, anonimizados ou mantidos de forma segura, conforme a base legal e a necessidade de retenção.</p>
              </section>

              {/* 10 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">10. Direitos do titular de dados</h2>
                <p>Nos termos da LGPD, o titular pode solicitar, entre outros direitos:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>confirmação da existência de tratamento;</li>
                  <li>acesso aos dados;</li>
                  <li>correção de dados incompletos, inexatos ou desatualizados;</li>
                  <li>anonimização, bloqueio ou eliminação, quando cabível;</li>
                  <li>portabilidade, observadas as regras aplicáveis;</li>
                  <li>informações sobre compartilhamento;</li>
                  <li>revisão e esclarecimentos sobre o tratamento, quando aplicável.</li>
                </ul>
                <p>
                  Caso você queira exercer seus direitos, entre em contato pelo e-mail:{' '}
                  <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">suporte@festpag.digital</a>.
                </p>
                <p>Se o titular não conseguir exercer seus direitos junto ao controlador, a ANPD disponibiliza canal próprio para petições de titular.</p>
              </section>

              {/* 11 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">11. Base legal e conformidade</h2>
                <p>O tratamento de dados pessoais realizado pela FestPag observa a Lei Geral de Proteção de Dados Pessoais (LGPD). Aplicamos a base legal adequada a cada finalidade:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Execução de contrato:</strong> cadastro, compra, emissão e entrega de ingressos, check-in e suporte.</li>
                  <li><strong>Cumprimento de obrigação legal:</strong> guarda de registros fiscais e financeiros das transações.</li>
                  <li><strong>Consentimento:</strong> cookies de marketing (Pixel da Meta) e eventuais comunicações promocionais — revogável a qualquer momento.</li>
                  <li><strong>Legítimo interesse:</strong> segurança da plataforma, prevenção a fraudes e melhoria do serviço, sempre respeitando seus direitos e expectativas.</li>
                </ul>
              </section>

              {/* 12 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">12. Menores de idade</h2>
                <p>Caso a FestPag venha a tratar dados de menores de idade em situações específicas relacionadas a eventos, esse tratamento deverá observar a legislação aplicável e as medidas cabíveis para proteção adequada dos titulares.</p>
              </section>

              {/* 13 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">13. Alterações desta Política</h2>
                <p>Esta Política de Privacidade poderá ser atualizada a qualquer momento para refletir melhorias na plataforma, mudanças operacionais ou atualizações legais.</p>
                <p>A versão mais recente estará sempre disponível nos canais oficiais da FestPag, com a data de última atualização destacada no topo do documento.</p>
              </section>

              {/* 14 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">14. Canal de atendimento ao titular</h2>
                <p>Para exercer seus direitos ou tratar de qualquer assunto relacionado à privacidade e proteção de dados, utilize o nosso canal de atendimento ao titular:</p>
                <p className="font-medium">
                  ST Intermediação de Negócios LTDA — CNPJ 43.941.698/0001-52<br />
                  Plataforma FestPag<br />
                  E-mail:{' '}
                  <a href="mailto:suporte@festpag.digital" className="text-primary hover:underline">suporte@festpag.digital</a>
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
