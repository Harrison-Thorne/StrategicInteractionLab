import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { ensureMigrations, getUserByEmail, createUser } from './db';
import { authRouter, requireAuth } from './auth';
import { arenaRouter } from './arena/routes';
import { evalRouter } from './eval/routes';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as arenaStore from './arena/store';
import { notesRouter } from './notes';

dotenv.config();

const PORT = parseInt(process.env.PORT || '4000', 10);

async function runSeed() {
  await ensureMigrations();
  const email = 'test@example.com';
  const existing = await getUserByEmail(email);
  if (!existing) {
    const passwordHash = await bcrypt.hash('123456', 10);
    await createUser(email, passwordHash);
    console.log('Seeded user:', email);
  } else {
    console.log('Seed user already exists:', email);
  }
}

async function start() {
  await ensureMigrations();

  const app = express();

  app.use(
    cors({
      origin: 'http://localhost:5173',
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.use('/api/auth', authRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/arena', arenaRouter);
  app.use('/api/eval', evalRouter);

  app.get('/api/hello', requireAuth, (req: any, res) => {
    const email = req.user?.email || 'user';
    res.json({ message: `Hello, ${email}` });
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: 'http://localhost:5173', credentials: true },
  });

  const nsp = io.of('/arena');
  nsp.on('connection', (socket) => {
    const run_id = String(socket.handshake.query?.run_id || '');
    if (run_id) socket.join(run_id);
    const runner = arenaStore.get(run_id);
    let unsubscribe: (() => void) | null = null;
    if (runner) {
      unsubscribe = runner.onTick((payload) => {
        nsp.to(run_id).emit('tick', payload);
      });
    }
    socket.on('disconnect', () => {
      if (unsubscribe) unsubscribe();
    });
  });

  httpServer.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

if (process.argv.includes('--seed')) {
  runSeed().then(() => process.exit(0));
} else {
  start();
}
