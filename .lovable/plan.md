# Popular o mapa com mesas, bistrôs e setores

Atualmente o mapa `Mapa Copa 2026` (canvas 1200×800) está vazio. Vou popular ele via migração SQL direto no banco, espelhando a referência que você mandou.

## O que vou inserir

### 80 assentos vendáveis (`venue_seats`)

- **40 Mesas** (seat_type `Mesa Padrão`, retângulo azul, cap 4–8) — códigos `M01`–`M40`, dispostas em grade 8 colunas × 5 linhas dentro do "Setor Mesas".
- **40 Bistrôs** (seat_type `Bistrô`, círculo vermelho, cap 4) — códigos `B01`–`B40`, mesma grade 8×5 dentro do "Setor Bistrôs".

Numeração igual à imagem: começa pela direita-cima (1, 2, 3...) descendo a coluna, depois pula pra próxima coluna à esquerda.

### Elementos decorativos (`map_objects`) — não vendáveis

| Elemento | Tipo | Cor | Função |
|---|---|---|---|
| Setor Bistrôs (fundo) | `rect` | azul | bloco do setor à esquerda |
| Setor Mesas (fundo) | `rect` | amarelo | bloco do setor à direita |
| Espaço Coberto | `rect` + `text` | verde | faixa lateral esquerda |
| Palco | `rect` + `text` | laranja | bloco direita |
| Telão 6×2 | `rect` + `text` | verde | bloco mais à direita |
| B1 Maresias | `rect` azul-escuro + `text` | — | header do bloco mesas (topo) |
| B2 Riviera de São Lourenço | `rect` azul-escuro + `text` | — | footer bloco mesas |
| B3 Ilhabela | `rect` azul-escuro + `text` | — | footer bloco bistrôs |
| WC | `rect` + `text` | laranja | rodapé |
| BAR | `rect` + `text` | azul | rodapé |

## Layout no canvas 1200×800

```text
+----------------------------------------------------------+
| Espaço |  SETOR BISTRÔS    |  SETOR MESAS    | PALCO|TEL |
| Coberto|  (8×5 círculos)   |  (8×5 retâng.)  |      |    |
|        |                   | [B1 Maresias]   |      |    |
|        |  [B3 Ilhabela]    | [B2 Riviera]    |      |    |
+----------------------------------------------------------+
|              WC    BAR                                    |
+----------------------------------------------------------+
```

- Setor Bistrôs: x≈110, y≈60, 8 cols × 5 rows, espaçamento 55px (círculos 50×50)
- Setor Mesas: x≈540, y≈60, mesmo grid (retângulos 50×50)
- Cada seat usa `width/height = 50` (menor que o default 60/80 pra caber 8×5 sem estourar)

## Como vou executar

1. Migração SQL única que: limpa qualquer `venue_seats` + `map_objects` órfão deste `table_map_id` (idempotente), insere os 80 seats e ~18 objetos decorativos com coordenadas calculadas.
2. Códigos `M01`–`M40` e `B01`–`B40` são únicos por `venue_id` — se já existirem códigos iguais nesse venue, a inserção falha. Posso conferir antes de rodar.

## Pendências antes de aprovar

1. **Códigos**: usar `M01–M40` / `B01–B40` ou `MESA-01` / `BISTRO-01`? (Os códigos aparecem em ingressos/checkin.)
2. **Preço base**: o seat_type Mesa Padrão e Bistrô estão com `base_price` cadastrado? Se sim, deixo os seats sem override (herdam do tipo). Se você quiser preços diferentes por mesa, me diz.
3. **Substituir / preservar**: o mapa está vazio hoje, então só vou inserir. Mas se rodar 2x, a 2ª falha pelo unique `(venue_id, code)`. Posso adicionar um `ON CONFLICT DO NOTHING` ou um delete prévio dos seats deste map_id — confirma qual prefere.

Posiciono tudo pixel-perfeito assim que você aprovar.
