import { Router } from 'express';
import {
  createProject,
  listProjects,
  listArchivedProjects,
  getProject,
  updateProject,
  deleteProject,
  restoreProject,
} from '../controllers/project.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { createProjectSchema, updateProjectSchema } from '../validators/project.validator';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Projects
 *     description: Project management
 */

router.use(authenticate);

/**
 * @openapi
 * /api/project:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, projectCode, client]
 *             properties:
 *               name:        { type: string, example: "Reforma oficina" }
 *               projectCode: { type: string, example: "PRJ-001" }
 *               client:      { type: string, description: "Client ObjectId" }
 *               email:       { type: string, format: email }
 *               notes:       { type: string }
 *               active:      { type: boolean, default: true }
 *     responses:
 *       201:
 *         description: Project created
 *       404:
 *         description: Client not found in this company
 *       409:
 *         description: Project code already exists in this company
 */
router.post('/', validate(createProjectSchema), createProject);

/**
 * @openapi
 * /api/project:
 *   get:
 *     summary: List active projects (paginated + filters)
 *     tags: [Projects]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: client
 *         schema: { type: string }
 *         description: Filter by client ObjectId
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *         description: Partial name search (case-insensitive)
 *       - in: query
 *         name: active
 *         schema: { type: boolean }
 *       - in: query
 *         name: sort
 *         schema: { type: string, example: "-createdAt" }
 *         description: Field to sort by. Prefix with - for descending.
 *     responses:
 *       200:
 *         description: Paginated list of projects
 */
router.get('/', listProjects);

/**
 * @openapi
 * /api/project/archived:
 *   get:
 *     summary: List archived projects
 *     tags: [Projects]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated list of archived projects
 */
// NOTE: /archived must be declared before /:id
router.get('/archived', listArchivedProjects);

/**
 * @openapi
 * /api/project/{id}:
 *   get:
 *     summary: Get a single project (with populated client)
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Project object
 *       404:
 *         description: Project not found
 */
router.get('/:id', getProject);

/**
 * @openapi
 * /api/project/{id}:
 *   put:
 *     summary: Update a project
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:        { type: string }
 *               projectCode: { type: string }
 *               client:      { type: string }
 *               email:       { type: string, format: email }
 *               notes:       { type: string }
 *               active:      { type: boolean }
 *     responses:
 *       200:
 *         description: Project updated
 *       404:
 *         description: Project not found
 */
router.put('/:id', validate(updateProjectSchema), updateProject);

/**
 * @openapi
 * /api/project/{id}:
 *   delete:
 *     summary: Archive or hard-delete a project
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: soft
 *         schema: { type: boolean }
 *         description: true = archive, false = hard-delete
 *     responses:
 *       200:
 *         description: Project archived or deleted
 *       404:
 *         description: Project not found
 */
router.delete('/:id', deleteProject);

/**
 * @openapi
 * /api/project/{id}/restore:
 *   patch:
 *     summary: Restore an archived project
 *     tags: [Projects]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Project restored
 *       404:
 *         description: Archived project not found
 */
router.patch('/:id/restore', restoreProject);

export default router;
