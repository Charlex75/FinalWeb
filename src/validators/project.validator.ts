import { z } from 'zod';

const addressSchema = z
  .object({
    street:   z.string().optional(),
    number:   z.string().optional(),
    postal:   z.string().optional(),
    city:     z.string().optional(),
    province: z.string().optional(),
  })
  .optional();

export const createProjectSchema = z.object({
  body: z.object({
    name:        z.string().min(1, 'Project name is required').trim(),
    projectCode: z.string().min(1, 'Project code is required').trim(),
    client:      z.string().min(1, 'Client ID is required'),
    address:     addressSchema,
    email:       z.string().email('Invalid email').toLowerCase().trim().optional(),
    notes:       z.string().trim().optional(),
    active:      z.boolean().optional(),
  }),
});

export const updateProjectSchema = z.object({
  body: z.object({
    name:        z.string().min(1, 'Name cannot be empty').trim().optional(),
    projectCode: z.string().min(1, 'Project code cannot be empty').trim().optional(),
    client:      z.string().optional(),
    address:     addressSchema,
    email:       z.string().email('Invalid email').toLowerCase().trim().optional(),
    notes:       z.string().trim().optional(),
    active:      z.boolean().optional(),
  }),
});
