const express = require('express');
const annonceController = require('../controllers/annonceController');
const { identifier } = require('../middlewares/identification');
const { authorizeRoles, isEmployeur, isAdmin } = require('../middlewares/authorization');
const candidatureController = require('../controllers/candidatureController');
const { uploadImageAnnonce } = require('../middlewares/uploadMiddleware');
const router = express.Router();
const { uploadPhotoAnnonce } = require('../middlewares/uploadMiddleware');

// Créer une annonce (Employeur uniquement)
router.post('/', identifier, isEmployeur,annonceController.createAnnonce);

// Lister toutes les annonces (tous les utilisateurs)
router.get('/', annonceController.getAllAnnonces);

// Lister les annonces de l'employeur connecté
router.get('/mes-annonces', identifier, isEmployeur, annonceController.getMyAnnonces);

// Voir une annonce spécifique (tous les utilisateurs)
router.get('/:id', annonceController.getAnnonceById);


// Mettre à jour une annonce (Employeur propriétaire uniquement)
router.put('/:id', identifier, isEmployeur, annonceController.updateAnnonce);


// Supprimer une annonce (Employeur propriétaire ou Admin)
router.delete('/:id', identifier, authorizeRoles('employeur', 'admin'), annonceController.deleteAnnonce);


// Si seul l'admin peut supprimer (et l'employeur peut juste désactiver) :
// router.delete('/:id', identifier, isAdmin, annonceController.deleteAnnonce);


// Employeur: Voir les candidatures pour une de ses annonces
router.get('/:annonceId/candidatures', identifier, isEmployeur, candidatureController.getCandidaturesPourAnnonce);


router.post('/:annonceId/photos',identifier,isEmployeur,uploadPhotoAnnonce.single('photoDescriptive'),annonceController.uploadPhotoDescriptivePourAnnonce);


router.delete('/:annonceId/photos/:photoId',identifier,isEmployeur,annonceController.deletePhotoDescriptivePourAnnonce);
// Ajoute cette ligne après les autres routes annonces
router.patch('/:id/reactiver', identifier, isEmployeur, annonceController.reactivateAnnonce);

module.exports = router;