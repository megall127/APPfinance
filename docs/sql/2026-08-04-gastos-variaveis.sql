-- ============================================================================
-- Lefinance — Gastos Variaveis ("gastos da rua")
-- Data: 2026-08-04
--
-- COMO USAR (phpMyAdmin):
--   1. Aba "SQL"
--   2. Cole ESTE ARQUIVO INTEIRO e clique em "Executar"
--
-- Todas as tabelas estao QUALIFICADAS com `lefinance-db`.`tabela`, de proposito.
-- Sem isso, rodar na aba SQL do SERVIDOR (em vez de dentro do banco) falha com
-- "#1046 - Nenhum banco de dados foi selecionado" — e um `USE` no topo NAO
-- resolve, porque o phpMyAdmin reseta o banco corrente entre as instrucoes.
-- As crases sao OBRIGATORIAS: o hifen em `lefinance-db` quebra a sintaxe sem elas.
--
-- Se o seu banco tiver outro nome, troque `lefinance-db` em todo o arquivo.
--
-- ATENCAO: este arquivo e ALTERNATIVO a `node ace migration:run`.
-- Rodar os dois no mesmo banco faz o segundo falhar com "table already exists".
-- Se voce rodar este script, os INSERTs do PASSO 3 marcam as migrations como
-- ja aplicadas, e o `migration:run` passa direto por elas no futuro.
-- ============================================================================


-- ── PASSO 1 · coluna `auto_source` em `items` ───────────────────────────────
-- Marca o item gerado pela aba Gastos. NULL = item normal, criado por voce.
-- O indice unico garante UM item automatico por workspace; o InnoDB permite
-- varios NULLs num indice unico, entao seus itens normais nao sao afetados.

ALTER TABLE `lefinance-db`.`items`
  ADD COLUMN `auto_source` VARCHAR(32) NULL AFTER `kind`;

CREATE UNIQUE INDEX `items_workspace_auto_source_unique`
  ON `lefinance-db`.`items` (`workspace_id`, `auto_source`);


-- ── PASSO 2 · tabela `variable_expenses` ────────────────────────────────────
-- Um registro por gasto anotado. `spent_on` e a unica coisa que define a qual
-- mes o gasto pertence — nao existe coluna de ano/mes denormalizada.

CREATE TABLE `lefinance-db`.`variable_expenses` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `workspace_id`  BIGINT UNSIGNED NULL,
  `category_id`   BIGINT UNSIGNED NULL,
  `spent_on`      DATE NOT NULL,
  `amount`        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `description`   VARCHAR(180) NULL,
  `created_at`    TIMESTAMP NULL,
  `updated_at`    TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `variable_expenses_ws_spent_on_index` (`workspace_id`, `spent_on`),
  KEY `variable_expenses_ws_category_index` (`workspace_id`, `category_id`),
  CONSTRAINT `variable_expenses_workspace_id_foreign`
    FOREIGN KEY (`workspace_id`) REFERENCES `lefinance-db`.`workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `variable_expenses_category_id_foreign`
    FOREIGN KEY (`category_id`) REFERENCES `lefinance-db`.`categories` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── PASSO 3 · marcar as migrations como aplicadas ───────────────────────────
-- Sem isto, um `node ace migration:run` futuro tenta recriar tudo e quebra.
--
-- O formato do campo `name` foi confirmado no banco real em 2026-08-04:
-- 'database/migrations/<arquivo sem .ts>', e todas as linhas existentes estao
-- em batch = 1. A primeira instrucao abre o lote 2; a segunda entra no MESMO
-- lote, porque a essa altura o MAX ja e 2.

INSERT INTO `lefinance-db`.`adonis_schema` (`name`, `batch`, `migration_time`)
SELECT 'database/migrations/1782900000001_add_auto_source_to_items',
       COALESCE(MAX(`batch`), 0) + 1,
       NOW()
FROM `lefinance-db`.`adonis_schema`;

INSERT INTO `lefinance-db`.`adonis_schema` (`name`, `batch`, `migration_time`)
SELECT 'database/migrations/1782900000002_create_variable_expenses_table',
       MAX(`batch`),
       NOW()
FROM `lefinance-db`.`adonis_schema`;


-- ── CONFERENCIA ─────────────────────────────────────────────────────────────
-- Rode DEPOIS, separado. Deve devolver a coluna nova e a tabela nova.
--
--   SHOW COLUMNS FROM `lefinance-db`.`items` LIKE 'auto_source';
--   SHOW CREATE TABLE `lefinance-db`.`variable_expenses`;


-- ============================================================================
-- COMO DESFAZER (se precisar voltar atras)
-- ============================================================================
-- Rode NESTA ORDEM. Os DELETEs precisam vir ANTES do DROP COLUMN, senao a
-- coluna `auto_source` nao existe mais para filtrar.
--
--   DELETE `e` FROM `lefinance-db`.`monthly_entries` `e`
--     JOIN `lefinance-db`.`items` `i` ON `i`.`id` = `e`.`item_id`
--     WHERE `i`.`auto_source` = 'variable_expenses';
--
--   DELETE FROM `lefinance-db`.`items` WHERE `auto_source` = 'variable_expenses';
--
--   DROP TABLE IF EXISTS `lefinance-db`.`variable_expenses`;
--
--   DROP INDEX `items_workspace_auto_source_unique` ON `lefinance-db`.`items`;
--   ALTER TABLE `lefinance-db`.`items` DROP COLUMN `auto_source`;
--
--   DELETE FROM `lefinance-db`.`adonis_schema`
--     WHERE `name` IN (
--       'database/migrations/1782900000001_add_auto_source_to_items',
--       'database/migrations/1782900000002_create_variable_expenses_table'
--     );
-- ============================================================================
