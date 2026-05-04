import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { AnyZodObject, ZodEffects } from 'zod';
import { AppError } from '../utils/AppError';

type ZodSchema = AnyZodObject | ZodEffects<AnyZodObject>;

export function validate(schema: ZodSchema) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const message = err.errors
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ');
        next(AppError.badRequest(message));
        return;
      }
      next(err);
    }
  };
}
