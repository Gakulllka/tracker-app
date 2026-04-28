-- Добавить роли Editor и Viewer в Supabase
-- Запустить в SQL Editor в Supabase Dashboard

INSERT INTO "Role" ("id", "name", "description", "permissions", "isSystem", "createdAt", "updatedAt")
VALUES 
  (
    'role_editor',
    'Editor',
    'Просмотр и редактирование',
    '{"canViewTasks":true,"canEditTasks":true,"canDeleteTasks":false,"canViewBacklog":true,"canEditBacklog":true,"canDeleteBacklog":false,"canViewQuestions":true,"canEditQuestions":true,"canDeleteQuestions":false,"canViewPresentations":true,"canCreatePresentations":true,"canUseAI":true,"visibleDomains":"all"}',
    true,
    NOW(),
    NOW()
  ),
  (
    'role_viewer',
    'Viewer',
    'Только просмотр',
    '{"canViewTasks":true,"canEditTasks":false,"canDeleteTasks":false,"canViewBacklog":true,"canEditBacklog":false,"canDeleteBacklog":false,"canViewQuestions":true,"canEditQuestions":false,"canDeleteQuestions":false,"canViewPresentations":true,"canCreatePresentations":false,"canUseAI":false,"visibleDomains":"all"}',
    true,
    NOW(),
    NOW()
  )
ON CONFLICT ("id") DO NOTHING;

-- Проверить результат
SELECT id, name, description, "isSystem" FROM "Role" ORDER BY "createdAt";
