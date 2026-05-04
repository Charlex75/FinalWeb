import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import type { IAddress } from './Company';

export interface IProject {
  user: Types.ObjectId;
  company: Types.ObjectId;
  client: Types.ObjectId;
  name: string;
  projectCode: string;
  address?: IAddress;
  email?: string;
  notes?: string;
  active: boolean;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectDoc = HydratedDocument<IProject>;

const projectSchema = new Schema<IProject>(
  {
    user:        { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    company:     { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    client:      { type: Schema.Types.ObjectId, ref: 'Client',  required: true },
    name:        { type: String, required: true, trim: true },
    projectCode: { type: String, required: true, trim: true },
    address: {
      street:   String,
      number:   String,
      postal:   String,
      city:     String,
      province: String,
    },
    email:   { type: String, trim: true, lowercase: true },
    notes:   { type: String, trim: true },
    active:  { type: Boolean, default: true },
    deleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

projectSchema.index({ company: 1, deleted: 1 });
projectSchema.index({ company: 1, client: 1 });
projectSchema.index({ company: 1, projectCode: 1 }, { unique: true });

export const Project: Model<IProject> = model<IProject>('Project', projectSchema);
