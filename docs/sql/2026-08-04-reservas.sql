-- ============================================================================
-- Lefinance — Reservas ("caixinhas" + rendimento)
-- Data: 2026-08-04
--
-- COMO USAR (phpMyAdmin):
--   1. Aba "SQL"
--   2. Cole ESTE ARQUIVO INTEIRO e clique em "Executar"
--
-- RODE ESTE ANTES DO SCRIPT DE GASTOS? Nao importa a ordem entre os dois: eles
-- nao dependem um do outro. Ambos dependem apenas de `workspaces`, que ja existe.
--
-- POR QUE ESTE SCRIPT EXISTE
-- O container da API sobe com `node ace migration:run --force && node bin/server.js`,
-- entao as migrations rodariam sozinhas no deploy. Rodando este script antes, os
-- INSERTs do PASSO 5 marcam as 4 migrations como ja aplicadas e o boot nao executa
-- migration nenhuma — se algo estiver errado, voce descobre AQUI, no phpMyAdmin,
-- e nao com a API fora do ar (o `&&` impede o servidor de subir se a migration falha).
--
-- Tabelas qualificadas com `lefinance-db`.`tabela` de proposito: sem isso, rodar na
-- aba SQL do SERVIDOR falha com "#1046 - Nenhum banco de dados foi selecionado".
-- ============================================================================


-- ── PASSO 1 · `reserve_accounts` ────────────────────────────────────────────
-- Uma linha por caixinha. NAO existe coluna de saldo: o saldo e sempre
-- SUM(reserve_movements.amount), para nunca divergir dos lancamentos.

