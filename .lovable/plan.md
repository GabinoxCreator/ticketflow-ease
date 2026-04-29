## Objetivo

Remover o badge "1 opção / N opções" que aparece no canto direito do header de cada setor (INGRESSOS, ÁREA VIP) na página do evento.

## Mudança

**Arquivo:** `src/pages/EventDetails.tsx` (linha ~372)

- Remover o elemento `<span>` que renderiza `{optionCount} opção/opções`.
- Manter o header com o gradiente roxo e o título do setor (ex.: "INGRESSOS") alinhado à esquerda, ocupando toda a largura.
- Se a variável `optionCount` ficar sem uso após a remoção, também removê-la para manter o código limpo.

## Resultado visual

O header do setor permanece com o mesmo estilo (fundo gradiente roxo, título maiúsculo em primary), apenas sem o pill "1 opção" do lado direito.