import { Router } from 'express';
import {
  register,
  validateEmail,
  login,
  updatePersonalData,
  updateCompany,
  uploadLogo,
  getUser,
  refreshToken,
  logout,
  deleteUser,
  inviteUser,
  changePassword,
} from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate';
import { authRateLimit } from '../middleware/rate-limit';
import { diskUpload } from '../middleware/upload';
import {
  registerSchema,
  loginSchema,
  validationCodeSchema,
  updatePersonalSchema,
  companySchema,
  inviteSchema,
  changePasswordSchema,
  refreshSchema,
} from '../validators/user.validator';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Users
 *     description: User authentication and profile management
 */

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/user/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:     { type: string, example: Ana }
 *               email:    { type: string, format: email }
 *               password: { type: string, minLength: 8 }
 *     responses:
 *       201:
 *         description: User created — verification email sent
 *       409:
 *         description: Email already registered
 */
router.post('/register', authRateLimit, validate(registerSchema), register);

/**
 * @openapi
 * /api/user/validation:
 *   put:
 *     summary: Verify email with 6-digit code
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email: { type: string, format: email }
 *               code:  { type: string, example: "123456" }
 *     responses:
 *       200:
 *         description: Account verified — returns JWT tokens
 *       400:
 *         description: Invalid or expired code
 */
router.put('/validation', validate(validationCodeSchema), validateEmail);

/**
 * @openapi
 * /api/user/login:
 *   post:
 *     summary: Login and obtain JWT tokens
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:    { type: string, format: email }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials or account not verified
 */
router.post('/login', authRateLimit, validate(loginSchema), login);

/**
 * @openapi
 * /api/user/refresh:
 *   post:
 *     summary: Obtain a new access token using a refresh token
 *     tags: [Users]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200:
 *         description: New access token
 *       401:
 *         description: Invalid or revoked refresh token
 */
router.post('/refresh', validate(refreshSchema), refreshToken);

// ─── Authenticated ───────────────────────────────────────────────────────────

/**
 * @openapi
 * /api/user/register:
 *   put:
 *     summary: Update personal data
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:    { type: string }
 *               surname: { type: string }
 *               nif:     { type: string }
 *               phone:   { type: string }
 *     responses:
 *       200:
 *         description: User updated
 */
router.put('/register', authenticate, validate(updatePersonalSchema), updatePersonalData);

/**
 * @openapi
 * /api/user/company:
 *   patch:
 *     summary: Create or update company
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, cif]
 *             properties:
 *               name: { type: string }
 *               cif:  { type: string }
 *     responses:
 *       200:
 *         description: Company saved
 */
router.patch('/company', authenticate, validate(companySchema), updateCompany);

/**
 * @openapi
 * /api/user/logo:
 *   patch:
 *     summary: Upload company logo
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Logo uploaded
 */
router.patch('/logo', authenticate, diskUpload.single('logo'), uploadLogo);

/**
 * @openapi
 * /api/user:
 *   get:
 *     summary: Get authenticated user (with company)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: User object
 */
router.get('/', authenticate, getUser);

/**
 * @openapi
 * /api/user:
 *   delete:
 *     summary: Delete or archive user
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: soft
 *         schema: { type: boolean }
 *         description: true = soft-delete (archive), false = hard-delete
 *     responses:
 *       200:
 *         description: User deleted or archived
 */
router.delete('/', authenticate, deleteUser);

/**
 * @openapi
 * /api/user/logout:
 *   post:
 *     summary: Logout (revoke refresh token)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post('/logout', authenticate, logout);

/**
 * @openapi
 * /api/user/invite:
 *   post:
 *     summary: Invite a collaborator to the company
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       201:
 *         description: Invitation sent
 *       409:
 *         description: User already exists
 */
router.post('/invite', authenticate, validate(inviteSchema), inviteUser);

/**
 * @openapi
 * /api/user/password:
 *   patch:
 *     summary: Change password
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string, minLength: 8 }
 *     responses:
 *       200:
 *         description: Password changed
 *       401:
 *         description: Current password incorrect
 */
router.patch('/password', authenticate, validate(changePasswordSchema), changePassword);

export default router;
