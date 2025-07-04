// routers/travailleurRouter.js
const express = require('express');
const travailleurController = require('../controllers/travailleurController'); // ou userController
const { identifier } = require('../middlewares/identification');
const { authorizeRoles } = require('../middlewares/authorization'); // Ex: seuls les employeurs peuvent rechercher
const { isTravailleur } = require('../middlewares/authorization');


const router = express.Router();

// Route pour rechercher des travailleurs par proximité
// Protégée, par exemple, pour les employeurs (premium ?)
// router.get('/proximite',identifier,travailleurController.rechercherTravailleursProximite);
router.get('/dashboard/stats',identifier, isTravailleur, travailleurController.getDashboardStatsTravailleur);

// On pourrait aussi avoir une route publique pour voir le profil d'un travailleur par son ID
// router.get('/:id', travailleurController.getProfilPublicTravailleur);


module.exports = router;