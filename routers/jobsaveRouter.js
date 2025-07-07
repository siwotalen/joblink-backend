const express = require('express');
const router = express.Router();
const { getSavedJobs, saveJob, unsaveJob, isJobSaved } = require('../controllers/jobsaveController');
const { identifier } = require('../middlewares/identification');

router.get('/saved', identifier, getSavedJobs);
router.post('/save', identifier, saveJob);
router.post('/unsave', identifier, unsaveJob);
router.get('/is-saved/:jobId', identifier, isJobSaved);

module.exports = router;