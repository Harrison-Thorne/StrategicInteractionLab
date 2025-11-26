import express, { Request, Response } from 'express';
import { requireAuth } from '../auth';
import { createEvalRun, getEvalMetricsByRunId, getEvalRunById, getEvalSummaryByRunId } from '../db';
import { generateEvalTrace, runEval } from './runner';

const router = express.Router();

router.use(requireAuth);

// POST /api/eval/start
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { game, algA, algB, seeds, episodes, stepsPerEp, lr } = req.body || {};
    if (!game || !algA || !algB || !Array.isArray(seeds) || !episodes || !stepsPerEp) {
      return res.status(400).json({ error: 'invalid_params' });
    }
    const user_id = (req as any).user.uid as number;
    const run_id = await createEvalRun({
      user_id,
      game: String(game),
      algA: String(algA),
      algB: String(algB),
      seeds: seeds.map((x: any) => Number(x)),
      episodes: Number(episodes),
      stepsPerEp: Number(stepsPerEp),
      lr: lr != null ? Number(lr) : null,
    });
    // run synchronously for simplicity
    await runEval({ run_id, game, algA, algB, seeds: seeds.map((x: any) => Number(x)), episodes: Number(episodes), stepsPerEp: Number(stepsPerEp), lr: lr != null ? Number(lr) : undefined });
    return res.json({ run_id });
  } catch (err) {
    console.error('eval/start error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/eval/summary/:run_id
router.get('/summary/:run_id', async (req: Request, res: Response) => {
  try {
    const run_id = Number(req.params.run_id);
    const run = await getEvalRunById(run_id);
    if (!run) return res.status(404).json({ error: 'not_found' });
    const summary = await getEvalSummaryByRunId(run_id);
    if (!summary) return res.status(204).end();
    return res.json({ run, summary });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/eval/metrics/:run_id
router.get('/metrics/:run_id', async (req: Request, res: Response) => {
  try {
    const run_id = Number(req.params.run_id);
    const rows = await getEvalMetricsByRunId(run_id);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

// GET /api/eval/trace/:run_id -> full step-level trace (may be large)
router.get('/trace/:run_id', async (req: Request, res: Response) => {
  try {
    const run_id = Number(req.params.run_id);
    const run = await getEvalRunById(run_id);
    if (!run) return res.status(404).json({ error: 'not_found' });
    const seeds = JSON.parse(run.seeds || '[]') as number[];
    const payload = generateEvalTrace({
      game: run.game,
      algA: run.algA,
      algB: run.algB,
      seeds,
      episodes: Number(run.episodes),
      stepsPerEp: Number(run.stepsPerEp),
      lr: run.lr != null ? Number(run.lr) : undefined,
    });
    return res.json(payload);
  } catch (err) {
    console.error('eval trace error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export { router as evalRouter };
