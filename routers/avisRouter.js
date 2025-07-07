// routers/avisRouter.js
const express = require('express');
const avisController = require('../controllers/avisController');
const { identifier } = require('../middlewares/identification');
const { authorizeRoles } = require('../middlewares/authorization'); // Pour s'assurer que c'est un travailleur ou employeur

const router = express.Router();

// Laisser un avis (accessible aux travailleurs et employeurs authentifiés)
router.post(
    '/', 
    identifier, 
    authorizeRoles('travailleur', 'employeur'), // Seuls eux peuvent laisser des avis
    avisController.laisserAvis
);

// Obtenir les avis pour un utilisateur spécifique (route publique ou authentifiée)
router.get('/recus', identifier, avisController.getAvisRecus); 
router.get('/utilisateur/:utilisateurId', avisController.getAvisPourUtilisateur); 
// Si authentification requise pour voir les avis : router.get('/utilisateur/:utilisateurId', identifier, avisController.getAvisPourUtilisateur);


// TODO: Routes Admin pour la modération des avis
// router.get('/admin/tous', identifier, isAdmin, avisController.getAllAvisAdmin);
// router.put('/admin/:avisId/statut', identifier, isAdmin, avisController.updateAvisStatutAdmin);
// router.delete('/admin/:avisId', identifier, isAdmin, avisController.deleteAvisAdmin);

module.exports = router;