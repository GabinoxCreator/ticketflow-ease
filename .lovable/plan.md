# Criar Página de Política de Reembolso

Criar a página `/reembolso`, no mesmo padrão visual de `Termos de Uso` e `Política de Privacidade`, consolidando as regras já existentes nos Termos (seção 8) e ampliando com a regra dos **48h antes do evento**.

## Arquivos

1. **Novo:** `src/pages/PoliticaReembolso.tsx` — página completa com Helmet (SEO), Header, Footer e conteúdo seccionado.
2. **Editar:** `src/App.tsx` — registrar rota `/reembolso` apontando para o novo componente.

## Estrutura do conteúdo

Mesmo layout dos Termos: container `max-w-3xl`, título, data de atualização, seções numeradas.

1. **Apresentação** — Quem é a FestPag e papel da plataforma (intermediadora; produtor é responsável pelo evento).
2. **Direito de arrependimento (CDC, art. 49)** — Compras online: até **7 dias corridos** após a compra, **desde que faltem mais de 7 dias para o evento**. Reembolso integral.
3. **Solicitação até 48h antes do evento** — Regra padrão: pedidos de reembolso aceitos até **48 horas antes do início** do evento. Após esse prazo, não há reembolso, salvo cancelamento/adiamento pelo produtor.
4. **Cancelamento ou alteração pelo produtor** — Cancelamento, adiamento ou mudança substancial (data, local, atração principal): direito a reembolso integral, independentemente do prazo.
5. **Como solicitar** — Canal: e-mail `contato.festpag@gmail.com` informando pedido, CPF e motivo. Prazo de análise: até 7 dias úteis.
6. **Forma e prazo de devolução** — Cartão de crédito: estorno na fatura (até 2 ciclos, conforme operadora). PIX: devolução na chave/conta de origem em até 7 dias úteis após aprovação.
7. **Taxas e valores não reembolsáveis** — Taxas de serviço/operacionais e encargos de parcelamento podem ter tratamento próprio, conforme informado na compra. Ingressos com QR Code já validado (check-in feito) não são reembolsáveis.
8. **Ingressos de cortesia e listas** — Não reembolsáveis (não houve pagamento).
9. **Casos de fraude ou uso indevido** — Suspeita de revenda irregular, fraude ou compra fora do canal oficial pode bloquear reembolso e cancelar o ingresso.
10. **Dúvidas** — Contato: `contato.festpag@gmail.com`.

## Notas técnicas

- Reaproveitar exatamente as classes de tipografia/espaçamento de `TermosDeUso.tsx`.
- Helmet: title `Política de Reembolso | FestPag`, meta description curta.
- O link no Footer já aponta para `/reembolso` — não precisa alterar.
