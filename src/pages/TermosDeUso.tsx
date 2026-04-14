import { Helmet } from 'react-helmet-async';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function TermosDeUso() {
  return (
    <>
      <Helmet>
        <title>Termos de Uso | FestPag</title>
        <meta name="description" content="Termos de Uso da plataforma FestPag. Conheça as regras de uso, responsabilidades e direitos ao utilizar nossos serviços." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-3xl">
            <h1 className="font-display font-bold text-3xl md:text-4xl text-foreground mb-2">
              Termos de Uso
            </h1>
            <p className="text-muted-foreground text-sm mb-10">Última atualização: 14 de abril de 2026</p>

            <div className="prose prose-sm md:prose-base max-w-none space-y-8 text-foreground/90">
              <p>Bem-vindo à FestPag.</p>
              <p>
                Estes Termos de Uso regulam o acesso e a utilização da plataforma FestPag, incluindo o site, áreas de login, painel do produtor, área do colaborador e demais funcionalidades oferecidas.
              </p>
              <p>Ao utilizar a FestPag, você declara que leu, entendeu e concorda com estes Termos.</p>
              <p>
                Em caso de dúvidas, entre em contato pelo e-mail:{' '}
                <a href="mailto:contato.festpag@gmail.com" className="text-primary hover:underline">contato.festpag@gmail.com</a>.
              </p>

              {/* 1 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">1. Sobre a FestPag</h2>
                <p>A FestPag LTDA é a responsável pela operação da plataforma FestPag.</p>
                <p>A FestPag atua como plataforma de tecnologia para intermediação de venda de ingressos, gestão de eventos, controle de acesso, operação de listas e suporte operacional aos produtores parceiros.</p>
                <p>A FestPag não é a organizadora direta dos eventos, salvo quando isso estiver expressamente indicado. A responsabilidade pela criação, produção, organização, realização, alteração, cancelamento e execução do evento é do respectivo produtor/organizador.</p>
              </section>

              {/* 2 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">2. Quem pode usar a plataforma</h2>
                <p>A plataforma pode ser utilizada por diferentes perfis de usuário, conforme o contexto de uso:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Clientes/compradores, para buscar eventos, comprar ingressos e acessar seus tickets;</li>
                  <li>Produtores, para cadastrar, administrar e operar eventos;</li>
                  <li>Colaboradores, quando vinculados à operação de um evento;</li>
                  <li>Administradores da plataforma, para gestão interna da FestPag.</li>
                </ul>
                <p>Cada perfil terá acesso apenas às funcionalidades compatíveis com sua finalidade de uso.</p>
              </section>

              {/* 3 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">3. Cadastro e responsabilidade pelas informações</h2>
                <p>O cadastro na plataforma é gratuito, salvo se houver contratação específica de serviços para produtores.</p>
                <p>O usuário se compromete a fornecer informações:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>verdadeiras;</li>
                  <li>completas;</li>
                  <li>atualizadas;</li>
                  <li>compatíveis com sua identidade e finalidade de uso.</li>
                </ul>
                <p>O usuário é responsável por manter a confidencialidade de sua senha e credenciais de acesso.</p>
                <p>A FestPag poderá adotar medidas para verificar informações cadastrais, especialmente em casos envolvendo produtores, repasses financeiros, suspeita de fraude ou uso indevido da plataforma.</p>
              </section>

              {/* 4 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">4. Uso da plataforma</h2>
                <p>Ao utilizar a FestPag, o usuário concorda em:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>usar a plataforma de forma lícita e de boa-fé;</li>
                  <li>não praticar fraude, abuso, tentativa de invasão, uso automatizado indevido ou qualquer conduta que prejudique a plataforma, outros usuários ou terceiros;</li>
                  <li>não utilizar dados, tickets, listas ou credenciais de terceiros sem autorização;</li>
                  <li>respeitar as regras específicas de cada evento, produtor e operação de acesso.</li>
                </ul>
                <p>A FestPag poderá restringir, suspender ou encerrar contas que violem estes Termos ou representem risco operacional, financeiro, legal ou reputacional.</p>
              </section>

              {/* 5 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">5. Compras de ingressos</h2>
                <p>Os ingressos disponibilizados na plataforma são ofertados pelos respectivos produtores/organizadores.</p>
                <p>Ao realizar uma compra, o cliente declara estar ciente de que:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>a disponibilidade de ingressos está sujeita a limite de estoque, lotes, setores e regras do evento;</li>
                  <li>o pagamento depende de aprovação do meio de pagamento;</li>
                  <li>o ingresso será vinculado ao pedido aprovado;</li>
                  <li>o acesso ao evento poderá depender da apresentação do ticket, QR Code, documento pessoal ou cumprimento de regras específicas do organizador.</li>
                </ul>
                <p>A FestPag não se responsabiliza por ingressos adquiridos fora dos canais oficiais da plataforma.</p>
              </section>

              {/* 6 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">6. Tickets, QR Code e acesso ao evento</h2>
                <p>Após a confirmação do pagamento, o ingresso poderá ser disponibilizado ao cliente na área Meus Ingressos e/ou pelos canais definidos pela plataforma.</p>
                <p>Cada ingresso poderá possuir:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>código único;</li>
                  <li>QR Code único;</li>
                  <li>identificação do lote, setor ou modalidade;</li>
                  <li>status de uso.</li>
                </ul>
                <p>O QR Code poderá ser validado na entrada do evento. Após o uso, o ingresso poderá ser marcado como utilizado, não sendo permitida nova validação, salvo exceções operacionais autorizadas.</p>
                <p>Em caso de perda de acesso à conta, inconsistência do ticket ou dificuldade de localização do ingresso, o usuário deverá procurar os canais oficiais de suporte.</p>
              </section>

              {/* 7 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">7. Listas, cortesias e controle de acesso</h2>
                <p>Alguns eventos poderão utilizar:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>listas de convidados;</li>
                  <li>cortesias;</li>
                  <li>listas promocionais;</li>
                  <li>liberações específicas de entrada.</li>
                </ul>
                <p>Nesses casos, o acesso poderá depender de validação do nome, contato, documento ou outros critérios definidos pelo organizador.</p>
                <p>A FestPag poderá disponibilizar ferramentas de check-in manual, QR Code e listas para fins operacionais, mas a responsabilidade pelas regras de entrada e elegibilidade permanece vinculada ao organizador do evento.</p>
              </section>

              {/* 8 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">8. Cancelamento, reembolso e alterações de evento</h2>
                <p>Regras de cancelamento, estorno, reembolso, alteração de data, local, horário, atração ou formato do evento podem depender:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>da política do organizador;</li>
                  <li>das condições do evento;</li>
                  <li>do meio de pagamento utilizado;</li>
                  <li>das normas aplicáveis ao consumidor.</li>
                </ul>
                <p>Sempre que houver solicitação de cancelamento ou reembolso, a análise poderá considerar:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>data da compra;</li>
                  <li>proximidade da realização do evento;</li>
                  <li>status do ingresso;</li>
                  <li>registro de uso do QR Code;</li>
                  <li>regras específicas informadas na página do evento.</li>
                </ul>
                <p>Taxas operacionais, taxas de serviço, custos financeiros, encargos de parcelamento e outros valores acessórios poderão ter tratamento próprio, conforme as condições informadas no momento da compra.</p>
              </section>

              {/* 9 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">9. Responsabilidades do cliente</h2>
                <p>O cliente é responsável por:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>conferir cuidadosamente os dados do evento antes de concluir a compra;</li>
                  <li>manter atualizados seus dados cadastrais;</li>
                  <li>guardar com segurança seu acesso à conta e aos ingressos;</li>
                  <li>não compartilhar ou comercializar ingressos de forma irregular;</li>
                  <li>observar as exigências do evento para entrada.</li>
                </ul>
                <p>A FestPag não se responsabiliza por problemas decorrentes de:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>erro no preenchimento de dados pelo usuário;</li>
                  <li>compra fora do canal oficial;</li>
                  <li>compartilhamento indevido da conta;</li>
                  <li>uso indevido do ingresso por terceiros;</li>
                  <li>descumprimento das regras do evento.</li>
                </ul>
              </section>

              {/* 10 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">10. Responsabilidades do produtor</h2>
                <p>O produtor é responsável por:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>cadastrar informações corretas sobre o evento;</li>
                  <li>divulgar regras claras de acesso, classificação, lotes e políticas aplicáveis;</li>
                  <li>garantir que o evento ocorra conforme anunciado, salvo situações excepcionais;</li>
                  <li>cumprir obrigações legais, fiscais, regulatórias e operacionais relacionadas ao evento;</li>
                  <li>responder por alterações, cancelamentos, adiamentos, reembolsos e execução do evento, quando aplicável;</li>
                  <li>manter dados cadastrais e bancários corretos para recebimento de repasses.</li>
                </ul>
                <p>A FestPag poderá solicitar documentos, validações e comprovações cadastrais antes ou durante a operação do produtor na plataforma.</p>
              </section>

              {/* 11 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">11. Repasses financeiros ao produtor</h2>
                <p>Quando aplicável, a FestPag poderá realizar repasses de valores ao produtor conforme regras operacionais, financeiras e cadastrais da plataforma.</p>
                <p>O repasse poderá depender de fatores como:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>validação cadastral do produtor;</li>
                  <li>dados bancários corretos;</li>
                  <li>ausência de bloqueios, fraudes ou inconsistências;</li>
                  <li>status dos pedidos;</li>
                  <li>política financeira da plataforma;</li>
                  <li>retenções temporárias por segurança operacional, disputa, contestação, reembolso ou análise interna.</li>
                </ul>
                <p>A FestPag poderá suspender, adiar ou bloquear repasses em caso de suspeita de fraude, documentação pendente, divergência bancária, contestação financeira ou violação destes Termos.</p>
              </section>

              {/* 12 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">12. Colaboradores e operação de evento</h2>
                <p>A FestPag poderá disponibilizar áreas operacionais para colaboradores vinculados ao evento, incluindo funções como:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>check-in de ingressos;</li>
                  <li>leitura de QR Code;</li>
                  <li>validação de listas;</li>
                  <li>controle de acesso.</li>
                </ul>
                <p>O colaborador deverá utilizar a plataforma apenas para fins autorizados pelo produtor e pela FestPag.</p>
                <p>É proibido ao colaborador:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>alterar informações sem autorização;</li>
                  <li>validar entradas indevidas;</li>
                  <li>acessar áreas não permitidas;</li>
                  <li>compartilhar acessos ou informações internas;</li>
                  <li>utilizar a ferramenta fora do contexto do evento.</li>
                </ul>
              </section>

              {/* 13 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">13. Suspensão, bloqueio ou encerramento de conta</h2>
                <p>A FestPag poderá suspender, restringir ou encerrar contas, temporária ou definitivamente, em situações como:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>violação destes Termos;</li>
                  <li>fraude ou tentativa de fraude;</li>
                  <li>uso de dados falsos;</li>
                  <li>uso indevido da plataforma;</li>
                  <li>risco à segurança da operação;</li>
                  <li>práticas ilícitas;</li>
                  <li>prejuízo a clientes, produtores, parceiros ou à plataforma;</li>
                  <li>comercialização irregular de ingressos;</li>
                  <li>descumprimento de obrigações financeiras ou cadastrais.</li>
                </ul>
                <p>A adoção dessas medidas poderá ocorrer com ou sem aviso prévio, conforme a gravidade do caso.</p>
              </section>

              {/* 14 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">14. Privacidade e dados pessoais</h2>
                <p>
                  O tratamento de dados pessoais realizado na plataforma ocorre conforme a{' '}
                  <a href="/privacidade" className="text-primary hover:underline">Política de Privacidade</a> da FestPag, que integra estes Termos para todos os fins.
                </p>
                <p>Ao utilizar a plataforma, o usuário declara ciência de que seus dados poderão ser tratados para:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>cadastro;</li>
                  <li>autenticação;</li>
                  <li>compra e emissão de ingressos;</li>
                  <li>operação de check-in;</li>
                  <li>atendimento e suporte;</li>
                  <li>segurança;</li>
                  <li>prevenção à fraude;</li>
                  <li>repasses e rotinas operacionais da plataforma.</li>
                </ul>
              </section>

              {/* 15 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">15. Propriedade intelectual</h2>
                <p>Todos os direitos relacionados à plataforma FestPag, incluindo software, marca, identidade visual, layout, textos, fluxos, funcionalidades e conteúdos próprios da plataforma, pertencem à FestPag ou aos seus licenciadores.</p>
                <p>É proibido copiar, reproduzir, modificar, distribuir, explorar comercialmente ou utilizar qualquer parte da plataforma sem autorização prévia e expressa.</p>
              </section>

              {/* 16 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">16. Limitação de responsabilidade</h2>
                <p>A FestPag não garante que a plataforma estará livre de indisponibilidades, falhas temporárias ou interrupções, embora adote esforços razoáveis para manter sua operação.</p>
                <p>Na condição de plataforma intermediadora, a FestPag não se responsabiliza diretamente:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>pela realização do evento;</li>
                  <li>por mudanças promovidas pelo organizador;</li>
                  <li>pela conduta de produtores, colaboradores, clientes ou terceiros;</li>
                  <li>por compras feitas fora dos canais oficiais;</li>
                  <li>por prejuízos decorrentes de culpa exclusiva de terceiros ou do próprio usuário.</li>
                </ul>
                <p>Nada nestes Termos afasta direitos que não possam ser legalmente excluídos.</p>
              </section>

              {/* 17 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">17. Alterações nos Termos</h2>
                <p>A FestPag poderá atualizar estes Termos a qualquer momento para refletir:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>mudanças na plataforma;</li>
                  <li>novos serviços;</li>
                  <li>ajustes operacionais;</li>
                  <li>exigências legais ou regulatórias.</li>
                </ul>
                <p>A versão mais atual estará sempre disponível nos canais oficiais da plataforma.</p>
                <p>O uso continuado da plataforma após a atualização será interpretado como ciência da nova versão.</p>
              </section>

              {/* 18 */}
              <section>
                <h2 className="font-display font-semibold text-xl md:text-2xl text-foreground mt-10 mb-3">18. Contato</h2>
                <p>Em caso de dúvidas sobre estes Termos de Uso, entre em contato com a FestPag:</p>
                <p className="mt-4">
                  <strong>FestPag LTDA</strong><br />
                  E-mail:{' '}
                  <a href="mailto:contato.festpag@gmail.com" className="text-primary hover:underline">contato.festpag@gmail.com</a>
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
