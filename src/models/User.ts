import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';
import type { IAddress } from './Company';

export interface IUser {
  name: string;
  surname?: string;
  nif?: string;
  phone?: string;
  address?: IAddress;
  email: string;
  password: string;       // select: false — use .select('+password') when needed
  role: 'user' | 'admin' | 'guest';
  status: 'pending' | 'active' | 'deleted';
  verificationCode?: string;          // select: false
  verificationCodeExpires?: Date;     // select: false
  company?: Types.ObjectId;
  refreshToken?: string;              // select: false — stored as SHA-256 hash
  deletedAt?: Date;
  invitedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserMethods {
  comparePassword(candidate: string): Promise<boolean>;
}

export type UserModel = Model<IUser, Record<string, never>, IUserMethods>;
export type UserDoc = HydratedDocument<IUser, IUserMethods>;

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    name:    { type: String, required: true, trim: true },
    surname: { type: String, trim: true },
    nif:     { type: String, trim: true },
    phone:   { type: String, trim: true },
    address: {
      street:   String,
      number:   String,
      postal:   String,
      city:     String,
      province: String,
    },
    email: {
      type:      String,
      required:  true,
      unique:    true,
      lowercase: true,
      trim:      true,
    },
    password:               { type: String, required: true, select: false },
    role:                   { type: String, enum: ['user', 'admin', 'guest'], default: 'user' },
    status:                 { type: String, enum: ['pending', 'active', 'deleted'], default: 'pending' },
    verificationCode:       { type: String, select: false },
    verificationCodeExpires:{ type: Date,   select: false },
    company:                { type: Schema.Types.ObjectId, ref: 'Company' },
    refreshToken:           { type: String, select: false },
    deletedAt:              { type: Date },
    invitedBy:              { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.password;
        delete ret.refreshToken;
        delete ret.verificationCode;
        delete ret.verificationCodeExpires;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

userSchema.virtual('fullName').get(function () {
  return this.surname ? `${this.name} ${this.surname}` : this.name;
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = async function (
  this: UserDoc,
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

// email index is already created by unique:true in the field definition
userSchema.index({ company: 1 });
userSchema.index({ status: 1 });

export const User: UserModel = model<IUser, UserModel>('User', userSchema);
