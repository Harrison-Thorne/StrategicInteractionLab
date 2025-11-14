import express, { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createUser, getUserByEmail } from './db';
import { JwtUserPayload, User } from './types';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
const COOKIE_NAME = process.env.COOKIE_NAME || 'token';
const NODE_ENV = process.env.NODE_ENV || 'development';

export interface AuthedRequest extends Request {
  user?: JwtUserPayload;
}

function signToken(user: User): string {
  const payload: JwtUserPayload = { uid: user.id, email: user.email };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production' ? true : false,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const token = (req as any).cookies?.[COOKIE_NAME];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
    if (!decoded || !decoded.uid || !decoded.email) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// POST /api/auth/register { email, password }
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await getUserByEmail(normalizedEmail);
    if (existing) {
      return res.status(409).json({ error: 'email already registered' });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    const user = await createUser(normalizedEmail, passwordHash);
    const token = signToken(user);
    setAuthCookie(res, token);
    return res.json({ id: user.id, email: user.email, created_at: user.created_at });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/auth/login { email, password }
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await getUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    const token = signToken(user);
    setAuthCookie(res, token);
    return res.json({ id: user.id, email: user.email, created_at: user.created_at });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: NODE_ENV === 'production' ? true : false,
    path: '/',
  });
  return res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const email = req.user!.email;
    const user = await getUserByEmail(email);
    if (!user) return res.status(404).json({ error: 'not_found' });
    return res.json({ id: user.id, email: user.email, created_at: user.created_at });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

export { router as authRouter };
