import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export function authorize(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden());
      return;
    }
    next();
  };
}
