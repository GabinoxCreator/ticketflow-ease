import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { IDENTIDADE_FESTPAG } from '@/lib/identidade-festpag';
import { dataPorExtenso } from '@/lib/documentos-legais';
import { facialObrigatoria } from '@/lib/facialObrigatoria';

/*
 * OS-343: esta página tem DOIS textos nas seções 2, 5, 6, 7, 9, 10, 11 e 12. Com a
 * chave da facial obrigatória desligada (o padrão), vale o texto de 01/10/2026, sem
 * mudança nenhuma. Ligada (`src/lib/facialObrigatoria.ts`), vale o texto do
 * CAMINHO D (decisão do Gabriel, 03/11/2026: obrigatória, assumindo o risco), e a
 * data de atualização passa a ser o dia do corte.
 * O texto ligado foi escrito em 03/11 para cumprir a seção V do parecer de 02/10
 * ("Ajustes nos termos e na política"): as duas finalidades (entrada e pagamento)
 * e a base de cada uma; onde a foto fica, o país e o prazo; o fornecedor, o que ele
 * recebe e a transferência internacional; a alternativa sem a facial; só maiores
 * de 18; os direitos do art. 18 e a revisão de decisão automatizada (art. 20).
 * ⚠️ Vale só com a aprovação do Gabriel, palavra por palavra
 * (`CONDICOES_PARA_LIGAR.politicaCaminhoDAprovada`): APROVADO em 03/11/2026 ("Aprovar
 * como está"). Mudou uma vírgula do texto ligado, a condição volta a `false`.
 * O envio da foto ao fornecedor com CPF, e-mail e telefone foi mantido pelo Gabriel em
 * 14/10 e de novo em 03/11 ("o Marcel é do time interno"), e o texto diz isso. Tudo o que ele promete tem de
 * ser verdade no dia do corte: o prazo de 12 meses e o pedido de exclusão ao
 * fornecedor são a condição `retencaoDe12MesesNoAr`; a idade conferida na base,
 * `idadeConferidaNaBase`.
 */
