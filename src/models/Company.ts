import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface IAddress {
  street?: string;
  number?: string;
  postal?: string;
  city?: string;
  province?: string;
}

export interface ICompany {
  owner: Types.ObjectId;
  name: string;
  cif: string;
  address?: IAddress;
  logo?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CompanyDoc = HydratedDocument<ICompany>;

const companySchema = new Schema<ICompany>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    cif: { type: String, required: true, trim: true, uppercase: true },
    address: {
      street: String,
      number: String,
      postal: String,
      city: String,
      province: String,
    },
    logo: { type: String },
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

companySchema.index({ owner: 1 });
companySchema.index({ cif: 1 }, { unique: true });

export const Company: Model<ICompany> = model<ICompany>('Company', companySchema);
