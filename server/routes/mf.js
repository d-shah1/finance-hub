import express from 'express';
import { ah, scopeUserId } from '../lib/auth.js';
import { searchFunds, valueAllPlans } from '../lib/mf.js';

const router = express.Router();

router.get('/search', ah(async (req, res) => {
  try {
    res.json(await searchFunds(req.query.q));
  } catch (e) {
    res.status(502).json({ error: `Couldn't search funds right now (${e.message}).` });
  }
}));

/** Fetches the latest NAVs and values any instalments that don't have units yet. */
router.post('/refresh', ah(async (req, res) => res.json(await valueAllPlans(scopeUserId(req)))));

export default router;
