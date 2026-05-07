import type { Request, Response } from 'express';
import sharp from 'sharp';
import { DeliveryNote } from '../models/DeliveryNote';
import { Project } from '../models/Project';
import { Client } from '../models/Client';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { uploadBuffer } from '../services/storage.service';
import { generateDeliveryNotePdf, type PdfNoteData } from '../services/pdf.service';
import config from '../config/index';

// ─── helpers ────────────────────────────────────────────────────────────────

async function requireCompany(userId: string) {
  const user = await User.findById(userId).select('company');
  if (!user?.company) throw AppError.badRequest('Complete company onboarding first');
  return user.company;
}

const POPULATE_FULL = [
  { path: 'user',    select: 'name email' },
  { path: 'company', select: 'name cif' },
  { path: 'client',  select: 'name cif email' },
  { path: 'project', select: 'name projectCode' },
];

// ─── create ──────────────────────────────────────────────────────────────────

export const createDeliveryNote = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);
  const {
    project: projectId, client: clientId,
    format, description, workDate,
    material, quantity, unit,
    hours, workers,
  } = req.body as {
    project: string; client: string; format: 'material' | 'hours';
    description: string; workDate: string;
    material?: string; quantity?: number; unit?: string;
    hours?: number; workers?: Array<{ name: string; hours: number }>;
  };

  // Validate project belongs to company
  const project = await Project.findOne({ _id: projectId, company: companyId, deleted: false });
  if (!project) throw AppError.notFound('Project not found in this company');

  // Validate client belongs to company
  const client = await Client.findOne({ _id: clientId, company: companyId, deleted: false });
  if (!client) throw AppError.notFound('Client not found in this company');

  const note = await DeliveryNote.create({
    user:    req.user!.id,
    company: companyId,
    client:  clientId,
    project: projectId,
    format, description,
    workDate: new Date(workDate),
    material, quantity, unit,
    hours, workers,
  });

  const io = req.app.get('io') as { to: (r: string) => { emit: (e: string, d: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('deliverynote:new', note);

  res.status(201).json({ deliveryNote: note });
});

// ─── list ────────────────────────────────────────────────────────────────────

export const listDeliveryNotes = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const page  = Math.max(1, Number(req.query['page'])  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 10));
  const skip  = (page - 1) * limit;

  const filter: Record<string, unknown> = { company: companyId, deleted: false };

  if (req.query['project']) filter['project'] = req.query['project'];
  if (req.query['client'])  filter['client']  = req.query['client'];
  if (req.query['format'])  filter['format']  = req.query['format'];
  if (req.query['signed'] !== undefined) {
    filter['signed'] = String(req.query['signed']) === 'true';
  }
  if (req.query['from'] || req.query['to']) {
    const dateRange: Record<string, Date> = {};
    if (req.query['from']) dateRange['$gte'] = new Date(String(req.query['from']));
    if (req.query['to'])   dateRange['$lte'] = new Date(String(req.query['to']));
    filter['workDate'] = dateRange;
  }

  const rawSort = String(req.query['sort'] || '-workDate');
  const desc    = rawSort.startsWith('-');
  const sortKey = rawSort.replace(/^-/, '');

  const [notes, totalItems] = await Promise.all([
    DeliveryNote.find(filter)
      .populate('client',  'name cif')
      .populate('project', 'name projectCode')
      .sort({ [sortKey]: desc ? -1 : 1 })
      .skip(skip).limit(limit),
    DeliveryNote.countDocuments(filter),
  ]);

  res.status(200).json({
    deliveryNotes: notes,
    currentPage: page,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
  });
});

// ─── get one ─────────────────────────────────────────────────────────────────

export const getDeliveryNote = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const note = await DeliveryNote.findOne({
    _id: req.params['id'],
    company: companyId,
    deleted: false,
  }).populate(POPULATE_FULL);

  if (!note) throw AppError.notFound('Delivery note not found');
  res.status(200).json({ deliveryNote: note });
});

// ─── download PDF ─────────────────────────────────────────────────────────────

