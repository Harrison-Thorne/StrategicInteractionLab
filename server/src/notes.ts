import express, { Request, Response } from 'express';
import { requireAuth, AuthedRequest } from './auth';
import { createNoteForUser, deleteNoteByIdForUser, getNotesByUser } from './db';

const router = express.Router();

// All routes require auth
router.use(requireAuth);

// GET /api/notes
router.get('/', async (req: AuthedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const notes = await getNotesByUser(uid);
    return res.json(notes);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

// POST /api/notes { content }
router.post('/', async (req: AuthedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const content = (req.body?.content ?? '').toString().trim();
    if (!content) return res.status(400).json({ error: 'content_required' });
    const note = await createNoteForUser(uid, content);
    return res.status(201).json(note);
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', async (req: AuthedRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid_id' });
    const ok = await deleteNoteByIdForUser(uid, id);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'internal_error' });
  }
});

export { router as notesRouter };