export default function PoliticaPrivacidade() {
  const obrigatoria = facialObrigatoria();
  /* OS-374 (04/11/2026): o texto DESLIGADO ganhou o parágrafo dos eventos com
   * entrada pela facial (seção 7) e a data passou a 04/11/2026; o
   * "sem mudança nenhuma" do comentário acima vale só até aqui.
   * O rodapé abre /privacidade#reconhecimento-facial (topo da seção 7) e
   * o "Por que pedimos a facial?" das telas da facial abre
   * /privacidade#eventos-com-facial (o parágrafo dos eventos com entrada pela
   * facial, que só existe com a chave desligada; ligada, cai no topo da seção 7).
   * Numa página montada pelo React o navegador não acha a âncora sozinho (o texto
   * ainda não existe quando ele tenta), então a rolagem é feita aqui. O `key`
   * entra para rolar de novo quando o link é clicado já estando na mesma âncora. */
  const { hash, key } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const alvo =
      document.getElementById(id) ??
      (id === 'eventos-com-facial' ? document.getElementById('reconhecimento-facial') : null);
    if (alvo) alvo.scrollIntoView({ block: 'start' });
  }, [hash, key]);
  /* Com a chave ligada, a versão É o dia do corte (documentos-legais.ts). */
  const desdeQuando = dataPorExtenso('privacidade');
  return (
    <>
      <Helmet>
        <title>Política de Privacidade | FestPag</title>
        <meta name="description" content="Política de Privacidade da FestPag. Saiba como coletamos, usamos e protegemos seus dados pessoais." />
      </Helmet>

      <div className="min-h-screen">
        <Header />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-3xl">
            <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-2">
              Política de Privacidade
            </h1>
            <p className="text-muted-foreground text-sm mb-10">Última atualização: {dataPorExtenso('privacidade')}</p>

            <div className="prose prose-sm md:prose-base max-w-none space-y-8 text-foreground/90">
              <p>
                A sua privacidade é importante para nós. Esta Política de Privacidade explica como a {IDENTIDADE_FESTPAG.razaoSocial}, por meio da plataforma FestPag, coleta, usa, armazena, compartilha e protege os dados pessoais tratados.
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
                <p>A plataforma FestPag é operada pela <strong>{IDENTIDADE_FESTPAG.razaoSocial}</strong>, inscrita no CNPJ nº {IDENTIDADE_FESTPAG.cnpj}, que atua como controladora de dados pessoais nas situações em que define como e por que os dados serão tratados. "FestPag" é a marca sob a qual o serviço é oferecido.</p>
                <p>A FestPag é sediada no Brasil. Alguns fornecedores de tecnologia que utilizamos processam dados em servidores localizados no exterior. Nesses casos há transferência internacional de dados, tratada na seção 6 desta Política.</p>
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
                  <li>telefone;</li>
                  {obrigatoria ? (
                    <>
                      <li>data de nascimento, pedida antes do cadastro facial para conferir, com o CPF, que a pessoa tem 18 anos ou mais (seções 7 e 12);</li>
                      <li><strong>foto do rosto (cadastro facial)</strong>, de quem tem conta e 18 anos ou mais, a partir de {desdeQuando}: na criação da conta ou, para contas mais antigas, na próxima compra; salvo quem não consegue fazer a foto (dado sensível, tratado conforme a seção 7).</li>
                    </>
                  ) : (
                    <li><strong>foto do rosto</strong>, somente de quem opta pelo reconhecimento facial (dado sensível, tratado conforme a seção 7).</li>
                  )}
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
                <p>Os pagamentos realizados na plataforma são processados por parceiros especializados, de acordo com as integrações adotadas pela FestPag. Atualmente utilizamos a <strong>Safe2Pay</strong>; eventos criados antes da migração podem continuar sendo processados pelo <strong>Mercado Pago</strong>. Nessas operações, dados financeiros e transacionais podem ser tratados por esses parceiros para viabilizar o pagamento com segurança.</p>
                <p>A FestPag não utiliza esta política para substituir as políticas do parceiro de pagamento. O tratamento realizado pelo processador de pagamento também está sujeito às regras e políticas próprias dele.</p>
              </section>

              {/* 5 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">5. Compartilhamento de dados</h2>
                <p>A FestPag não vende dados pessoais.</p>
                <p>Podemos compartilhar dados pessoais nas seguintes situações:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Com produtores de eventos:</strong> quando um cliente compra um ingresso, o produtor daquele evento pode receber os dados necessários à operação e ao controle de acesso: atualmente <strong>nome, CPF, e-mail e telefone</strong>, além dos dados do pedido e do ingresso. O produtor só enxerga os pedidos dos próprios eventos.</li>
                  <li><strong>Com parceiros de pagamento:</strong> atualmente a <strong>Safe2Pay</strong> e, em eventos anteriores à migração, o <strong>Mercado Pago</strong>, para processar cobranças, confirmações, estornos, repasses e rotinas financeiras.</li>
                  <li><strong>Com fornecedores de tecnologia e infraestrutura:</strong> incluindo o <strong>Supabase</strong> (banco de dados, autenticação e hospedagem do backend), a <strong>Meta/Facebook</strong> e o <strong>Google</strong> (Tag Manager), estes dois últimos apenas quando você autoriza cookies de marketing (ver seção 6), para hospedagem, autenticação, monitoramento, medição de campanhas e funcionamento da plataforma.</li>
                  <li><strong>Com fornecedores de comunicação:</strong> serviços de envio de e-mail e de mensagens por WhatsApp, usados para mandar o seu ingresso, o código de acesso à conta e avisos sobre a sua compra.</li>
                  {obrigatoria ? (
                    <>
                      <li><strong>Com o fornecedor de reconhecimento facial:</strong> se você tiver feito o cadastro facial. Ele recebe a sua foto e os dados que identificam a sua conta (CPF, e-mail e telefone), para confirmar que é você na entrada do evento. Detalhes na seção 7.</li>
                      <li><strong>Com o serviço de consulta de CPF:</strong> antes do cadastro facial, o seu CPF e a sua data de nascimento são conferidos na base de dados da Receita Federal, consultada por parceiro, só para confirmar que você tem 18 anos ou mais. Não guardamos o que a base responde, só o resultado ("maior de 18 conferido") e a data da conferência.</li>
                    </>
                  ) : (
                    <li><strong>Com o fornecedor de reconhecimento facial:</strong> somente se você tiver cadastrado o seu rosto. Ele recebe a sua foto e os dados que identificam a sua conta (CPF, e-mail e telefone), para confirmar que é você na entrada do evento e na compra pelo rosto nos totens. Detalhes na seção 7.</li>
                  )}
                  <li><strong>Para cumprimento de obrigação legal, regulatória ou ordem de autoridade competente:</strong> quando necessário para atender à legislação aplicável ou proteger direitos da FestPag, dos usuários e de terceiros.</li>
                </ul>
              </section>

              {/* 6 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">6. Cookies e transferência internacional</h2>
                <p>Usamos duas categorias de cookies e tecnologias semelhantes:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Cookies essenciais:</strong> necessários para o site funcionar: autenticar acessos, manter sua sessão e o carrinho de compra. Não dependem de consentimento, pois sem eles a plataforma não opera.</li>
                  <li><strong>Cookies de marketing:</strong> quando há medição de campanhas ativa, utilizamos o <strong>Pixel da Meta (Facebook)</strong> e o <strong>Google Tag Manager</strong> para medir visitas e conversões. Esses cookies <strong>só são ativados com o seu consentimento</strong>, dado no banner de cookies exibido no primeiro acesso.</li>
                </ul>
                <p>Você pode <strong>aceitar, recusar ou alterar</strong> sua escolha a qualquer momento pelo link "Preferências de cookies" no rodapé do site. Recusar os cookies de marketing não afeta a compra de ingressos.</p>
                {obrigatoria ? (
                  <p>
                    <strong>Transferência internacional de dados:</strong> alguns fornecedores tratam dados fora do Brasil: o Pixel da Meta e o Google Tag Manager transferem dados de navegação para os Estados Unidos; a nossa infraestrutura de banco de dados e de arquivos (Supabase, contratada por meio da Lovable) guarda os dados da plataforma, <strong>inclusive a foto do cadastro facial</strong>, em servidores na <strong>Irlanda (União Europeia)</strong>, e essas empresas têm sede nos Estados Unidos e em Singapura. O fornecedor de reconhecimento facial recebe a foto num serviço hospedado em São Paulo (Brasil). Essas transferências observam a LGPD (art. 33) e ocorrem só para as finalidades descritas nesta Política.
                  </p>
                ) : (
                  <p>
                    <strong>Transferência internacional de dados:</strong> alguns fornecedores tratam dados fora do Brasil: o Pixel da Meta e o Google Tag Manager transferem dados de navegação para os Estados Unidos, e nossa infraestrutura de backend (Supabase) pode armazenar dados em servidores no exterior. O fornecedor de reconhecimento facial, quando você cadastra o rosto, também pode tratar esses dados fora do Brasil. Essas transferências observam a LGPD (art. 33) e ocorrem para as finalidades descritas nesta Política.
                  </p>
                )}
              </section>

              {/* 7 · a âncora é o destino do link "Reconhecimento facial" do rodapé e do
                  "Por que pedimos a facial?" da retirada e do aceite de ingresso (OS-374). */}
              <section id="reconhecimento-facial" className="scroll-mt-24">
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">7. Câmera, QR Code e reconhecimento facial</h2>
                <p>A plataforma pode solicitar acesso à câmera do dispositivo para ler o QR Code do ingresso durante a validação e o check-in.</p>
                {obrigatoria ? (
                  <>
                    <p><strong>Cadastro facial.</strong> Desde {desdeQuando}, o cadastro facial faz parte da conta de comprador na FestPag, para quem tem 18 anos ou mais. Quem cria a conta faz o cadastro facial na própria criação da conta. Quem já tinha conta faz na próxima compra, antes do pagamento: o login não muda e os ingressos que você já tem continuam valendo.</p>
                    <p>A facial tem <strong>duas finalidades diferentes</strong>, com regras diferentes:</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li><strong>1. Entrada no evento (faz parte da conta).</strong> A foto serve para confirmar que quem chega na portaria é a pessoa do ingresso, e para impedir que o ingresso seja usado por outra pessoa. A base legal é a <strong>prevenção à fraude e a segurança do titular nos processos de identificação e autenticação de cadastro</strong> (art. 11, II, "g", da LGPD). Por isso o cadastro facial não depende de você marcar uma autorização: ele é condição da conta, e você é informado com destaque, na própria tela, antes da foto (art. 9º, § 3º).</li>
                      <li><strong>2. Pagamento pela facial nos totens (opcional).</strong> Pagar com a facial, com o saldo da carteira FestCashless, é outra finalidade. É <strong>sempre opcional</strong>, depende do seu <strong>consentimento específico e destacado</strong> (art. 11, I), pedido à parte e não na criação da conta, e pode ser revogado a qualquer momento sem afetar a sua conta nem os seus ingressos. A foto do cadastro facial da entrada <strong>não</strong> é usada para pagamento sem essa autorização.</li>
                    </ul>
                    <p>Não usamos a facial para publicidade, perfilamento, vigilância nem qualquer outra finalidade além dessas duas.</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li><strong>Só maiores de 18 anos.</strong> Antes da foto pedimos a data de nascimento, que é conferida com o seu CPF na base da Receita Federal. <strong>Menores de 18 anos não fazem o cadastro facial.</strong> Se a conferência não for possível naquele momento, a foto não é feita e a compra segue normalmente.</li>
                      <li><strong>Quem não faz a foto entra do mesmo jeito.</strong> Se você não conseguir fazer a foto (por exemplo, por não ter câmera nem celular, por deficiência, por uso de cobertura religiosa, ou porque o reconhecimento não funciona bem com você), a própria tela oferece seguir sem ela. Sem cadastro facial, a entrada no evento é pelo <strong>QR Code do ingresso</strong>, com a conferência de documento com foto na portaria quando a organização pedir. O mesmo vale para menores de 18 anos.</li>
                      <li><strong>Sem câmera no computador?</strong> Dá para terminar pelo celular: a tela mostra um QR Code (ou mandamos um link para o WhatsApp informado por você) que vale 15 minutos e só pode ser usado uma vez.</li>
                      <li><strong>Quando a facial não reconhece você.</strong> O reconhecimento é automático, mas nunca é a última palavra. Se a facial recusar, falhar ou reconhecer a pessoa errada, na portaria ou no totem, <strong>uma pessoa da equipe atende na hora</strong> e confere o seu ingresso pelo QR Code e um documento com foto. Você também pode pedir a <strong>revisão de qualquer decisão tomada só pelo reconhecimento automático</strong> (art. 20 da LGPD) pelo canal da seção 14.</li>
                      <li><strong>Onde a sua foto fica.</strong> A imagem é guardada em <strong>área privada</strong> da plataforma, em servidor na Irlanda (seção 6), vinculada à sua conta e acessível apenas aos sistemas que fazem a conferência. Ela não é pública, não aparece para outras pessoas e não é entregue ao produtor do evento.</li>
                      <li><strong>Com quem ela é compartilhada.</strong> A conferência na portaria é feita por fornecedor especializado de reconhecimento facial, que recebe a sua foto junto com os dados que identificam a sua conta (<strong>CPF, e-mail e telefone</strong>), num serviço hospedado em São Paulo (Brasil).</li>
                      <li><strong>Por quanto tempo.</strong> A foto é apagada depois de <strong>12 meses sem uso</strong> (sem compra e sem entrada pela facial), com aviso por e-mail 60 dias antes, ou quando você exclui a conta ou pede a exclusão do cadastro facial. Nos três casos ela é apagada na FestPag e pedimos ao fornecedor que apague a cópia dele.</li>
                      <li><strong>Exclusão.</strong> Você pode pedir a exclusão do seu cadastro facial a qualquer momento pelo canal da seção 14. Feita a exclusão, a sua entrada no evento passa a ser pelo QR Code do ingresso, e a sua conta e os seus ingressos continuam valendo. Na próxima compra, o cadastro facial é pedido de novo, e você pode seguir sem ele pela saída descrita acima.</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p><strong>Reconhecimento facial (opcional).</strong> A FestPag oferece a entrada por reconhecimento facial como <strong>alternativa</strong> ao QR Code e, nos nossos totens de autoatendimento, a compra pelo rosto. É <strong>totalmente opcional</strong>: quem não quiser usar entra com o ingresso e paga pelos meios tradicionais.</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li><strong>É dado pessoal sensível</strong> (art. 11 da LGPD) e só é tratado mediante <strong>consentimento específico e destacado</strong>, pedido na hora do cadastro do rosto.</li>
                      <li><strong>Para que serve:</strong> confirmar que quem chega na portaria é a pessoa do ingresso e, nos totens, autorizar a compra pelo rosto. Não usamos o rosto para publicidade, perfilamento, vigilância nem qualquer outra finalidade.</li>
                      <li><strong>Onde a sua foto fica.</strong> A imagem é guardada em <strong>área privada</strong> da plataforma, vinculada à sua conta e acessível apenas aos sistemas que fazem essa conferência. Ela não é pública, não aparece para outras pessoas e não é entregue ao produtor do evento.</li>
                      <li><strong>Com quem ela é compartilhada.</strong> A conferência é feita por fornecedor especializado de reconhecimento facial, que recebe a sua foto junto com os dados que identificam a sua conta (CPF, e-mail e telefone) e pode tratá-los <strong>fora do Brasil</strong> (ver transferência internacional na seção 6).</li>
                      <li><strong>Você pode revogar</strong> o consentimento a qualquer momento pelo canal da seção 14, e pedir a exclusão do seu cadastro facial. Feita a exclusão, a sua entrada no evento passa a ser pelo QR Code do ingresso.</li>
                    </ul>
                    {/* OS-374 (04/11/2026): texto aprovado pelo Gabriel na caixinha, palavra por
                        palavra, com a decisão do mesmo dia de fazer o "Seguir sem facial"
                        funcionar. Cobre o lote de retirada com facial (Canto do Mato), o link de
                        cortesia e o aceite de ingresso de evento com entrada pela facial, que já
                        estão no ar com a chave geral desligada. A âncora é o destino do
                        "Por que pedimos a facial?" da página do evento, da retirada e do aceite. */}
                    <div id="eventos-com-facial" className="scroll-mt-24">
                    <p><strong>Eventos com entrada pela facial.</strong> Alguns eventos têm a entrada feita pela facial, e a página do evento avisa isso antes da compra ou da retirada. Nesses eventos, o cadastro facial é o caminho padrão: é ele que garante que quem entra é a pessoa do ingresso e impede que o ingresso seja repassado, revendido ou usado por outra pessoa.</p>
                    <ul className="list-disc pl-6 space-y-1">
                      <li><strong>Base legal:</strong> consentimento específico e destacado, pedido na tela antes da foto (art. 11, I, da LGPD).</li>
                      <li>Prefere não fazer, ou não conseguiu? Toque em "Seguir sem facial": o ingresso sai do mesmo jeito, e a entrada é pelo QR Code com um documento oficial com foto.</li>
                      <li>Pagar com a facial nos totens continua <strong>opcional</strong> e pode ser revogado a qualquer momento, sem perder o ingresso.</li>
                    </ul>
                    </div>
                  </>
                )}
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
                {obrigatoria ? (
                  <p><strong>A foto do cadastro facial</strong> é apagada depois de 12 meses sem uso (sem compra e sem entrada pela facial), com aviso por e-mail 60 dias antes, ou quando você exclui a conta ou pede a exclusão do cadastro facial pelo canal da seção 14. Nos três casos ela é apagada na FestPag e pedimos ao fornecedor que apague a cópia dele. A data de nascimento que você informa fica na sua conta enquanto ela existir; da conferência com a base guardamos só o resultado ("maior de 18 conferido") e a data em que foi feita. Os registros das compras e das entradas no evento continuam guardados pelo prazo da lei, sem a foto.</p>
                ) : (
                  <p><strong>A foto do reconhecimento facial</strong> é mantida enquanto a sua conta existir e o cadastro facial estiver ativo. Pedindo a exclusão do cadastro facial pelo canal da seção 14, a foto é eliminada, e a sua entrada no evento passa a ser pelo QR Code do ingresso.</p>
                )}
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
                  {obrigatoria && (
                    <>
                      <li>revisão, por uma pessoa, de decisão tomada só pelo reconhecimento facial automático (art. 20), como uma entrada recusada na portaria;</li>
                      <li>revogação, a qualquer momento, da autorização de pagamento pela facial, sem perder a conta nem os ingressos.</li>
                    </>
                  )}
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
                  {obrigatoria ? (
                    <>
                      <li><strong>Consentimento:</strong> cookies de marketing (Pixel da Meta, Google Tag Manager), eventuais comunicações promocionais e o <strong>pagamento pela facial</strong> nos totens, que tem autorização própria, específica e destacada (art. 11, I). Todos revogáveis a qualquer momento.</li>
                      <li><strong>Prevenção à fraude e segurança do titular nos processos de identificação e autenticação de cadastro (art. 11, II, "g"):</strong> o <strong>cadastro facial</strong> da conta, usado só para confirmar a identidade na entrada do evento, e a conferência da idade com o CPF antes dele. Detalhes na seção 7.</li>
                    </>
                  ) : (
                    <li><strong>Consentimento:</strong> cookies de marketing (Pixel da Meta, Google Tag Manager), eventuais comunicações promocionais e o <strong>reconhecimento facial</strong>, que, por ser dado sensível, tem consentimento específico e destacado (art. 11). Todos revogáveis a qualquer momento.</li>
                  )}
                  <li><strong>Legítimo interesse:</strong> segurança da plataforma, prevenção a fraudes e melhoria do serviço, sempre respeitando seus direitos e expectativas.</li>
                </ul>
              </section>

              {/* 12 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">12. Menores de idade</h2>
                {obrigatoria && (
                  <p>Antes do cadastro facial pedimos a data de nascimento e a conferimos com o CPF na base da Receita Federal. <strong>Menores de 18 anos não fazem o cadastro facial</strong>: a entrada deles no evento é pelo QR Code do ingresso. Se a conferência não for possível, a foto não é feita.</p>
                )}
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
                  {IDENTIDADE_FESTPAG.razaoSocial} · CNPJ {IDENTIDADE_FESTPAG.cnpj}<br />
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
