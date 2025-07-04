// routers/employeurRouter.js (Backend)
const express = require('express');
const employeurController = require('../controllers/employeurController');
const { identifier } = require('../middlewares/identification');
const { isEmployeur } = require('../middlewares/authorization');

const router = express.Router();

router.get('/profil-public/:id', employeurController.getProfilPublicEmployeur);

router.get('/dashboard/stats',identifier, isEmployeur, employeurController.getDashboardStatsEmployeur);

module.exports = router;