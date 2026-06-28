# Lefinance

App web de **controle de contas mensais familiar** — evolução da planilha de custos para um app com
login, dashboards e PWA instalável (estrutura pronta para ativação).

Arquitetura **não-monolito**: uma **API** (AdonisJS 7 + MySQL) e um **app Web** (React + Vite, PWA-ready),
que se comunicam por REST/JSON com autenticação Bearer token.

```
lefinance/
├── api/   AdonisJS 7 (REST API, TypeScript, Lucid ORM) → :3333/api/v1
├── web/   React + Vite + TS (SPA → PWA)               → :5173
└── docs/  spec e plano de implementação
```

---

## Pré-requisitos

| Requisito | Versão mínima | Observação |
|---|---|---|
| **Node.js** | 22+ | A API usa `--experimental-vm-modules` (baked nos scripts); Node 20 também funciona |
| **XAMPP** | qualquer | MySQL rodando em `localhost:3306` |

Crie o schema antes de rodar as migrações:

```sql
CREATE DATABASE lefinance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

---

## Instalação

```bash
# 1. Clone o repositório e entre na pasta
git clone <url> lefinance && cd lefinance

# 2. Instala dependências da API e da Web de uma vez
npm run install:all
```

---

## Configuração da API

Copie o arquivo de exemplo e ajuste as variáveis:

```bash
cp api/.env.example api/.env   # se não existir, crie api/.env
```

Conteúdo mínimo de `api/.env`:

```env
TZ=UTC
PORT=3333
HOST=localhost
LOG_LEVEL=info
APP_KEY=<gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))">
NODE_ENV=development

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_DATABASE=lefinance

# Permite o front em dev acessar a API
CORS_ORIGIN=http://localhost:5173
```

---

## Banco de dados — migrações

> A convenção do AdonisJS 7 usa `npm run ace -- <comando>` (com `--`)
> para separar os argumentos do Ace dos do npm.

```bash
# Roda todas as migrações (cria tabelas)
npm --prefix api run ace -- migration:run

# Desfaz migrações (opcional, para reset)
npm --prefix api run ace -- migration:rollback
```

---

## Rodar em desenvolvimento

Dois processos paralelos (abra dois terminais):

```bash
# Terminal 1 — API em http://localhost:3333  (base: /api/v1)
npm run dev:api

# Terminal 2 — Web em http://localhost:5173
npm run dev:web
```

Acesse `http://localhost:5173`, cadastre-se e faça login.

---

## Importar a planilha

1. Acesse **Importar** no menu lateral.
2. Arraste o arquivo `Planilhas_de_custos_melhorada.xlsx` (ou clique para selecionar).
3. Confira a pré-visualização (itens e lançamentos por ano).
4. Clique em **Confirmar importação**.

A operação é **idempotente** — pode ser repetida sem duplicar dados.

---

## Build de produção

```bash
npm --prefix web run build   # gera dist/ otimizado
npm --prefix web run preview # serve o build localmente para teste
```

---

## Testes

```bash
npm --prefix web run test        # testes unitários do front (Vitest)
npm --prefix api run typecheck   # verificação de tipos da API
```

---

## Documentação técnica

- Spec/design: [`docs/superpowers/specs/2026-06-28-lefinance-design.md`](docs/superpowers/specs/2026-06-28-lefinance-design.md)
- Plano de implementação: [`docs/superpowers/plans/2026-06-28-lefinance-v1.md`](docs/superpowers/plans/2026-06-28-lefinance-v1.md)
