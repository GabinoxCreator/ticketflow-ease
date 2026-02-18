
# Botao Curtir com Contagem de Curtidas

## O que sera feito

1. Remover os botoes "Voltar" e "Compartilhar" do banner
2. Mover o botao "Curtir" (coracao) para o canto inferior esquerdo da secao de informacoes do evento
3. Ao curtir: coracao fica vermelho (preenchido) e exibe o numero total de curtidas ao lado
4. Curtidas persistidas no banco de dados (por evento, usando localStorage para identificar o usuario anonimo)

## Alteracoes no Banco de Dados

Criar tabela `event_likes` para armazenar curtidas:

```sql
CREATE TABLE public.event_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  anonymous_id text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Indice para busca rapida por evento
CREATE INDEX idx_event_likes_event_id ON public.event_likes(event_id);

-- Evitar curtida duplicada do mesmo usuario
CREATE UNIQUE INDEX idx_event_likes_unique ON public.event_likes(event_id, anonymous_id);

-- RLS: leitura publica, insert/delete publico (usuario anonimo)
ALTER TABLE public.event_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read likes" ON public.event_likes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert likes" ON public.event_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can delete own likes" ON public.event_likes FOR DELETE USING (true);
```

## Alteracoes em Codigo

### Arquivo: `src/pages/EventDetails.tsx`

**Remover do banner (linhas 149-166):**
- Remover o bloco do botao "Voltar" (Link com ChevronLeft)
- Remover o bloco dos botoes "Compartilhar" e "Curtir" (div com Share2 e Heart)

**Adicionar botao curtir na secao de informacoes:**
- Logo abaixo da data/hora (apos linha 208), adicionar um botao com icone Heart
- Estado local `liked` (boolean) e `likeCount` (number)
- Ao clicar: toggle liked, coracao fica vermelho (`fill-red-500 text-red-500`), exibe contagem
- Usar `anonymous_id` gerado via localStorage para identificar o usuario

**Logica de curtida:**
- No mount, buscar contagem de curtidas do evento e se o usuario ja curtiu
- Ao curtir: INSERT na tabela `event_likes`
- Ao descurtir: DELETE da tabela `event_likes`
- Atualizar contagem localmente (otimistic update)

**Gerar anonymous_id:**
- Verificar localStorage por `anonymous_like_id`
- Se nao existir, gerar um UUID e salvar

**Visual do botao:**
- Botao com estilo inline (sem fundo card), apenas icone Heart + numero
- Quando curtido: Heart preenchido vermelho + numero
- Quando nao curtido: Heart outline + numero (se > 0)

### Imports a remover
- `ChevronLeft` e `Share2` (nao serao mais usados)

### Imports a manter
- `Heart` (continua sendo usado)

## Resumo de arquivos alterados
- Migration SQL: criar tabela `event_likes`
- `src/pages/EventDetails.tsx`: remover botoes, adicionar logica de curtida com banco de dados
