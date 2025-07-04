const express = require('express');
const candidatureController = require('../controllers/candidatureController');
const { identifier } = require('../middlewares/identification');
const { authorizeRoles, isTravailleur, isEmployeur } = require('../middlewares/authorization');

const router = express.Router();

// Travailleur: Postuler à une annonce
router.post('/', identifier, isTravailleur, candidatureController.postulerAnnonce);

// Travailleur: Voir ses propres candidatures
router.get('/mes-candidatures', identifier, isTravailleur, candidatureController.getMesCandidatures)

;

// Employeur: Voir les candidatures pour une de ses annonces
// Note: L'ID de l'annonce sera dans l'URL de la ressource Annonce (ex: /api/annonces/:annonceId/candidatures)
// Donc cette route sera probablement dans annonceRouter.js ou une route dédiée aux actions de l'employeur sur ses annonces.
// Pour l'instant, je la mets ici pour la logique, mais à réévaluer.
// router.get('/annonce/:annonceId', identifier, isEmployeur, candidatureController.getCandidaturesPourAnnonce);
// >> Mieux: la route sera dans annonceRouter.js: GET /api/annonces/:annonceId/candidatures (voir ci-dessous)

// Employeur: Mettre à jour le statut d'une candidature
router.patch('/:id/statut', identifier, isEmployeur, candidatureController.updateStatutCandidature);
router.get('/:id/detail', identifier, isTravailleur, candidatureController.getMaCandidatureDetail);
router.get('/:id/detail-employeur', identifier, isEmployeur, candidatureController.getCandidatureDetailPourEmployeur);

// Travailleur : Retirer sa propre candidature
router.delete(
    '/:id', 
    identifier, 
    isTravailleur, // S'assurer que seul un travailleur peut tenter cette action
    candidatureController.retirerCandidature
);

router.get('/recues-recentes', identifier, isEmployeur, candidatureController.getRecentesCandidaturesPourEmployeur);
module.exports = router;