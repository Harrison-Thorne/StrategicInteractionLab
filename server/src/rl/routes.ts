import express, { Request, Response } from 'express';
import { requireAuth } from '../auth';
import { trainSelfPlay, TrainConfig } from './trainer';

const router = express.Router();

router.use(requireAuth);

// POST /api/rl/train { game, episodes, stepsPerEp, lr?, hidden?, seed? }
router.post('/train', async (req: Request, res: Response) => {
  try {
    const cfg = req.body as TrainConfig;
    if (!cfg?.game || !['rps', 'mp', 'pd'].includes(String(cfg.game))) {
      return res.status(400).json({ error: 'invalid_game' });
    }
    const episodes = Number(cfg.episodes) || 50;
    const stepsPerEp = Number(cfg.stepsPerEp) || 200;
    const lr = cfg.lr != null ? Number(cfg.lr) : undefined;
    const hidden = cfg.hidden != null ? Number(cfg.hidden) : undefined;
    const seed = cfg.seed != null ? Number(cfg.seed) : undefined;
    const result = trainSelfPlay({
      game: cfg.game,
      episodes,
      stepsPerEp,
      lr,
      hidden,
      seed,
      selfPlay: true,
    });
    return res.json(result);
  } catch (err) {
    console.error('rl/train error', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

export { router as rlRouter };
