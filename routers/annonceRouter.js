const express = require('express');
const annonceController = require('../controllers/annonceController');
const { identifier } = require('../middlewares/identification');
const { authorizeRoles, isEmployeur, isAdmin } = require('../middlewares/authorization');
const candidatureController = require('../controllers/candidatureController');
const { uploadDocumentAnnonce } = require('../middlewares/uploadMiddleware');

const router = express.Router();

// Créer une annonce (Employeur uniquement)
router.post('/', identifier, isEmployeur, annonceController.createAnnonce);

// Lister toutes les annonces (tous les utilisateurs authentifiés, avec logique de filtre abonnement)
router.get('/', identifier, annonceController.getAllAnnonces);

// Lister les annonces de l'employeur connecté
router.get('/mes-annonces', identifier, isEmployeur, annonceController.getMyAnnonces);

// Voir une annonce spécifique (tous les utilisateurs authentifiés, avec logique de filtre abonnement)
router.get('/:id', identifier, annonceController.getAnnonceById);

// Mettre à jour une annonce (Employeur propriétaire uniquement)
router.put('/:id', identifier, isEmployeur, annonceController.updateAnnonce);

// Supprimer une annonce (Employeur propriétaire ou Admin)
router.delete('/:id', identifier, authorizeRoles('employeur', 'admin'), annonceController.deleteAnnonce);
// Si seul l'admin peut supprimer (et l'employeur peut juste désactiver) :
// router.delete('/:id', identifier, isAdmin, annonceController.deleteAnnonce);

// Employeur: Voir les candidatures pour une de ses annonces
router.get('/:annonceId/candidatures', identifier, isEmployeur, candidatureController.getCandidaturesPourAnnonce);

// --- Routes pour les documents joints aux annonces ---
router.post(
    '/:annonceId/documents', // Ou /:annonceId/upload-document
    identifier,
    isEmployeur, // S'assurer que l'utilisateur est un employeur
    uploadDocumentAnnonce.single('documentAnnonce'), // 'documentAnnonce' est le nom du champ input
    annonceController.uploadDocumentPourAnnonce
);

router.delete(
    '/:annonceId/documents/:documentId',
    identifier,
    isEmployeur,
    annonceController.deleteDocumentPourAnnonce
);

module.exports = router;