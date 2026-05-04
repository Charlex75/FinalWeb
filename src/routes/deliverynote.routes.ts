import { Router } from 'express';
import {
  createDeliveryNote,
  listDeliveryNotes,
  getDeliveryNote,
  downloadPdf,
  signDeliveryNote,
  deleteDeliveryNote,
} from '../controllers/deliverynote.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { memoryUpload } from '../middleware/upload';
import { createDeliveryNoteSchema } from '../validators/deliverynote.validator';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: DeliveryNotes
 *     description: Delivery note management
 */

router.use(authenticate);

/**
 * @openapi
 * /api/deliverynote:
 *   post:
 *     summary: Create a new delivery note
 *     tags: [DeliveryNotes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [project, client, format, description, workDate]
 *             properties:
 *               project:     { type: string, description: "Project ObjectId" }
 *               client:      { type: string, description: "Client ObjectId" }
 *               format:      { type: string, enum: [material, hours] }
 *               description: { type: string }
 *               workDate:    { type: string, format: date }
 *               material:    { type: string }
 *               quantity:    { type: number }
 *               unit:        { type: string }
 *               hours:       { type: number }
 *     responses:
 *       201: { description: Delivery note created }
 *       400: { description: Validation error or format-specific field missing }
 *       404: { description: Project or client not found in company }
 */
router.post('/', validate(createDeliveryNoteSchema), createDeliveryNote);

/**
 * @openapi
 * /api/deliverynote:
 *   get:
 *     summary: List delivery notes (paginated + filters)
 *     tags: [DeliveryNotes]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: project
 *         schema: { type: string }
 *       - in: query
 *         name: client
 *         schema: { type: string }
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [material, hours] }
 *       - in: query
 *         name: signed
 *         schema: { type: boolean }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: sort
 *         schema: { type: string, example: "-workDate" }
 *     responses:
 *       200: { description: Paginated list of delivery notes }
 */
router.get('/', listDeliveryNotes);

/**
 * @openapi
 * /api/deliverynote/pdf/{id}:
 *   get:
 *     summary: Download delivery note as PDF
 *     tags: [DeliveryNotes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       302: { description: Redirect to stored PDF (when signed) }
 *       404: { description: Delivery note not found }
 */
// NOTE: /pdf/:id must come before /:id to avoid Express matching "pdf" as an id
router.get('/pdf/:id', downloadPdf);

/**
 * @openapi
 * /api/deliverynote/{id}:
 *   get:
 *     summary: Get a single delivery note with full populate
 *     tags: [DeliveryNotes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Delivery note object }
 *       404: { description: Delivery note not found }
 */
router.get('/:id', getDeliveryNote);

/**
 * @openapi
 * /api/deliverynote/{id}/sign:
 *   patch:
 *     summary: Sign a delivery note (uploads signature + generates PDF)
 *     tags: [DeliveryNotes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [signature]
 *             properties:
 *               signature:
 *                 type: string
 *                 format: binary
 *                 description: Signature image (JPEG / PNG / WebP, max 5 MB)
 *     responses:
 *       200: { description: Delivery note signed, signature and PDF URLs saved }
 *       400: { description: Already signed or no file attached }
 *       404: { description: Delivery note not found }
 */
router.patch('/:id/sign', memoryUpload.single('signature'), signDeliveryNote);

/**
 * @openapi
 * /api/deliverynote/{id}:
 *   delete:
 *     summary: Delete a delivery note (only if unsigned)
 *     tags: [DeliveryNotes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Delivery note deleted }
 *       400: { description: Signed delivery notes cannot be deleted }
 *       404: { description: Delivery note not found }
 */
router.delete('/:id', deleteDeliveryNote);

export default router;
