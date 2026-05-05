import type { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/index';
import type { JwtPayload } from './auth.middleware';

/**
 * Wires up Socket.IO JWT authentication and company rooms.
 *
 * Clients must pass the JWT in the handshake:
 *   socket = io(url, { auth: { token: '<jwt>' } })
 * or as a query param:
 *   socket = io(url, { query: { token: '<jwt>' } })
 *
 * Once authenticated, the socket automatically joins a room named after
 * the user's company ObjectId so that company-scoped events reach only
 * the right users.
 */
export function registerSocketMiddleware(io: Server): void {
  // ── Authentication ─────────────────────────────────────────────────────────
  io.use((socket: Socket, next) => {
    const token =
      (socket.handshake.auth['token'] as string | undefined) ??
      (socket.handshake.query['token'] as string | undefined) ??
      (socket.handshake.headers['authorization'] as string | undefined)
        ?.replace(/^Bearer\s+/i, '');

    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    try {
      const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
      socket.data['user'] = payload;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on('connection', (socket: Socket) => {
    const user = socket.data['user'] as JwtPayload | undefined;

    if (user?.company) {
      // Join the company room so broadcasts are scoped per company
      void socket.join(user.company);
      socket.emit('room:joined', { company: user.company });
    }

    socket.on('disconnect', () => {
      // cleanup handled automatically by Socket.IO
    });
  });
}
