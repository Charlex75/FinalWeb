import crypto from 'crypto';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { Company } from '../models/Company';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { notificationService } from '../services/notification.service';
import { mailService } from '../services/mail.service';
import config from '../config/index';
import type { JwtPayload } from '../middleware/auth.middleware';

// ─── helpers ────────────────────────────────────────────────────────────────

function generateAccessToken(id: string, role: string, company?: string): string {
  return jwt.sign(
    { id, role, company } satisfies JwtPayload,
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn } as jwt.SignOptions,
  );
}

function generateRefreshToken(id: string): string {
  return jwt.sign({ id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  } as jwt.SignOptions);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateTempPassword(): string {
  return crypto.randomBytes(8).toString('hex'); // 16 hex chars
}

// ─── register ───────────────────────────────────────────────────────────────

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body as {
    name: string; email: string; password: string;
  };

  const existing = await User.findOne({ email });
  if (existing) throw AppError.conflict('Email already registered');

  const code = generateVerificationCode();
  const user = await User.create({
    name,
    email,
    password,
    verificationCode: code,
    verificationCodeExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  mailService.sendVerificationEmail(email, name, code).catch(console.error);
  notificationService.emit('user:registered', user);

  const token        = generateAccessToken(user._id.toString(), user.role);
  const refreshToken = generateRefreshToken(user._id.toString());
  user.refreshToken  = hashToken(refreshToken);
  await user.save();

  res.status(201).json({ token, refreshToken, user });
});

// ─── validate email ──────────────────────────────────────────────────────────

export const validateEmail = asyncHandler(async (req: Request, res: Response) => {
  const { email, code } = req.body as { email: string; code: string };

  const user = await User
    .findOne({ email })
    .select('+verificationCode +verificationCodeExpires');

  if (!user) throw AppError.notFound('User not found');
  if (user.status === 'active') throw AppError.badRequest('Account already verified');

  if (
    user.verificationCode !== code ||
    !user.verificationCodeExpires ||
    user.verificationCodeExpires < new Date()
  ) {
    throw AppError.badRequest('Invalid or expired verification code');
  }

  user.status                  = 'active';
  user.verificationCode        = undefined;
  user.verificationCodeExpires = undefined;
  await user.save();

  notificationService.emit('user:verified', user);

  const token        = generateAccessToken(user._id.toString(), user.role, user.company?.toString());
  const refreshToken = generateRefreshToken(user._id.toString());
  user.refreshToken  = hashToken(refreshToken);
  await user.save();

  res.status(200).json({ token, refreshToken, user });
});

// ─── login ───────────────────────────────────────────────────────────────────

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as { email: string; password: string };

  const user = await User.findOne({ email }).select('+password +refreshToken');
  if (!user) throw AppError.unauthorized('Invalid credentials');
  if (user.status === 'deleted') throw AppError.unauthorized('Account has been deleted');
  if (user.status === 'pending') throw AppError.unauthorized('Account not verified — check your email');

  const valid = await user.comparePassword(password);
  if (!valid) throw AppError.unauthorized('Invalid credentials');

  const token        = generateAccessToken(user._id.toString(), user.role, user.company?.toString());
  const refreshToken = generateRefreshToken(user._id.toString());
  user.refreshToken  = hashToken(refreshToken);
  await user.save();

  res.status(200).json({ token, refreshToken, user });
});

// ─── update personal data ────────────────────────────────────────────────────

export const updatePersonalData = asyncHandler(async (req: Request, res: Response) => {
  const { name, surname, nif, phone, address } = req.body as {
    name?: string; surname?: string; nif?: string; phone?: string;
    address?: object;
  };

  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { $set: { name, surname, nif, phone, address } },
    { new: true, runValidators: true },
  );
  if (!user) throw AppError.notFound('User not found');

  res.status(200).json({ user });
});

// ─── update company ──────────────────────────────────────────────────────────

export const updateCompany = asyncHandler(async (req: Request, res: Response) => {
  const { name, cif, address } = req.body as {
    name: string; cif: string; address?: object;
  };

  let company = await Company.findOne({ owner: req.user!.id });

  if (company) {
    company.name    = name;
    company.cif     = cif;
    if (address) company.address = address as typeof company.address;
    await company.save();
  } else {
    company = await Company.create({ owner: req.user!.id, name, cif, address });
    await User.findByIdAndUpdate(req.user!.id, { company: company._id });
  }

  res.status(200).json({ company });
});

// ─── upload logo ─────────────────────────────────────────────────────────────

export const uploadLogo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('No file uploaded');

  const company = await Company.findOne({ owner: req.user!.id });
  if (!company) throw AppError.notFound('Company not found — complete onboarding first');

  // TODO(human): replace local path with cloud URL after configuring storage service
  company.logo = req.file.path.replace(/\\/g, '/');
  await company.save();

  res.status(200).json({ company });
});

// ─── get authenticated user ──────────────────────────────────────────────────

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id).populate('company');
  if (!user) throw AppError.notFound('User not found');

  res.status(200).json({ user });
});

// ─── refresh token ───────────────────────────────────────────────────────────

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: received } = req.body as { refreshToken: string };

  let payload: { id: string };
  try {
    payload = jwt.verify(received, config.jwt.refreshSecret) as { id: string };
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.id).select('+refreshToken');
  if (!user || user.refreshToken !== hashToken(received)) {
    throw AppError.unauthorized('Refresh token revoked');
  }

  const token = generateAccessToken(user._id.toString(), user.role, user.company?.toString());
  res.status(200).json({ token });
});

// ─── logout ───────────────────────────────────────────────────────────────────

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await User.findByIdAndUpdate(req.user!.id, { $unset: { refreshToken: 1 } });
  res.status(200).json({ message: 'Logged out successfully' });
});

// ─── delete user ─────────────────────────────────────────────────────────────

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const soft = req.query['soft'] === 'true';

  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.notFound('User not found');

  if (soft) {
    user.status    = 'deleted';
    user.deletedAt = new Date();
    await user.save();
  } else {
    await user.deleteOne();
  }

  notificationService.emit('user:deleted', user);
  res.status(200).json({ message: `User ${soft ? 'archived' : 'deleted'} successfully` });
});

// ─── invite user ─────────────────────────────────────────────────────────────

export const inviteUser = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as { email: string };

  const inviter = await User.findById(req.user!.id);
  if (!inviter) throw AppError.notFound('Inviter not found');
  if (!inviter.company) throw AppError.badRequest('Complete company onboarding before inviting users');

  const existing = await User.findOne({ email });
  if (existing) throw AppError.conflict('A user with that email already exists');

  const tempPassword = generateTempPassword();
  const invitee = await User.create({
    name:        email.split('@')[0],
    email,
    password:    tempPassword,
    role:        'guest',
    status:      'active',
    company:     inviter.company,
    invitedBy:   inviter._id,
  });

  mailService.sendInviteEmail(email, inviter.name, tempPassword).catch(console.error);
  notificationService.emit('user:invited', inviter, invitee);

  res.status(201).json({ user: invitee, message: 'Invitation sent' });
});

// ─── change password ──────────────────────────────────────────────────────────

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword: string; newPassword: string;
  };

  const user = await User.findById(req.user!.id).select('+password');
  if (!user) throw AppError.notFound('User not found');

  const valid = await user.comparePassword(currentPassword);
  if (!valid) throw AppError.unauthorized('Current password is incorrect');

  user.password     = newPassword;
  user.refreshToken = undefined; // force re-login on all devices
  await user.save();

  res.status(200).json({ message: 'Password changed successfully' });
});