CREATE TABLE `lefinance-db`.`reserve_accounts` (
  `id`                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workspace_id`              BIGINT UNSIGNED NULL,
  `name`                      VARCHAR(120) NOT NULL,
  `institution`               VARCHAR(120) NULL,
  `color`                     VARCHAR(7) NULL,
  -- Ancora do PRIMEIRO mes de apuracao. Nenhum rendimento existe antes dela.
  `opened_at`                 DATE NOT NULL,
  `goal_amount`               DECIMAL(12,2) NULL,
  `goal_date`                 DATE NULL,
  `goal_monthly_contribution` DECIMAL(12,2) NULL,
  `sort_order`                INT NOT NULL DEFAULT 0,
  `archived`                  TINYINT(1) NOT NULL DEFAULT 0,
  -- 'YYYY-MM' do ultimo mes JA APURADO.
  `last_closed_period`        VARCHAR(7) NULL,
  `created_at`                TIMESTAMP NULL,
  `updated_at`                TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `reserve_accounts_workspace_id_sort_order_index` (`workspace_id`, `sort_order`),
  KEY `reserve_accounts_workspace_id_archived_index` (`workspace_id`, `archived`),
  CONSTRAINT `reserve_accounts_workspace_id_foreign`
    FOREIGN KEY (`workspace_id`) REFERENCES `lefinance-db`.`workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── PASSO 2 · `reserve_rate_periods` ────────────────────────────────────────
-- Historico versionado da taxa. Trocar de 100% para 110% do CDI em agosto nao
-- reescreve julho.
--
-- ATENCAO AOS NOMES DOS INDICES: o padrao do Knex para estas colunas geraria
-- identificadores de 77 e 89 caracteres, e o MySQL corta em 64 (erro 1059).
-- Os nomes abaixo sao os curtos, e batem exatamente com os `indexName`
-- explicitos que a migration passou a usar.

CREATE TABLE `lefinance-db`.`reserve_rate_periods` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workspace_id`       BIGINT UNSIGNED NULL,
  `reserve_account_id` BIGINT UNSIGNED NULL,
  `effective_year`     INT NOT NULL,
  `effective_month`    INT NOT NULL,
  `rate_kind`          ENUM('monthly','yearly','cdi') NOT NULL,
  -- PERCENTUAL, nunca fracao: 0.850000 = 0,85% a.m. | 102.000000 = 102% do CDI
  `rate_value`         DECIMAL(9,6) NOT NULL,
  `created_at`         TIMESTAMP NULL,
  `updated_at`         TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reserve_rate_periods_account_period_unique`
    (`reserve_account_id`, `effective_year`, `effective_month`),
  KEY `reserve_rate_periods_ws_account_period_index`
    (`workspace_id`, `reserve_account_id`, `effective_year`, `effective_month`),
  CONSTRAINT `reserve_rate_periods_workspace_id_foreign`
    FOREIGN KEY (`workspace_id`) REFERENCES `lefinance-db`.`workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reserve_rate_periods_reserve_account_id_foreign`
    FOREIGN KEY (`reserve_account_id`) REFERENCES `lefinance-db`.`reserve_accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── PASSO 3 · `reserve_movements` ───────────────────────────────────────────
-- O razao. `amount` e ASSINADO: SUM(amount) = saldo, sem CASE WHEN.
--   opening    = saldo que JA existia no banco ao cadastrar
--   deposit    = aporte        | withdrawal = saque
--   adjustment = acerto com o extrato (conta como RENDIMENTO)
--   yield      = rendimento apurado (so o YieldService cria)

CREATE TABLE `lefinance-db`.`reserve_movements` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workspace_id`        BIGINT UNSIGNED NULL,
  `reserve_account_id`  BIGINT UNSIGNED NULL,
  `kind`                ENUM('opening','deposit','withdrawal','adjustment','yield') NOT NULL,
  -- Data-caixa. Para kind='yield' e SEMPRE o ultimo dia do mes de competencia.
  `occurred_on`         DATE NOT NULL,
  `amount`              DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `description`         VARCHAR(180) NULL,
  -- Memoria de calculo, congelada na linha (auditoria humana)
  `yield_period`        VARCHAR(7) NULL,
  `yield_base`          DECIMAL(14,6) NULL,
  `yield_rate_applied`  DECIMAL(12,10) NULL,
  `yield_rate_kind`     ENUM('monthly','yearly','cdi') NULL,
  `yield_rate_source`   DECIMAL(9,6) NULL,
  `yield_cdi_annual`    DECIMAL(9,6) NULL,
  `created_at`          TIMESTAMP NULL,
  `updated_at`          TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  -- Idempotencia da apuracao garantida pelo BANCO. `yield_period` e NULLABLE e o
  -- InnoDB permite varios NULLs num indice unico — logo depositos e saques se
  -- repetem a vontade, enquanto o rendimento de um mes e fisicamente unico por conta.
  UNIQUE KEY `reserve_movements_reserve_account_id_yield_period_unique`
    (`reserve_account_id`, `yield_period`),
  KEY `reserve_movements_reserve_account_id_occurred_on_id_index`
    (`reserve_account_id`, `occurred_on`, `id`),
  KEY `reserve_movements_workspace_id_occurred_on_index`
    (`workspace_id`, `occurred_on`),
  KEY `reserve_movements_workspace_id_kind_occurred_on_index`
    (`workspace_id`, `kind`, `occurred_on`),
  CONSTRAINT `reserve_movements_workspace_id_foreign`
    FOREIGN KEY (`workspace_id`) REFERENCES `lefinance-db`.`workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `reserve_movements_reserve_account_id_foreign`
    FOREIGN KEY (`reserve_account_id`) REFERENCES `lefinance-db`.`reserve_accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── PASSO 4 · `cdi_rates` ───────────────────────────────────────────────────
-- CDI ANUAL em percentual: 14.900000 = 14,90% ao ano. Esparso: voce digita
-- 1 numero por ano, nao 12.

CREATE TABLE `lefinance-db`.`cdi_rates` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workspace_id` BIGINT UNSIGNED NULL,
  `year`         INT NOT NULL,
  `month`        INT NOT NULL,
  `annual_rate`  DECIMAL(9,6) NOT NULL,
  `created_at`   TIMESTAMP NULL,
  `updated_at`   TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `cdi_rates_workspace_id_year_month_unique` (`workspace_id`, `year`, `month`),
  KEY `cdi_rates_workspace_id_year_month_index` (`workspace_id`, `year`, `month`),
  CONSTRAINT `cdi_rates_workspace_id_foreign`
    FOREIGN KEY (`workspace_id`) REFERENCES `lefinance-db`.`workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── PASSO 5 · marcar as 4 migrations como aplicadas ─────────────────────────
-- Sem isto, o `migration:run --force` do boot tenta recriar as tabelas, falha
-- com "table already exists", o `&&` corta e a API NAO SOBE.
--
-- A primeira abre um lote novo (MAX + 1); as tres seguintes entram no MESMO lote,
-- porque a essa altura o MAX ja e o lote recem-criado.

INSERT INTO `lefinance-db`.`adonis_schema` (`name`, `batch`, `migration_time`)
SELECT 'database/migrations/1782800000001_create_reserve_accounts_table',
       COALESCE(MAX(`batch`), 0) + 1, NOW()
FROM `lefinance-db`.`adonis_schema`;

INSERT INTO `lefinance-db`.`adonis_schema` (`name`, `batch`, `migration_time`)
SELECT 'database/migrations/1782800000002_create_reserve_rate_periods_table',
       MAX(`batch`), NOW()
FROM `lefinance-db`.`adonis_schema`;

INSERT INTO `lefinance-db`.`adonis_schema` (`name`, `batch`, `migration_time`)
SELECT 'database/migrations/1782800000003_create_reserve_movements_table',
       MAX(`batch`), NOW()
FROM `lefinance-db`.`adonis_schema`;

INSERT INTO `lefinance-db`.`adonis_schema` (`name`, `batch`, `migration_time`)
SELECT 'database/migrations/1782800000004_create_cdi_rates_table',
       MAX(`batch`), NOW()
FROM `lefinance-db`.`adonis_schema`;


-- ── CONFERENCIA ─────────────────────────────────────────────────────────────
-- Rode DEPOIS, separado. A primeira deve devolver 4; a segunda, 6.
--
--   SELECT COUNT(*) FROM information_schema.TABLES
--     WHERE TABLE_SCHEMA = 'lefinance-db'
--       AND TABLE_NAME IN ('reserve_accounts','reserve_rate_periods',
--                          'reserve_movements','cdi_rates');
--
--   SELECT COUNT(*) FROM `lefinance-db`.`adonis_schema`
--     WHERE `name` LIKE 'database/migrations/1782%00000%'
--       AND `name` NOT LIKE '%1782669%' AND `name` NOT LIKE '%1782700%';


-- ============================================================================
-- COMO DESFAZER
-- ============================================================================
-- A ordem importa: as filhas antes das pais, por causa das FOREIGN KEYs.
--
--   DROP TABLE IF EXISTS `lefinance-db`.`reserve_movements`;
--   DROP TABLE IF EXISTS `lefinance-db`.`reserve_rate_periods`;
--   DROP TABLE IF EXISTS `lefinance-db`.`cdi_rates`;
--   DROP TABLE IF EXISTS `lefinance-db`.`reserve_accounts`;
--
--   DELETE FROM `lefinance-db`.`adonis_schema`
--     WHERE `name` IN (
--       'database/migrations/1782800000001_create_reserve_accounts_table',
--       'database/migrations/1782800000002_create_reserve_rate_periods_table',
--       'database/migrations/1782800000003_create_reserve_movements_table',
--       'database/migrations/1782800000004_create_cdi_rates_table'
--     );
-- ============================================================================
