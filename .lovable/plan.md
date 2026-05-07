# Corrigir tela preta ao printar confirmação de check-in

## Problema

Quando o ingresso é validado com sucesso, o modal verde aparece **sobreposto à câmera** (que continua rodando atrás). Em iOS, o stream de vídeo da câmera **não é capturado em screenshots por segurança do sistema** — então o print sai todo preto, mesmo com o modal verde visível na tela.

## Causa

No `ColaboradorQRScanner.tsx`, ao validar com sucesso:
1. `setValidating(false)` esconde o overlay de "Validando…"
2. `setResult(r)` mostra o `CheckinResultModal` (que tem fundo `bg-black/70`)
3. Mas o `<div id="colaborador-qr-reader">` com o `<video>` da câmera continua ativo atrás
4. iOS substitui o vídeo por preto no screenshot → fundo todo preto

## Solução

Garantir um **fundo sólido opaco** atrás do modal de resultado quando há resultado, e parar a câmera para liberar recurso e evitar artefato.

### `src/components/colaborador/ColaboradorQRScanner.tsx`

1. Quando `result` está setado, renderizar uma **camada de fundo sólida** (`bg-slate-950`) cobrindo o scanner — assim o screenshot captura essa cor sólida atrás do modal verde, não o preto do vídeo.
2. Parar o scanner (`scannerRef.current.stop()`) assim que `result` for definido — economiza bateria e remove o `<video>` problemático.
3. Reiniciar o scanner quando `result` voltar a `null` (modal fechado).

Mudança concreta:
- Adicionar `useEffect([result])` que para a câmera quando `result !== null` e reinicia quando volta a `null`.
- Adicionar uma `<div className="absolute inset-0 bg-slate-950 z-20" />` quando `result` está ativo (atrás do modal mas acima do `<video>`).

## Fora de escopo

- Lógica de validação, edge functions, regras de check-in
- Outros estados (busca manual já não tem esse problema, pois não há câmera ativa)

## Validação manual

1. Escanear um QR válido no celular → modal verde aparece.
2. Tirar print da tela → o screenshot deve mostrar o **modal verde sobre fundo escuro sólido**, não tela toda preta.
3. Fechar o modal → câmera reinicia normalmente e volta a escanear.
4. Mesma validação para estados de erro (já utilizado, fora da janela, etc.).
