import { Router } from 'express';
import {
  createClient,
  listClients,
  listArchivedClients,
  getClient,
  updateClient,
  deleteClient,
  restoreClient,
} from '../controllers/client.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { createClientSchema, updateClientSchema } from '../validators/client.validator';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Clients
 *     description: Client management
 */

// All client routes require authentication
router.use(authenticate);

/**
 * @openapi
 * /api/client:
 *   post:
 *     summary: Create a new client
 *     tags: [Clients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:    { type: string, example: "García Construcciones" }
 *               cif:     { type: string, example: "B12345678" }
 *               email:   { type: string, format: email }
 *               phone:   { type: string, example: "600000001" }
 *     responses:
 *       201:
 *         description: Client created
 *       409:
 *         description: CIF already exists in this company
 */
router.post('/', validate(createClientSchema), createClient);

/**
 * @openapi
 * /api/client:
 *   get:
 *     summary: List active clients (paginated + filters)
 *     tags: [Clients]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: name
 *         schema: { type: string }
 *         description: Partial name search (case-insensitive)
 *       - in: query
 *         name: sort
 *         schema: { type: string, example: "-createdAt" }
 *         description: Field to sort by. Prefix with - for descending.
 *     responses:
 *       200:
 *         description: Paginated list of clients
 */
router.get('/', listClients);

/**
 * @openapi
 * /api/client/archived:
 *   get:
 *     summary: List archived clients
 *     tags: [Clients]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: Paginated list of archived clients
 */
// NOTE: /archived must be declared before /:id so Express does not match "archived" as an ID
router.get('/archived', listArchivedClients);

/**
 * @openapi
 * /api/client/{id}:
 *   get:
 *     summary: Get a single client
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Client object
 *       404:
 *         description: Client not found
 */
router.get('/:id', getClient);

/**
 * @openapi
 * /api/client/{id}:
 *   put:
 *     summary: Update a client
 *     tags: [Clients]
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
 *               name:  { type: string }
 *               cif:   { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string }
 *     responses:
 *       200:
 *         description: Client updated
 *       404:
 *         description: Client not found
 */
router.put('/:id', validate(updateClientSchema), updateClient);

/**
 * @openapi
 * /api/client/{id}:
 *   delete:
 *     summary: Archive or hard-delete a client
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: soft
 *         schema: { type: boolean }
 *         description: true = soft-delete (archive), false = hard-delete
 *     responses:
 *       200:
 *         description: Client archived or deleted
 *       404:
 *         description: Client not found
 */
router.delete('/:id', deleteClient);

/**
 * @openapi
 * /api/client/{id}/restore:
 *   patch:
 *     summary: Restore an archived client
 *     tags: [Clients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Client restored
 *       404:
 *         description: Archived client not found
 */
router.patch('/:id/restore', restoreClient);

export default router;
