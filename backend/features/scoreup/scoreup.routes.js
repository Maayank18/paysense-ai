'use strict';

const { Router } = require('express');
const { getScore, refreshScore, getHistory } = require('./scoreup.controller');
const { demoAuth } = require('../../middleware/auth');
const { scoreUpLimiter } = require('../../middleware/rateLimit');

const router = Router();

router.get('/', demoAuth, scoreUpLimiter, getScore);
router.post('/refresh', demoAuth, refreshScore);
router.get('/history', demoAuth, getHistory);

module.exports = router;