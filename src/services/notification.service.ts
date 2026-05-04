import { EventEmitter } from 'events';
import type { UserDoc } from '../models/User';

interface NotificationEvents {
  'user:registered': (user: UserDoc) => void;
  'user:verified':   (user: UserDoc) => void;
  'user:invited':    (inviter: UserDoc, invitee: UserDoc) => void;
  'user:deleted':    (user: UserDoc) => void;
}

// Augment EventEmitter with typed overloads using declaration merging
declare interface NotificationService {
  emit<K extends keyof NotificationEvents>(event: K, ...args: Parameters<NotificationEvents[K]>): boolean;
  on<K extends keyof NotificationEvents>(event: K, listener: NotificationEvents[K]): this;
  once<K extends keyof NotificationEvents>(event: K, listener: NotificationEvents[K]): this;
  off<K extends keyof NotificationEvents>(event: K, listener: NotificationEvents[K]): this;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class NotificationService extends EventEmitter {}

export const notificationService = new NotificationService();
