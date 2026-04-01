'use strict';

const express = require('express');
const { z }   = require('zod');
const { requireAuth, requireSiteAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// ── Schemas ───────────────────────────────────────────────────────────────────

const FolderSchema = z.object({
  name:             z.string().min(1).max(200),
  parent_folder_id: z.string().uuid().nullable().optional(),
  sort_order:       z.number().int().min(0).optional(),
});

const FolderPatchSchema = z.object({
  name:             z.string().min(1).max(200).optional(),
  parent_folder_id: z.string().uuid().nullable().optional(),
  sort_order:       z.number().int().min(0).optional(),
});

const TodoSchema = z.object({
  title:            z.string().min(1).max(500),
  description:      z.string().max(10000).optional().default(''),
  priority:         z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
  status:           z.enum(['open', 'in_progress', 'done']).optional().default('open'),
  due_date:         z.string().nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  folder_id:        z.string().uuid().nullable().optional(),
});

const TodoPatchSchema = z.object({
  title:            z.string().min(1).max(500).optional(),
  description:      z.string().max(10000).optional(),
  priority:         z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status:           z.enum(['open', 'in_progress', 'done']).optional(),
  due_date:         z.string().nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  folder_id:        z.string().uuid().nullable().optional(),
});

const ChecklistItemSchema = z.object({
  label:      z.string().min(1).max(500),
  sort_order: z.number().int().min(0).optional(),
});

const ChecklistPatchSchema = z.object({
  label:      z.string().min(1).max(500).optional(),
  checked:    z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

const EntityTagSchema = z.object({
  entity_type: z.enum(['device', 'pool', 'share', 'subnet', 'host', 'vm', 'app', 'container']),
  entity_id:   z.string().uuid(),
});

// ── Serializers ───────────────────────────────────────────────────────────────

function toFolder(row) {
  return {
    id:             row.id,
    orgId:          row.org_id,
    siteId:         row.site_id,
    name:           row.name,
    parentFolderId: row.parent_folder_id ?? null,
    sortOrder:      row.sort_order ?? 0,
    createdAt:      row.created_at,
  };
}

function toChecklist(row) {
  return {
    id:        row.id,
    todoId:    row.todo_id,
    label:     row.label,
    checked:   row.checked ?? false,
    sortOrder: row.sort_order ?? 0,
  };
}

function toTag(row) {
  return {
    id:         row.id,
    todoId:     row.todo_id,
    entityType: row.entity_type,
    entityId:   row.entity_id,
  };
}

function toTodo(row) {
  let checklist = [];
  let tags = [];

  if (row.checklist) {
    const raw = typeof row.checklist === 'string' ? JSON.parse(row.checklist) : row.checklist;
    checklist = Array.isArray(raw) ? raw.filter(Boolean).map(r => ({
      id:        r.id,
      todoId:    r.todo_id,
      label:     r.label,
      checked:   r.checked ?? false,
      sortOrder: r.sort_order ?? 0,
    })) : [];
  }

  if (row.tags) {
    const raw = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
    tags = Array.isArray(raw) ? raw.filter(Boolean).map(r => ({
      id:         r.id,
      todoId:     r.todo_id,
      entityType: r.entity_type,
      entityId:   r.entity_id,
    })) : [];
  }

  return {
    id:             row.id,
    orgId:          row.org_id,
    siteId:         row.site_id,
    folderId:       row.folder_id ?? null,
    title:          row.title,
    description:    row.description ?? '',
    priority:       row.priority ?? 'normal',
    status:         row.status ?? 'open',
    dueDate:        row.due_date ?? null,
    assignedUserId: row.assigned_user_id ?? null,
    createdBy:      row.created_by ?? null,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    checklist,
    tags,
  };
}

// ── Router ────────────────────────────────────────────────────────────────────

module.exports = function todosRoutes(db) {
  const router = express.Router({ mergeParams: true });
  const auth   = [requireAuth, requireSiteAccess(db)];

  // ── Todo Folders ─────────────────────────────────────────────────────────

  // GET /api/sites/:siteId/todo-folders
  router.get('/:siteId/todo-folders', auth, async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `SELECT * FROM todo_folders
         WHERE org_id = $1 AND site_id = $2
         ORDER BY sort_order ASC, created_at ASC`,
        [orgId, siteId]
      );
      res.json(result.rows.map(toFolder));
    } catch (err) {
      console.error('[todos] GET folders', err.message);
      res.status(500).json({ error: 'failed to list folders' });
    }
  });

  // POST /api/sites/:siteId/todo-folders
  router.post('/:siteId/todo-folders', auth, validate(FolderSchema), async (req, res) => {
    const { siteId } = req.params;
    const { orgId }  = req.user;
    const { name, parent_folder_id = null, sort_order = 0 } = req.body;
    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `INSERT INTO todo_folders (org_id, site_id, name, parent_folder_id, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [orgId, siteId, name, parent_folder_id, sort_order]
      );
      res.status(201).json(toFolder(result.rows[0]));
    } catch (err) {
      console.error('[todos] POST folder', err.message);
      res.status(500).json({ error: 'failed to create folder' });
    }
  });

  // PATCH /api/sites/:siteId/todo-folders/:id
  router.patch('/:siteId/todo-folders/:id', auth, validate(FolderPatchSchema), async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    const fields = req.body;
    const keys   = Object.keys(fields);
    if (keys.length === 0) return res.status(400).json({ error: 'no fields to update' });

    const colMap = { name: 'name', parent_folder_id: 'parent_folder_id', sort_order: 'sort_order' };
    const validKeys = keys.filter(k => colMap[k]);
    if (validKeys.length === 0) return res.status(400).json({ error: 'no valid fields' });

    const setClauses = validKeys.map((k, i) => `${colMap[k]} = $${i + 4}`).join(', ');
    const values     = validKeys.map(k => fields[k]);

    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `UPDATE todo_folders SET ${setClauses}
         WHERE id = $1 AND org_id = $2 AND site_id = $3
         RETURNING *`,
        [id, orgId, siteId, ...values]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'folder not found' });
      res.json(toFolder(result.rows[0]));
    } catch (err) {
      console.error('[todos] PATCH folder', err.message);
      res.status(500).json({ error: 'failed to update folder' });
    }
  });

  // DELETE /api/sites/:siteId/todo-folders/:id
  router.delete('/:siteId/todo-folders/:id', auth, async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `DELETE FROM todo_folders WHERE id = $1 AND org_id = $2 AND site_id = $3 RETURNING id`,
        [id, orgId, siteId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'folder not found' });
      res.json({ id });
    } catch (err) {
      console.error('[todos] DELETE folder', err.message);
      res.status(500).json({ error: 'failed to delete folder' });
    }
  });

  // ── Todos — list and create ───────────────────────────────────────────────

  // GET /api/sites/:siteId/todos
  router.get('/:siteId/todos', auth, async (req, res) => {
    const { siteId }     = req.params;
    const { orgId }      = req.user;
    const { folder_id = null, status = null, assigned_user_id = null } = req.query;

    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `SELECT
           t.*,
           (
             SELECT json_agg(row_to_json(c) ORDER BY c.sort_order ASC)
             FROM todo_checklists c
             WHERE c.todo_id = t.id AND c.org_id = t.org_id
           ) AS checklist,
           (
             SELECT json_agg(row_to_json(tg))
             FROM todo_entity_tags tg
             WHERE tg.todo_id = t.id AND tg.org_id = t.org_id
           ) AS tags
         FROM todo_items t
         WHERE t.org_id = $1
           AND t.site_id = $2
           AND ($3::uuid IS NULL OR t.folder_id = $3)
           AND ($4::text IS NULL OR t.status = $4)
           AND ($5::uuid IS NULL OR t.assigned_user_id = $5)
         ORDER BY
           CASE t.priority
             WHEN 'urgent' THEN 1
             WHEN 'high'   THEN 2
             WHEN 'normal' THEN 3
             WHEN 'low'    THEN 4
           END ASC,
           t.created_at DESC`,
        [orgId, siteId, folder_id || null, status || null, assigned_user_id || null]
      );
      res.json(result.rows.map(toTodo));
    } catch (err) {
      console.error('[todos] GET todos', err.message);
      res.status(500).json({ error: 'failed to list todos' });
    }
  });

  // POST /api/sites/:siteId/todos
  router.post('/:siteId/todos', auth, validate(TodoSchema), async (req, res) => {
    const { siteId }  = req.params;
    const { orgId }   = req.user;
    const createdBy   = req.user.userId || req.user.id || null;
    const {
      title,
      description      = '',
      priority         = 'normal',
      status           = 'open',
      due_date         = null,
      assigned_user_id = null,
      folder_id        = null,
    } = req.body;

    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `INSERT INTO todo_items
           (org_id, site_id, folder_id, title, description, priority, status, due_date, assigned_user_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [orgId, siteId, folder_id, title, description, priority, status, due_date, assigned_user_id, createdBy]
      );
      const row = result.rows[0];
      res.status(201).json(toTodo({ ...row, checklist: null, tags: null }));
    } catch (err) {
      console.error('[todos] POST todo', err.message);
      res.status(500).json({ error: 'failed to create todo' });
    }
  });

  // ── Checklists — specific literal routes BEFORE /:todoId wildcard ─────────
  // IMPORTANT: These must be declared before PATCH /:siteId/todos/:id and
  // DELETE /:siteId/todos/:id so Express doesn't match "checklist" as :id.

  // PATCH /api/sites/:siteId/todos/checklist/:id
  router.patch('/:siteId/todos/checklist/:id', auth, validate(ChecklistPatchSchema), async (req, res) => {
    const { id }    = req.params;
    const { orgId } = req.user;
    const fields    = req.body;
    const keys      = Object.keys(fields);
    if (keys.length === 0) return res.status(400).json({ error: 'no fields to update' });

    const colMap    = { label: 'label', checked: 'checked', sort_order: 'sort_order' };
    const validKeys = keys.filter(k => colMap[k]);
    if (validKeys.length === 0) return res.status(400).json({ error: 'no valid fields' });

    const setClauses = validKeys.map((k, i) => `${colMap[k]} = $${i + 3}`).join(', ');
    const values     = validKeys.map(k => fields[k]);

    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `UPDATE todo_checklists SET ${setClauses}
         WHERE id = $1 AND org_id = $2
         RETURNING *`,
        [id, orgId, ...values]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'checklist item not found' });
      res.json(toChecklist(result.rows[0]));
    } catch (err) {
      console.error('[todos] PATCH checklist', err.message);
      res.status(500).json({ error: 'failed to update checklist item' });
    }
  });

  // DELETE /api/sites/:siteId/todos/checklist/:id
  router.delete('/:siteId/todos/checklist/:id', auth, async (req, res) => {
    const { id }    = req.params;
    const { orgId } = req.user;
    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `DELETE FROM todo_checklists WHERE id = $1 AND org_id = $2 RETURNING id`,
        [id, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'checklist item not found' });
      res.json({ id });
    } catch (err) {
      console.error('[todos] DELETE checklist', err.message);
      res.status(500).json({ error: 'failed to delete checklist item' });
    }
  });

  // ── Todos — single item routes ────────────────────────────────────────────

  // PATCH /api/sites/:siteId/todos/:id
  router.patch('/:siteId/todos/:id', auth, validate(TodoPatchSchema), async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    const fields = req.body;
    const keys   = Object.keys(fields);
    if (keys.length === 0) return res.status(400).json({ error: 'no fields to update' });

    const colMap = {
      title:            'title',
      description:      'description',
      priority:         'priority',
      status:           'status',
      due_date:         'due_date',
      assigned_user_id: 'assigned_user_id',
      folder_id:        'folder_id',
    };

    const validKeys  = keys.filter(k => colMap[k]);
    if (!validKeys.length) return res.status(400).json({ error: 'no valid fields to update' });

    const setClauses = validKeys.map((k, i) => `${colMap[k]} = $${i + 4}`).join(', ');
    const values     = validKeys.map(k => fields[k]);

    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `UPDATE todo_items
         SET ${setClauses}, updated_at = now()
         WHERE id = $1 AND org_id = $2 AND site_id = $3
         RETURNING *`,
        [id, orgId, siteId, ...values]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'todo not found' });

      const [clResult, tagResult] = await Promise.all([
        db.query(`SELECT * FROM todo_checklists WHERE todo_id = $1 AND org_id = $2 ORDER BY sort_order ASC`, [id, orgId]),
        db.query(`SELECT * FROM todo_entity_tags WHERE todo_id = $1 AND org_id = $2`, [id, orgId]),
      ]);

      const row     = result.rows[0];
      row.checklist = clResult.rows;
      row.tags      = tagResult.rows;
      res.json(toTodo(row));
    } catch (err) {
      console.error('[todos] PATCH todo', err.message);
      res.status(500).json({ error: 'failed to update todo' });
    }
  });

  // DELETE /api/sites/:siteId/todos/:id
  router.delete('/:siteId/todos/:id', auth, async (req, res) => {
    const { siteId, id } = req.params;
    const { orgId }      = req.user;
    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `DELETE FROM todo_items WHERE id = $1 AND org_id = $2 AND site_id = $3 RETURNING id`,
        [id, orgId, siteId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'todo not found' });
      res.json({ id });
    } catch (err) {
      console.error('[todos] DELETE todo', err.message);
      res.status(500).json({ error: 'failed to delete todo' });
    }
  });

  // ── Checklists — nested under todo ───────────────────────────────────────

  // GET /api/sites/:siteId/todos/:todoId/checklist
  router.get('/:siteId/todos/:todoId/checklist', auth, async (req, res) => {
    const { siteId, todoId } = req.params;
    const { orgId }          = req.user;
    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const todoCheck = await db.query(
        `SELECT id FROM todo_items WHERE id = $1 AND org_id = $2 AND site_id = $3`,
        [todoId, orgId, siteId]
      );
      if (todoCheck.rows.length === 0) return res.status(404).json({ error: 'todo not found' });

      const result = await db.query(
        `SELECT * FROM todo_checklists WHERE todo_id = $1 AND org_id = $2 ORDER BY sort_order ASC`,
        [todoId, orgId]
      );
      res.json(result.rows.map(toChecklist));
    } catch (err) {
      console.error('[todos] GET checklist', err.message);
      res.status(500).json({ error: 'failed to list checklist items' });
    }
  });

  // POST /api/sites/:siteId/todos/:todoId/checklist
  router.post('/:siteId/todos/:todoId/checklist', auth, validate(ChecklistItemSchema), async (req, res) => {
    const { siteId, todoId } = req.params;
    const { orgId }          = req.user;
    const { label, sort_order = 0 } = req.body;
    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const todoCheck = await db.query(
        `SELECT id FROM todo_items WHERE id = $1 AND org_id = $2 AND site_id = $3`,
        [todoId, orgId, siteId]
      );
      if (todoCheck.rows.length === 0) return res.status(404).json({ error: 'todo not found' });

      const result = await db.query(
        `INSERT INTO todo_checklists (org_id, todo_id, label, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [orgId, todoId, label, sort_order]
      );
      res.status(201).json(toChecklist(result.rows[0]));
    } catch (err) {
      console.error('[todos] POST checklist', err.message);
      res.status(500).json({ error: 'failed to add checklist item' });
    }
  });

  // ── Entity Tags ───────────────────────────────────────────────────────────

  // POST /api/sites/:siteId/todos/:todoId/tags
  router.post('/:siteId/todos/:todoId/tags', auth, validate(EntityTagSchema), async (req, res) => {
    const { siteId, todoId } = req.params;
    const { orgId }          = req.user;
    const { entity_type, entity_id } = req.body;
    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const todoCheck = await db.query(
        `SELECT id FROM todo_items WHERE id = $1 AND org_id = $2 AND site_id = $3`,
        [todoId, orgId, siteId]
      );
      if (todoCheck.rows.length === 0) return res.status(404).json({ error: 'todo not found' });

      const result = await db.query(
        `INSERT INTO todo_entity_tags (org_id, todo_id, entity_type, entity_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (todo_id, entity_type, entity_id) DO NOTHING
         RETURNING *`,
        [orgId, todoId, entity_type, entity_id]
      );

      if (result.rows.length === 0) {
        // Tag already exists — return existing
        const existing = await db.query(
          `SELECT * FROM todo_entity_tags
           WHERE todo_id = $1 AND entity_type = $2 AND entity_id = $3`,
          [todoId, entity_type, entity_id]
        );
        return res.status(200).json(toTag(existing.rows[0]));
      }

      res.status(201).json(toTag(result.rows[0]));
    } catch (err) {
      console.error('[todos] POST tag', err.message);
      res.status(500).json({ error: 'failed to add entity tag' });
    }
  });

  // DELETE /api/sites/:siteId/todos/:todoId/tags/:tagId
  router.delete('/:siteId/todos/:todoId/tags/:tagId', auth, async (req, res) => {
    const { todoId, tagId } = req.params;
    const { orgId }         = req.user;
    try {
      await db.query(`SET app.current_org_id = '${orgId}'`);
      const result = await db.query(
        `DELETE FROM todo_entity_tags
         WHERE id = $1 AND todo_id = $2 AND org_id = $3
         RETURNING id`,
        [tagId, todoId, orgId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'tag not found' });
      res.json({ id: tagId });
    } catch (err) {
      console.error('[todos] DELETE tag', err.message);
      res.status(500).json({ error: 'failed to delete tag' });
    }
  });

  return router;
};
