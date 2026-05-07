import type { Request, Response } from 'express';
import { Client } from '../models/Client';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

// ─── helpers ────────────────────────────────────────────────────────────────

async function requireCompany(userId: string) {
  const user = await User.findById(userId).select('company');
  if (!user?.company) throw AppError.badRequest('Complete company onboarding first');
  return user.company;
}

// ─── create ──────────────────────────────────────────────────────────────────

export const createClient = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);
  const { name, cif, email, phone, address } = req.body as {
    name: string; cif?: string; email?: string; phone?: string; address?: object;
  };

  if (cif) {
    const duplicate = await Client.findOne({ company: companyId, cif });
    if (duplicate) throw AppError.conflict('A client with that CIF already exists in this company');
  }

  const client = await Client.create({
    user: req.user!.id,
    company: companyId,
    name, cif, email, phone, address,
  });

  const io = req.app.get('io') as { to: (room: string) => { emit: (ev: string, data: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('client:new', client);

  res.status(201).json({ client });
});

// ─── list (active) ───────────────────────────────────────────────────────────

export const listClients = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const page  = Math.max(1, Number(req.query['page'])  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 10));
  const skip  = (page - 1) * limit;

  const filter: Record<string, unknown> = { company: companyId, deleted: false };

  if (req.query['name']) {
    filter['name'] = { $regex: String(req.query['name']), $options: 'i' };
  }

  const rawSort  = String(req.query['sort'] || 'createdAt');
  const desc     = rawSort.startsWith('-');
  const sortKey  = rawSort.replace(/^-/, '');
  const sortDir  = desc ? -1 : 1;

  const [clients, totalItems] = await Promise.all([
    Client.find(filter).sort({ [sortKey]: sortDir }).skip(skip).limit(limit),
    Client.countDocuments(filter),
  ]);

  res.status(200).json({
    clients,
    currentPage: page,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
  });
});

// ─── list archived ───────────────────────────────────────────────────────────

export const listArchivedClients = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const page  = Math.max(1, Number(req.query['page'])  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 10));
  const skip  = (page - 1) * limit;

  const filter = { company: companyId, deleted: true };

  const [clients, totalItems] = await Promise.all([
    Client.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    Client.countDocuments(filter),
  ]);

  res.status(200).json({
    clients,
    currentPage: page,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
  });
});

// ─── get one ─────────────────────────────────────────────────────────────────

export const getClient = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const client = await Client.findOne({
    _id: req.params['id'],
    company: companyId,
    deleted: false,
  });
  if (!client) throw AppError.notFound('Client not found');

  res.status(200).json({ client });
});

// ─── update ──────────────────────────────────────────────────────────────────

export const updateClient = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);
  const { name, cif, email, phone, address } = req.body as {
    name?: string; cif?: string; email?: string; phone?: string; address?: object;
  };

  if (cif) {
    const duplicate = await Client.findOne({
      company: companyId,
      cif,
      _id: { $ne: req.params['id'] },
    });
    if (duplicate) throw AppError.conflict('A client with that CIF already exists in this company');
  }

  const client = await Client.findOneAndUpdate(
    { _id: req.params['id'], company: companyId, deleted: false },
    { $set: { name, cif, email, phone, address } },
    { new: true, runValidators: true },
  );
  if (!client) throw AppError.notFound('Client not found');

  const io = req.app.get('io') as { to: (room: string) => { emit: (ev: string, data: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('client:updated', client);

  res.status(200).json({ client });
});

// ─── delete (soft or hard) ───────────────────────────────────────────────────

export const deleteClient = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);
  const soft = req.query['soft'] === 'true';

  const client = await Client.findOne({
    _id: req.params['id'],
    company: companyId,
    deleted: false,
  });
  if (!client) throw AppError.notFound('Client not found');

  if (soft) {
    client.deleted = true;
    await client.save();
  } else {
    await client.deleteOne();
  }

  const io = req.app.get('io') as { to: (room: string) => { emit: (ev: string, data: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('client:deleted', { id: req.params['id'], soft });

  res.status(200).json({ message: `Client ${soft ? 'archived' : 'deleted'} successfully` });
});

// ─── restore ─────────────────────────────────────────────────────────────────

export const restoreClient = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const client = await Client.findOneAndUpdate(
    { _id: req.params['id'], company: companyId, deleted: true },
    { deleted: false },
    { new: true },
  );
  if (!client) throw AppError.notFound('Archived client not found');

  const io = req.app.get('io') as { to: (room: string) => { emit: (ev: string, data: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('client:restored', client);

  res.status(200).json({ client });
});