export const downloadPdf = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const note = await DeliveryNote.findOne({
    _id: req.params['id'],
    company: companyId,
    deleted: false,
  }).populate(POPULATE_FULL);

  if (!note) throw AppError.notFound('Delivery note not found');

  // In production, redirect to stored PDF if available; otherwise generate fresh
  if (note.pdfUrl && config.env !== 'test' && !note.pdfUrl.startsWith('https://mock.cdn')) {
    return res.redirect(302, note.pdfUrl);
  }

  const populated = note.toObject({ virtuals: false }) as unknown as {
    user: { name: string; email?: string };
    company: { name: string; cif?: string };
    client: { name: string; cif?: string; email?: string };
    project: { name: string; projectCode: string };
  } & typeof note;

  const pdfData: PdfNoteData = {
    id:          (note._id as unknown as { toString(): string }).toString(),
    format:      note.format,
    description: note.description,
    workDate:    note.workDate,
    material:    note.material,
    quantity:    note.quantity,
    unit:        note.unit,
    hours:       note.hours,
    workers:     note.workers ? [...note.workers] : undefined,
    signed:      note.signed,
    signedAt:    note.signedAt,
    signatureUrl: note.signatureUrl,
    user:    populated.user,
    company: populated.company,
    client:  populated.client,
    project: populated.project,
  };

  const pdfBuffer = await generateDeliveryNotePdf(pdfData);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="albaran-${note._id}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.send(pdfBuffer);
});

// ─── sign ─────────────────────────────────────────────────────────────────────

export const signDeliveryNote = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  if (!req.file) throw AppError.badRequest('Signature image is required');

  const note = await DeliveryNote.findOne({
    _id: req.params['id'],
    company: companyId,
    deleted: false,
  });
  if (!note) throw AppError.notFound('Delivery note not found');
  if (note.signed) throw AppError.badRequest('Delivery note is already signed');

  // Optimise signature image with Sharp → WebP, max 800 px wide
  const optimised = await sharp(req.file.buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const sigPublicId = `sig-${note._id}-${Date.now()}`;
  const signatureUrl = await uploadBuffer(optimised, sigPublicId, 'signatures', 'image');

  // Mark as signed before generating PDF so the PDF shows the signature
  note.signed       = true;
  note.signedAt     = new Date();
  note.signatureUrl = signatureUrl;
  await note.save();

  // Populate for PDF
  await note.populate(POPULATE_FULL);
  const populated = note.toObject({ virtuals: false }) as unknown as {
    user: { name: string; email?: string };
    company: { name: string; cif?: string };
    client: { name: string; cif?: string; email?: string };
    project: { name: string; projectCode: string };
  } & typeof note;

  const pdfData: PdfNoteData = {
    id:          (note._id as unknown as { toString(): string }).toString(),
    format:      note.format,
    description: note.description,
    workDate:    note.workDate,
    material:    note.material,
    quantity:    note.quantity,
    unit:        note.unit,
    hours:       note.hours,
    workers:     note.workers ? [...note.workers] : undefined,
    signed:      note.signed,
    signedAt:    note.signedAt,
    signatureUrl: note.signatureUrl,
    user:    populated.user,
    company: populated.company,
    client:  populated.client,
    project: populated.project,
  };

  const pdfBuffer = await generateDeliveryNotePdf(pdfData);
  const pdfPublicId = `pdf-${note._id}-${Date.now()}`;
  const pdfUrl = await uploadBuffer(pdfBuffer, pdfPublicId, 'pdfs', 'raw');

  note.pdfUrl = pdfUrl;
  await note.save();

  const io = req.app.get('io') as { to: (r: string) => { emit: (e: string, d: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('deliverynote:signed', note);

  res.status(200).json({ deliveryNote: note });
});

// ─── delete ───────────────────────────────────────────────────────────────────

export const deleteDeliveryNote = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const note = await DeliveryNote.findOne({
    _id: req.params['id'],
    company: companyId,
    deleted: false,
  });
  if (!note) throw AppError.notFound('Delivery note not found');
  if (note.signed) throw AppError.badRequest('Signed delivery notes cannot be deleted');

  note.deleted = true;
  await note.save();

  const io = req.app.get('io') as { to: (r: string) => { emit: (e: string, d: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('deliverynote:deleted', { id: req.params['id'] });

  res.status(200).json({ message: 'Delivery note deleted successfully' });
});
