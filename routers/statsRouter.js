// routers/statsRouter.js (côté backend)
const express = require('express');
const statsController = require('../controllers/statsController');
// Pas besoin d'authentification pour ces stats publiques

const router = express.Router();

router.get('/plateforme', statsController.getStatsPlateforme);

module.exports = router;