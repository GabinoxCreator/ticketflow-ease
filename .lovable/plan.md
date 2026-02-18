
# Corrigir Layout Mobile: Centralização e Banner

## Problemas Identificados

1. **Banner sangrando para fora da tela**: A imagem do banner ultrapassa os limites da tela no mobile, aparecendo cortada na esquerda. Isso acontece porque a section do banner nao tem restricao de largura adequada.

2. **Conteudo sobrepondo o banner**: O `-mt-32` na section de conteudo puxa os cards muito para cima, cobrindo parte do banner. No mobile isso fica especialmente ruim.

---

## Solucao

### Arquivo: `src/pages/EventDetails.tsx`

**Correcao 1 - Banner centralizado e contido:**
- Adicionar `w-full` e garantir que a imagem nao ultrapasse os limites da viewport
- Trocar `object-contain` por `object-cover` com altura controlada para preencher melhor o espaco
- Ou manter `object-contain` mas garantir que o container pai limite corretamente

**Correcao 2 - Reduzir sobreposicao do conteudo:**
- Reduzir o `-mt-32` para `-mt-16` ou `-mt-8` no mobile para que o card nao cubra tanto o banner
- Usar classes responsivas: `-mt-8 md:-mt-16 lg:-mt-32`

### Alteracoes especificas:

**Linha 160 - Section do banner:**
Mudar de:
```
<section className="relative overflow-hidden bg-black">
```
Para:
```
<section className="relative overflow-hidden bg-black w-full">
```

**Linha 161 - Container da imagem:**
Mudar para garantir que a imagem fique dentro dos limites:
```
<div className="w-full max-h-[50vh] md:max-h-[70vh] flex items-center justify-center overflow-hidden">
```

**Linha 165 - Imagem:**
Ajustar para mobile:
```
className="w-full h-auto max-h-[50vh] md:max-h-[70vh] object-contain"
```

**Linha 191 - Section de conteudo:**
Reduzir margem negativa no mobile:
```
<section className="container px-4 -mt-8 md:-mt-16 lg:-mt-32 relative z-10 pb-32">
```

Essas mudancas vao: (1) manter o banner dentro da tela em qualquer dispositivo e (2) evitar que o conteudo cubra o banner no mobile.
