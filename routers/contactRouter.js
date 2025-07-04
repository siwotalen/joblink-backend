const express = require('express');
const contactController = require('../controllers/contactController');
const router = express.Router();

// Endpoint public pour le formulaire de contact
router.post('/send', contactController.recevoirMessageContact);

module.exports = router;