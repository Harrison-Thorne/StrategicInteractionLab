// Using CommonJS require to avoid missing type declarations for sqlite3
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite3 = require('sqlite3');
import { User } from './types';

const DB_PATH = './database.sqlite';
const Database = sqlite3.Database as any;
const db: any = new Database(DB_PATH);
export { db };

export function ensureMigrations(): Promise<void> {
  const sql = `
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT,
      created_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS eval_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game TEXT NOT NULL,
      algA TEXT NOT NULL,
      algB TEXT NOT NULL,
      seeds TEXT NOT NULL,
      episodes INTEGER NOT NULL,
      stepsPerEp INTEGER NOT NULL,
      lr REAL,
      created_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS eval_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      ep INTEGER NOT NULL,
      winA REAL,
      avgRewardA REAL,
      coopRate REAL,
      l2Dist REAL,
      created_at TEXT,
      FOREIGN KEY(run_id) REFERENCES eval_runs(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS eval_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      winA_mean REAL,
      winA_std REAL,
      avgRewardA_mean REAL,
      avgRewardA_std REAL,
      coopRate_mean REAL,
      coopRate_std REAL,
      l2Dist_mean REAL,
      l2Dist_std REAL,
      created_at TEXT,
      FOREIGN KEY(run_id) REFERENCES eval_runs(id) ON DELETE CASCADE
    );
    
  `;
  return new Promise((resolve, reject) => {
    db.exec(sql, (err: Error) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function getUserByEmail(email: string): Promise<User | null> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT id, email, password_hash, created_at FROM users WHERE email = ? LIMIT 1';
    db.get(sql, [email], (err: Error, row: any) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve({
        id: row.id,
        email: row.email,
        password_hash: row.password_hash,
        created_at: row.created_at,
      });
    });
  });
}

export function createUser(email: string, passwordHash: string): Promise<User> {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const sql = 'INSERT INTO users(email, password_hash, created_at) VALUES (?, ?, ?)';
    db.run(sql, [email, passwordHash, createdAt], function (this: any, err: Error) {
      if (err) return reject(err);
      const id = this.lastID as number;
      resolve({ id, email, password_hash: passwordHash, created_at: createdAt });
    });
  });
}

// Eval helpers
export function createEvalRun(params: {
  user_id: number;
  game: string;
  algA: string;
  algB: string;
  seeds: number[];
  episodes: number;
  stepsPerEp: number;
  lr?: number | null;
}): Promise<number> {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const sql = `INSERT INTO eval_runs(user_id, game, algA, algB, seeds, episodes, stepsPerEp, lr, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql,
      [params.user_id, params.game, params.algA, params.algB, JSON.stringify(params.seeds), params.episodes, params.stepsPerEp, params.lr ?? null, createdAt],
      function (this: any, err: Error) {
        if (err) return reject(err);
        resolve(this.lastID as number);
      }
    );
  });
}

export function insertEvalMetric(params: {
  run_id: number;
  seed: number;
  ep: number;
  winA: number | null;
  avgRewardA: number;
  coopRate: number | null;
  l2Dist: number | null;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const sql = `INSERT INTO eval_metrics(run_id, seed, ep, winA, avgRewardA, coopRate, l2Dist, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [params.run_id, params.seed, params.ep, params.winA, params.avgRewardA, params.coopRate, params.l2Dist, createdAt], (err: Error) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function insertEvalSummary(params: {
  run_id: number;
  winA_mean: number | null;
  winA_std: number | null;
  avgRewardA_mean: number | null;
  avgRewardA_std: number | null;
  coopRate_mean: number | null;
  coopRate_std: number | null;
  l2Dist_mean: number | null;
  l2Dist_std: number | null;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const sql = `INSERT INTO eval_summaries(run_id, winA_mean, winA_std, avgRewardA_mean, avgRewardA_std, coopRate_mean, coopRate_std, l2Dist_mean, l2Dist_std, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(sql, [
      params.run_id,
      params.winA_mean, params.winA_std,
      params.avgRewardA_mean, params.avgRewardA_std,
      params.coopRate_mean, params.coopRate_std,
      params.l2Dist_mean, params.l2Dist_std,
      createdAt
    ], (err: Error) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

export function getEvalRunById(run_id: number): Promise<any | null> {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM eval_runs WHERE id = ?', [run_id], (err: Error, row: any) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve(row);
    });
  });
}

export function getEvalSummaryByRunId(run_id: number): Promise<any | null> {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM eval_summaries WHERE run_id = ?', [run_id], (err: Error, row: any) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      resolve(row);
    });
  });
}

export function getEvalMetricsByRunId(run_id: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM eval_metrics WHERE run_id = ? ORDER BY seed ASC, ep ASC', [run_id], (err: Error, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// (Scenarios & Lessons functions removed in rollback)

export function getNotesByUser(userId: number): Promise<Array<{ id: number; user_id: number; content: string; created_at: string }>> {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT id, user_id, content, created_at FROM notes WHERE user_id = ? ORDER BY created_at DESC';
    db.all(sql, [userId], (err: Error, rows: any[]) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function createNoteForUser(userId: number, content: string): Promise<{ id: number; user_id: number; content: string; created_at: string }> {
  return new Promise((resolve, reject) => {
    const createdAt = new Date().toISOString();
    const sql = 'INSERT INTO notes(user_id, content, created_at) VALUES (?, ?, ?)';
    db.run(sql, [userId, content, createdAt], function (this: any, err: Error) {
      if (err) return reject(err);
      const id = this.lastID as number;
      resolve({ id, user_id: userId, content, created_at: createdAt });
    });
  });
}

export function deleteNoteByIdForUser(userId: number, noteId: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sql = 'DELETE FROM notes WHERE id = ? AND user_id = ?';
    db.run(sql, [noteId, userId], function (this: any, err: Error) {
      if (err) return reject(err);
      resolve((this.changes as number) > 0);
    });
  });
}
