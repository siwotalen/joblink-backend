const express = require('express');
const faqController = require('../controllers/faqController');
const { identifier } = require('../middlewares/identification'); // Pour les routes admin
const { isAdmin } = require('../middlewares/authorization');   // Pour les routes admin

const router = express.Router();

// Route publique (ou pour utilisateurs authentifiés) pour afficher la FAQ
router.get('/', faqController.getActiveFaqItems);


module.exports = router;