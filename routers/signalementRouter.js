const express = require('express');
const signalementController = require('../controllers/signalementController');
const { identifier } = require('../middlewares/identification');

const router = express.Router();

router.post('/', identifier, signalementController.createSignalement);

module.exports = router;