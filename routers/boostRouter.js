const express = require('express');
const boostController = require('../controllers/boostController');
const { identifier } = require('../middlewares/identification');

const router = express.Router();

// Routes publiques
router.get('/types', boostController.getBoostTypes);

// Routes protégées
router.post('/create', identifier, boostController.createBoost);
router.get('/user', identifier, boostController.getUserBoosts);
router.get('/annonce/:annonceId', boostController.getAnnonceBoosts);

// Webhook Monet Bill
router.post('/webhook', boostController.handleWebhook);

module.exports = router; 