import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import config from '../config/index';

async function notifySlack(req: Request, err: Error): Promise<void> {
  // TODO(human): configure Slack Incoming Webhook URL in .env (SLACK_WEBHOOK_URL)
  if (!config.slack.webhookUrl) return;
  try {
    await fetch(config.slack.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: [
          '*5XX Error*',
          `*Time:* ${new Date().toISOString()}`,
          `*Route:* ${req.method} ${req.originalUrl}`,
          `*Message:* ${err.message}`,
          `*Stack:*\n\`\`\`${err.stack ?? 'N/A'}\`\`\``,
        ].join('\n'),
      }),
    });
  } catch {
    // swallow Slack errors so they never mask the original error response
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ status: 'error', message: err.message });
    return;
  }

  console.error('Unhandled error:', err);
  void notifySlack(req, err);

  res.status(500).json({
    status: 'error',
    message: config.env === 'production' ? 'Internal server error' : err.message,
  });
}
