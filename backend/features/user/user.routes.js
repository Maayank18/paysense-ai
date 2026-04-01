'use strict';

const { Router } = require('express');
const { profile, demoLogin } = require('./user.controller');
const { demoAuth } = require('../../middleware/auth');

const router = Router();

router.get('/profile', demoAuth, profile);
router.post('/demo-login', demoLogin); // No auth required — issues demo JWT

module.exports = router;