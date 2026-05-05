import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { DeliveryNote } from '../models/DeliveryNote';
import { Client } from '../models/Client';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).select('company');
  if (!user?.company) throw AppError.badRequest('Complete company onboarding first');

  const companyId = new mongoose.Types.ObjectId(user.company.toString());

  // Run all aggregations in parallel
  const [summary, notesByMonth, hoursByProject, formatBreakdown, materialsByClient] =
    await Promise.all([

      // ── Summary counts ──────────────────────────────────────────────────────
      Promise.all([
        Client.countDocuments({ company: companyId, deleted: false }),
        Project.countDocuments({ company: companyId, deleted: false }),
        DeliveryNote.countDocuments({ company: companyId, deleted: false }),
        DeliveryNote.countDocuments({ company: companyId, deleted: false, signed: true }),
      ]).then(([clients, projects, notes, signedNotes]) => ({
        clients, projects, notes, signedNotes,
      })),

      // ── Delivery notes per month (last 12 months) ───────────────────────────
      DeliveryNote.aggregate([
        {
          $match: {
            company: companyId,
            deleted: false,
            workDate: { $gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) },
          },
        },
        {
          $group: {
            _id:        { year: { $year: '$workDate' }, month: { $month: '$workDate' } },
            total:      { $sum: 1 },
            signed:     { $sum: { $cond: ['$signed', 1, 0] } },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
        {
          $project: {
            _id:   0,
            year:  '$_id.year',
            month: '$_id.month',
            total: 1,
            signed: 1,
          },
        },
      ]),

      // ── Total hours by project (top 10) ─────────────────────────────────────
      DeliveryNote.aggregate([
        {
          $match: {
            company: companyId,
            deleted: false,
            format:  'hours',
          },
        },
        {
          $group: {
            _id:        '$project',
            totalHours: { $sum: '$hours' },
            noteCount:  { $sum: 1 },
          },
        },
        { $sort: { totalHours: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from:         'projects',
            localField:   '_id',
            foreignField: '_id',
            as:           'project',
          },
        },
        { $unwind: '$project' },
        {
          $project: {
            _id:         0,
            totalHours:  1,
            noteCount:   1,
            projectName: '$project.name',
            projectCode: '$project.projectCode',
          },
        },
      ]),

      // ── Notes by format ──────────────────────────────────────────────────────
      DeliveryNote.aggregate([
        { $match: { company: companyId, deleted: false } },
        { $group: { _id: '$format', count: { $sum: 1 } } },
        { $project: { _id: 0, format: '$_id', count: 1 } },
      ]),

      // ── Material notes per client (top 10) ──────────────────────────────────
      DeliveryNote.aggregate([
        {
          $match: {
            company: companyId,
            deleted: false,
            format:  'material',
          },
        },
        {
          $group: {
            _id:       '$client',
            noteCount: { $sum: 1 },
            totalQty:  { $sum: '$quantity' },
          },
        },
        { $sort: { noteCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from:         'clients',
            localField:   '_id',
            foreignField: '_id',
            as:           'client',
          },
        },
        { $unwind: '$client' },
        {
          $project: {
            _id:         0,
            noteCount:   1,
            totalQty:    1,
            clientName:  '$client.name',
            clientCif:   '$client.cif',
          },
        },
      ]),
    ]);

  res.status(200).json({
    summary,
    notesByMonth,
    hoursByProject,
    formatBreakdown,
    materialsByClient,
  });
});
