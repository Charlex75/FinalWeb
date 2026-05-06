import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import type { IAddress } from './Company';

export interface IClient {
  user: Types.ObjectId;
  company: Types.ObjectId;
  name: string;
  cif?: string;
  email?: string;
  phone?: string;
  address?: IAddress;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ClientDoc = HydratedDocument<IClient>;

const clientSchema = new Schema<IClient>(
  {
    user:    { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    name:    { type: String, required: true, trim: true },
    cif:     { type: String, trim: true },
    email:   { type: String, trim: true, lowercase: true },
    phone:   { type: String, trim: true },
    address: {
      street:   String,
      number:   String,
      postal:   String,
      city:     String,
      province: String,
    },
    deleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

clientSchema.index({ company: 1, deleted: 1 });
clientSchema.index({ company: 1, name: 1 });

export const Client: Model<IClient> = model<IClient>('Client', clientSchema);
