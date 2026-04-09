

# Correção da Logo FestPag — Header, Login, Sidebar

## Problema
1. Logo no Header está pequena demais (`h-8 md:h-10`)
2. Login do cliente (`Auth.tsx`) usa ícone Ticket + texto em vez da logo real
3. Login do produtor (`ProducerLogin.tsx`) usa ícone Ticket + texto em vez da logo real
4. Login do colaborador (`ColaboradorLogin.tsx`) usa ícone Ticket + texto
5. Sidebar do produtor (`ProducerSidebar.tsx`) usa ícone Ticket + texto em vez da logo real

## Plano

### 1. Copiar nova logo para o projeto
- `user-uploads://1-2.png` → `src/assets/logo-festpag.png` (substituir a atual)
- Esta logo tem fundo branco/transparente e o texto "festpag.digital" com gradiente azul-rosa

### 2. Header — aumentar logo
- `src/components/Header.tsx`: mudar `h-8 md:h-10` para `h-10 md:h-12` na tag `<img>`

### 3. Auth (login cliente) — usar logo real
- `src/pages/Auth.tsx` linhas 169-177: substituir o bloco `<div>` com ícone Ticket + texto "FestPag" por `<img src={logoFestpag} alt="FestPag" className="h-12 w-auto mx-auto" />`
- Adicionar import do `logoFestpag`

### 4. ProducerLogin — usar logo real
- `src/pages/ProducerLogin.tsx` linhas 83-91: mesmo tratamento

### 5. ColaboradorLogin — usar logo real
- `src/pages/colaborador/ColaboradorLogin.tsx` linhas com ícone Ticket: mesmo tratamento

### 6. ProducerSidebar — usar logo real
- `src/components/producer/ProducerSidebar.tsx` linhas 69-73: substituir o `<div>` com ícone Ticket por `<img src={logoFestpag} alt="FestPag" className="h-8 w-auto" />`
- Quando collapsed, mostrar apenas a primeira parte da logo ou manter o ícone quadrado

## Arquivos impactados
| Arquivo | Mudança |
|---|---|
| `src/assets/logo-festpag.png` | Substituir pela nova imagem |
| `src/components/Header.tsx` | Aumentar tamanho da logo |
| `src/pages/Auth.tsx` | Trocar ícone por logo real |
| `src/pages/ProducerLogin.tsx` | Trocar ícone por logo real |
| `src/pages/colaborador/ColaboradorLogin.tsx` | Trocar ícone por logo real |
| `src/components/producer/ProducerSidebar.tsx` | Trocar ícone por logo real |

