

# Fundo do Hero Desktop com Banner Desfocado

## O que sera feito

Adicionar a imagem do banner do evento como fundo da secao hero no desktop, com efeito de desfoque (blur) intenso, criando um efeito visual similar ao Ze do Ingresso. A imagem principal continua nitida no lado direito.

## Alteracoes

### Arquivo: `src/pages/EventDetails.tsx`

**Secao hero desktop (linhas ~160-195):**

1. Adicionar um elemento `<div>` com a imagem do evento como `background-image` posicionado absoluto atras de todo o conteudo do hero
2. Aplicar `blur-2xl` ou `blur-3xl` + `opacity-30` + `scale-110` para criar o efeito de fundo desfocado que sangra suavemente
3. Adicionar um overlay escuro/claro sutil por cima para manter a legibilidade do texto
4. A `<section>` do hero recebera `relative overflow-hidden` para conter o fundo desfocado

### Estrutura resultante

```text
<section class="relative overflow-hidden ...">
  <!-- Fundo desfocado -->
  <div class="absolute inset-0">
    <img src={banner} class="w-full h-full object-cover scale-110 blur-3xl opacity-30" />
    <div class="absolute inset-0 bg-background/60" />  <!-- overlay -->
  </div>
  <!-- Conteudo (info + imagem) com z-10 -->
  <div class="relative z-10 flex ...">
    ...
  </div>
</section>
```

### Detalhes tecnicos

- `scale-110` evita bordas brancas causadas pelo blur
- `opacity-30` mantem o efeito sutil sem prejudicar leitura
- Overlay com `bg-background/60` garante contraste com o texto
- `overflow-hidden` na section impede que o blur vaze para fora
- Nenhuma mudanca no layout mobile

