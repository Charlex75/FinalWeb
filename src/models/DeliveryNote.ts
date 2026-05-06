import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface IWorker {
  name: string;
  hours: number;
}

export interface IDeliveryNote {
  user: Types.ObjectId;
  company: Types.ObjectId;
  client: Types.ObjectId;
  project: Types.ObjectId;
  format: 'material' | 'hours';
  description: string;
  workDate: Date;
  // material fields
  material?: string;
  quantity?: number;
  unit?: string;
  // hours fields
  hours?: number;
  workers?: IWorker[];
  // signature & pdf
  signed: boolean;
  signedAt?: Date;
  signatureUrl?: string;
  pdfUrl?: string;
  // soft delete
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type DeliveryNoteDoc = HydratedDocument<IDeliveryNote>;

const workerSchema = new Schema<IWorker>(
  { name: { type: String, required: true }, hours: { type: Number, required: true } },
  { _id: false },
);

const deliveryNoteSchema = new Schema<IDeliveryNote>(
  {
    user:        { type: Schema.Types.ObjectId, ref: 'User',    required: true },
    company:     { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    client:      { type: Schema.Types.ObjectId, ref: 'Client',  required: true },
    project:     { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    format:      { type: String, enum: ['material', 'hours'], required: true },
    description: { type: String, required: true, trim: true },
    workDate:    { type: Date, required: true },
    material:    { type: String, trim: true },
    quantity:    { type: Number },
    unit:        { type: String, trim: true },
    hours:       { type: Number },
    workers:     [workerSchema],
    signed:       { type: Boolean, default: false },
    signedAt:     { type: Date },
    signatureUrl: { type: String },
    pdfUrl:       { type: String },
    deleted:      { type: Boolean, default: false },
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

deliveryNoteSchema.index({ company: 1, deleted: 1 });
deliveryNoteSchema.index({ company: 1, project: 1 });
deliveryNoteSchema.index({ company: 1, client: 1 });
deliveryNoteSchema.index({ company: 1, signed: 1 });
deliveryNoteSchema.index({ workDate: -1 });

export const DeliveryNote: Model<IDeliveryNote> = model<IDeliveryNote>('DeliveryNote', deliveryNoteSchema);
