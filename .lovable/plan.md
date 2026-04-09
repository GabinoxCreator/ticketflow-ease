

# Redesign Visual — Tema Dark + Logo + Banner + Header Shotgun-style

## Resumo

Transformar a homepage do FestPag em tema dark inspirado no layout Shotgun (imagem 1), com a logo real (imagem 3) como imagem importada, o banner promocional (imagem 2) como hero, e nova paleta baseada nas cores da logo (azul `#6366F1` / roxo-rosa `#EC4899` com gradiente entre elas).

---

## Alterações

### 1. Copiar assets para o projeto
- `user-uploads://1.png` → `src/assets/logo-festpag.png` (logo)
- `user-uploads://Gemini_Generated_Image_ujmy4hujmy4hujmy.png` → `src/assets/banner-home.png` (banner)

### 2. Tema Dark — `src/index.css`
Substituir as variáveis CSS `:root` por tema escuro:
- `--background`: cinza muito escuro (~`220 15% 8%`)
- `--foreground`: branco
- `--card`: cinza escuro (~`220 15% 12%`)
- `--primary`: azul-roxo (`250 85% 60%`) — cor dominante da logo
- `--accent`: rosa-magenta (`330 85% 60%`) — segunda cor da logo
- `--muted`, `--border`, `--input`: tons de cinza escuro
- `--gradient-primary`: gradiente azul→rosa da logo
- Remover referências a cores verdes brasileiras

### 3. Header — `src/components/Header.tsx`
Redesign inspirado no Shotgun:
- Logo: substituir ícone Ticket + texto por `<img>` da logo-festpag.png
- Barra de busca inline no centro (visível no desktop, não mais modal icon-only): input com placeholder "Procure um evento, artista, produtor ou cidade" com ícone Search
- Lado direito: "Sou Produtor" com seta (link text + `ArrowUpRight` icon), e botão "Entrar / Cadastrar" com borda (outline)
- Quando logado: manter dropdown de avatar atual
- Mobile: busca colapsa, manter botões compactos

### 4. Homepage Banner — `src/pages/Index.tsx`
- Adicionar seção hero abaixo do header com a imagem do banner
- Banner dentro de container com `rounded-2xl`, margem lateral, e sombra/glow sutil (como se estivesse flutuando)
- `object-cover` com altura controlada (~300-400px desktop)
- Abaixo do banner, manter EventGrid com "Próximos Eventos"

### 5. Footer — `src/components/Footer.tsx`
- Substituir ícone Ticket + texto pela logo importada
- Ajustar cores para tema dark

### 6. Event Cards — `src/components/EventCard.tsx`
- Atualizar cores de category badges para usar as novas variáveis
- "Ver Ingressos" hover: usar gradiente azul→rosa

### 7. Button variants — `src/components/ui/button.tsx`
- `gradient` e `hero`: usar novo gradiente azul→rosa
- `outline`: border claro sobre fundo dark

### 8. Área do Produtor landing — `src/pages/AreaDoProdutor.tsx`
- Substituir logo/ícone pela imagem da logo
- Ajustar cores dos feature cards para tema dark

---

## Paleta extraída da logo

| Token | Valor | Uso |
|---|---|---|
| primary | `250 85% 60%` (azul-indigo) | Botões, links, destaques |
| accent | `330 85% 60%` (rosa-magenta) | Segundo tom, badges, gradientes |
| gradient | `from-[#6366F1] to-[#EC4899]` | CTAs, hover states, barra |
| background | `220 15% 8%` | Fundo geral |
| card | `220 15% 12%` | Cards, header |
| muted | `220 10% 18%` | Borders, inputs |

---

## Arquivos impactados

| Arquivo | Tipo |
|---|---|
| `src/assets/logo-festpag.png` | Novo (copy) |
| `src/assets/banner-home.png` | Novo (copy) |
| `src/index.css` | Tema dark completo |
| `src/components/Header.tsx` | Redesign Shotgun-style |
| `src/pages/Index.tsx` | Banner hero |
| `src/components/Footer.tsx` | Logo image |
| `src/components/ui/button.tsx` | Gradiente atualizado |
| `src/components/EventCard.tsx` | Cores ajustadas |
| `src/pages/AreaDoProdutor.tsx` | Logo + cores |

---

## Riscos
- Nenhuma alteração de banco ou auth
- Painel do produtor (`/produtor/*`) usa sidebar própria — pode precisar de ajuste de sidebar colors para tema dark
- Todas as páginas públicas serão afetadas pelo tema dark via CSS variables

