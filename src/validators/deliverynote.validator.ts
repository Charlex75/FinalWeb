import { z } from 'zod';

const workerSchema = z.object({
  name:  z.string().min(1, 'Worker name is required'),
  hours: z.number().positive('Hours must be positive'),
});

export const createDeliveryNoteSchema = z.object({
  body: z
    .object({
      project:     z.string().min(1, 'Project ID is required'),
      client:      z.string().min(1, 'Client ID is required'),
      format:      z.enum(['material', 'hours'], { required_error: 'Format is required' }),
      description: z.string().min(1, 'Description is required').trim(),
      workDate:    z.string().min(1, 'Work date is required'),
      // material fields
      material: z.string().trim().optional(),
      quantity: z.number().positive().optional(),
      unit:     z.string().trim().optional(),
      // hours fields
      hours:   z.number().positive().optional(),
      workers: z.array(workerSchema).optional(),
    })
    .superRefine((data, ctx) => {
      if (data.format === 'material' && !data.material) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['material'], message: 'Material is required for material format' });
      }
      if (data.format === 'hours' && data.hours === undefined && (!data.workers || data.workers.length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hours'], message: 'Hours or workers are required for hours format' });
      }
    }),
});
