# Lefinance

App web de **controle de contas mensais familiar** — evolução da planilha de custos para um app com
login, dashboards e (no futuro) PWA instalável.

Arquitetura **não-monolito**: uma **API** (AdonisJS 6 + MySQL) e um **app Web** (React + Vite, PWA-ready),
que se comunicam por REST/JSON.

```
lefinance/
├── api/   AdonisJS 6 (REST API, TypeScript, Lucid ORM)
├── web/   React + Vite + TS (SPA → PWA)
└── docs/  spec e plano de implementação
```

## Pré-requisitos

- **Node** ≥ 20
- **XAMPP** com **MySQL** rodando em `localhost:3306` (usuário `root`, sem senha)
- Schema `lefinance` criado:
  ```sql
  CREATE DATABASE lefinance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  ```

## Setup

```bash
npm run install:all          # instala deps da api e da web
# configure api/.env (DB_DATABASE=lefinance, DB_USER=root, DB_PASSWORD=)
npm --prefix api run migration:run
```

## Rodar (desenvolvimento)

```bash
npm run dev:api              # API em http://localhost:3333
npm run dev:web              # Web em http://localhost:5173
```

## Documentação

- Spec/design: [`docs/superpowers/specs/2026-06-28-lefinance-design.md`](docs/superpowers/specs/2026-06-28-lefinance-design.md)
- Plano de implementação: [`docs/superpowers/plans/2026-06-28-lefinance-v1.md`](docs/superpowers/plans/2026-06-28-lefinance-v1.md)
