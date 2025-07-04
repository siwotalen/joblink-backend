const express = require('express');
const router = express.Router();
const { getSavedJobs } = require('../controllers/jobsaveController');
const { identifier } = require('../middlewares/identification');

router.get('/saved', identifier, getSavedJobs);

module.exports = router;