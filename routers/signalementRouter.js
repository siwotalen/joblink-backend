const express = require('express');
const signalementController = require('../controllers/signalementController');
const { identifier } = require('../middlewares/identification');

const router = express.Router();

router.post('/', identifier, signalementController.createSignalement);
router.get('/offres-signalees', identifier, signalementController.getOffresSignalees);
module.exports = router;