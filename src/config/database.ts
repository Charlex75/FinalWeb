import mongoose from 'mongoose';
import config from './index.js';

export async function connectDatabase(): Promise<void> {
  // TODO(human): add MongoDB URI to .env — see MONGODB_URI in .env.example
  await mongoose.connect(config.mongodb.uri);
  console.log('MongoDB connected:', config.mongodb.uri);
}

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (err: Error) => {
  console.error('MongoDB error:', err.message);
});
