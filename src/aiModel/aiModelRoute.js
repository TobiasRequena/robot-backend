import express from 'express';
import { responseAI } from './aiModel.js';

const router = express.Router();

router.post('/responseFromAI', responseAI);

export default router;