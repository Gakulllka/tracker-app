-- Миграция: пер-доменная ролевая модель (creator | editor | viewer).
-- См. prisma/schema.prisma, модель DomainEditor.
--
-- Поле DomainEditor.role добавляется через `prisma db push` (default 'editor').
-- Этот скрипт проставляет role='creator' существующим создателям доменов.
--
-- ВАЖНО: запускать ПОСЛЕ `npx prisma db push`. Безопасно повторять (idempotent).

-- Создатели доменов: запись DomainEditor, где userId = Domain.createdById, → role='creator'.
UPDATE "DomainEditor"
SET role = 'creator'
FROM "Domain"
WHERE "DomainEditor"."domainId" = "Domain"."id"
  AND "DomainEditor"."userId" = "Domain"."createdById"
  AND "Domain"."createdById" <> '';

-- Для доменов без DomainEditor-записи у создателя (createdById заполнен, но записи нет):
-- создаём её. Срабатывает для доменов, созданных до авто-выдачи прав.
INSERT INTO "DomainEditor" (id, "domainId", "userId", role, "grantedBy", "createdAt")
SELECT
  gen_random_uuid()::text,
  d.id,
  d."createdById",
  'creator',
  'system',
  NOW()
FROM "Domain" d
LEFT JOIN "DomainEditor" de
  ON de."domainId" = d.id AND de."userId" = d."createdById"
WHERE d."createdById" <> ''
  AND de.id IS NULL;
