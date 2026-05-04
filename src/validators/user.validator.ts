import { z } from 'zod';

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

const addressSchema = z
  .object({
    street:   z.string().optional(),
    number:   z.string().optional(),
    postal:   z.string().optional(),
    city:     z.string().optional(),
    province: z.string().optional(),
  })
  .optional();

export const registerSchema = z.object({
  body: z.object({
    name:     z.string().min(1, 'Name is required').trim(),
    email:    z.string().email('Invalid email').toLowerCase().trim(),
    password: passwordSchema,
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email:    z.string().email('Invalid email').toLowerCase().trim(),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const validationCodeSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email').toLowerCase().trim(),
    code:  z.string().length(6, 'Code must be exactly 6 digits'),
  }),
});

export const updatePersonalSchema = z.object({
  body: z.object({
    name:    z.string().min(1).trim().optional(),
    surname: z.string().trim().optional(),
    nif:     z.string().trim().optional(),
    phone:   z.string().trim().optional(),
    address: addressSchema,
  }),
});

export const companySchema = z.object({
  body: z.object({
    name:    z.string().min(1, 'Company name is required').trim(),
    cif:     z.string().min(1, 'CIF is required').trim().toUpperCase(),
    address: addressSchema,
  }),
});

export const inviteSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email').toLowerCase().trim(),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword:     passwordSchema,
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});
