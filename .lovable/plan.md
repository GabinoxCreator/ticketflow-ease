
# Corrigir Layout Mobile e Banner de Eventos

## Problemas Identificados

### 1. Paginas fora do centro no mobile
O arquivo `src/App.css` contem estilos padrao do Vite que limitam o layout:
- `max-width: 1280px` - restringe a largura
- `padding: 2rem` - adiciona espacamento indesejado
- `text-align: center` - centraliza texto indevidamente

Esses estilos no `#root` afetam TODAS as paginas e causam desalinhamento no mobile.

### 2. Banner do evento cortado
Na pagina de detalhes do evento (`src/pages/EventDetails.tsx`), o banner usa:
- `h-[50vh] md:h-[60vh]` com `object-cover` - isso corta a imagem para caber na altura fixa
- O usuario quer ver a imagem inteira e visivel

---

## Solucao

### Passo 1: Limpar App.css
Remover os estilos do `#root` no `src/App.css` que sao restos do template Vite. Manter apenas o necessario (ou deixar o arquivo vazio, ja que os estilos reais estao no `index.css`).

### Passo 2: Ajustar o banner do evento
Alterar a secao hero em `src/pages/EventDetails.tsx`:
- Trocar de altura fixa (`h-[50vh]`) para `aspect-ratio` ou `auto` height
- Usar `object-contain` em vez de `object-cover` para mostrar a imagem inteira
- Adicionar background escuro atras da imagem para preencher espacos vazios
- Ajustar o gradiente overlay para funcionar com a nova abordagem

---

## Detalhes Tecnicos

**Arquivo: `src/App.css`**
- Remover todo o bloco `#root { ... }` e os demais estilos nao utilizados (`.logo`, `.card`, `.read-the-docs`, `@keyframes logo-spin`)

**Arquivo: `src/pages/EventDetails.tsx` (linhas 160-186)**
- Mudar a secao de `h-[50vh]` para altura automatica baseada na imagem
- Alterar `object-cover` para `object-contain` com fundo escuro
- Manter o layout responsivo e o gradiente overlay
