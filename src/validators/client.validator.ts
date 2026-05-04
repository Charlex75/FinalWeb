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

export const createClientSchema = z.object({
  body: z.object({
    name:    z.string().min(1, 'Client name is required').trim(),
    cif:     z.string().trim().optional(),
    email:   z.string().email('Invalid email').toLowerCase().trim().optional(),
    phone:   z.string().trim().optional(),
    address: addressSchema,
  }),
});

export const updateClientSchema = z.object({
  body: z.object({
    name:    z.string().min(1, 'Name cannot be empty').trim().optional(),
    cif:     z.string().trim().optional(),
    email:   z.string().email('Invalid email').toLowerCase().trim().optional(),
    phone:   z.string().trim().optional(),
    address: addressSchema,
  }),
});

export const listClientsSchema = z.object({
  query: z.object({
    page:  z.string().optional(),
    limit: z.string().optional(),
    name:  z.string().optional(),
    sort:  z.string().optional(),
  }),
});
