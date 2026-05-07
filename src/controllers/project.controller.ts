import type { Request, Response } from 'express';
import { Project } from '../models/Project';
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

export const createProject = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);
  const { name, projectCode, client: clientId, address, email, notes, active } = req.body as {
    name: string; projectCode: string; client: string;
    address?: object; email?: string; notes?: string; active?: boolean;
  };

  // Validate client belongs to same company
  const client = await Client.findOne({ _id: clientId, company: companyId, deleted: false });
  if (!client) throw AppError.notFound('Client not found in this company');

  // Enforce unique projectCode within company
  const duplicate = await Project.findOne({ company: companyId, projectCode });
  if (duplicate) throw AppError.conflict('A project with that code already exists in this company');

  const project = await Project.create({
    user: req.user!.id,
    company: companyId,
    client: clientId,
    name, projectCode, address, email, notes,
    active: active ?? true,
  });

  const io = req.app.get('io') as { to: (r: string) => { emit: (e: string, d: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('project:new', project);

  res.status(201).json({ project });
});

// ─── list (active) ───────────────────────────────────────────────────────────

export const listProjects = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const page  = Math.max(1, Number(req.query['page'])  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 10));
  const skip  = (page - 1) * limit;

  const filter: Record<string, unknown> = { company: companyId, deleted: false };

  if (req.query['client']) filter['client'] = req.query['client'];
  if (req.query['name'])   filter['name']   = { $regex: String(req.query['name']), $options: 'i' };
  if (req.query['active'] !== undefined) {
    filter['active'] = String(req.query['active']) === 'true';
  }

  const rawSort = String(req.query['sort'] || 'createdAt');
  const desc    = rawSort.startsWith('-');
  const sortKey = rawSort.replace(/^-/, '');
  const sortDir = desc ? -1 : 1;

  const [projects, totalItems] = await Promise.all([
    Project.find(filter)
      .populate('client', 'name cif email')
      .sort({ [sortKey]: sortDir })
      .skip(skip)
      .limit(limit),
    Project.countDocuments(filter),
  ]);

  res.status(200).json({
    projects,
    currentPage: page,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
  });
});

// ─── list archived ───────────────────────────────────────────────────────────

export const listArchivedProjects = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const page  = Math.max(1, Number(req.query['page'])  || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query['limit']) || 10));
  const skip  = (page - 1) * limit;

  const filter = { company: companyId, deleted: true };

  const [projects, totalItems] = await Promise.all([
    Project.find(filter)
      .populate('client', 'name cif email')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit),
    Project.countDocuments(filter),
  ]);

  res.status(200).json({
    projects,
    currentPage: page,
    totalPages: Math.ceil(totalItems / limit),
    totalItems,
  });
});

// ─── get one ─────────────────────────────────────────────────────────────────

export const getProject = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const project = await Project.findOne({
    _id: req.params['id'],
    company: companyId,
    deleted: false,
  }).populate('client', 'name cif email phone');

  if (!project) throw AppError.notFound('Project not found');

  res.status(200).json({ project });
});

// ─── update ──────────────────────────────────────────────────────────────────

export const updateProject = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);
  const { name, projectCode, client: clientId, address, email, notes, active } = req.body as {
    name?: string; projectCode?: string; client?: string;
    address?: object; email?: string; notes?: string; active?: boolean;
  };

  // If changing client, ensure new client belongs to same company
  if (clientId) {
    const client = await Client.findOne({ _id: clientId, company: companyId, deleted: false });
    if (!client) throw AppError.notFound('Client not found in this company');
  }

  // If changing projectCode, ensure uniqueness within company
  if (projectCode) {
    const duplicate = await Project.findOne({
      company: companyId,
      projectCode,
      _id: { $ne: req.params['id'] },
    });
    if (duplicate) throw AppError.conflict('A project with that code already exists in this company');
  }

  const project = await Project.findOneAndUpdate(
    { _id: req.params['id'], company: companyId, deleted: false },
    { $set: { name, projectCode, client: clientId, address, email, notes, active } },
    { new: true, runValidators: true },
  ).populate('client', 'name cif email');

  if (!project) throw AppError.notFound('Project not found');

  const io = req.app.get('io') as { to: (r: string) => { emit: (e: string, d: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('project:updated', project);

  res.status(200).json({ project });
});

// ─── delete (soft or hard) ───────────────────────────────────────────────────

export const deleteProject = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);
  const soft = req.query['soft'] === 'true';

  const project = await Project.findOne({
    _id: req.params['id'],
    company: companyId,
    deleted: false,
  });
  if (!project) throw AppError.notFound('Project not found');

  if (soft) {
    project.deleted = true;
    await project.save();
  } else {
    await project.deleteOne();
  }

  const io = req.app.get('io') as { to: (r: string) => { emit: (e: string, d: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('project:deleted', { id: req.params['id'], soft });

  res.status(200).json({ message: `Project ${soft ? 'archived' : 'deleted'} successfully` });
});

// ─── restore ─────────────────────────────────────────────────────────────────

export const restoreProject = asyncHandler(async (req: Request, res: Response) => {
  const companyId = await requireCompany(req.user!.id);

  const project = await Project.findOneAndUpdate(
    { _id: req.params['id'], company: companyId, deleted: true },
    { deleted: false },
    { new: true },
  ).populate('client', 'name cif email');

  if (!project) throw AppError.notFound('Archived project not found');

  const io = req.app.get('io') as { to: (r: string) => { emit: (e: string, d: unknown) => void } } | undefined;
  io?.to(companyId.toString()).emit('project:restored', project);

  res.status(200).json({ project });
});
