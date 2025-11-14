import express, { Request, Response } from 'express';
import { requireAuth } from '../auth';
import { createRunner } from './engine';
import * as store from './store';

const router = express.Router();

router.use(requireAuth);

// POST /api/arena/start { game, stepsPerTick=10, seed, lr }
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { game, stepsPerTick = 10, seed, lr } = req.body || {};
    if (!game || !['rps', 'mp', 'pd'].includes(String(game))) {
      return res.status(400).json({ error: 'invalid_game' });
    }
    const runner = createRunner({ game, stepsPerTick: Number(stepsPerTick) || 10, seed: seed ? Number(seed) : undefined, lr: lr ? Number(lr) : undefined });
    store.register(runner);
    runner.start();
    return res.json({ run_id: runner.run_id });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/arena/stop { run_id }
router.post('/stop', (req: Request, res: Response) => {
  try {
    const { run_id } = req.body || {};
    if (!run_id) return res.status(400).json({ error: 'run_id_required' });
    const ok = store.stop(String(run_id));
    if (!ok) return res.status(404).json({ error: 'not_found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/arena/state/:run_id
router.get('/state/:run_id', (req: Request, res: Response) => {
  try {
    const run_id = req.params.run_id;
    const r = store.get(run_id);
    if (!r) return res.status(404).json({ error: 'not_found' });
    return res.json(r.getState());
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

export { router as arenaRouter };
