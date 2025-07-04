const express = require('express');
const profilController = require('../controllers/profilController');
const { identifier } = require('../middlewares/identification');
const { uploadDocumentTravailleur, uploadImageProfil } = require('../middlewares/uploadMiddleware'); 
const { authorizeRoles, isTravailleur, isEmployeur } = require('../middlewares/authorization');
const router = express.Router();

// Routes pour l'utilisateur connecté ("moi")
router.get('/moi', identifier, profilController.getMonProfil);
router.put('/moi/commun', identifier, profilController.updateMonProfilCommun);
router.put('/moi/specifique', identifier, profilController.updateMonProfilSpecifique);



// --- Photo de Profil (Tous utilisateurs authentifiés) ---
router.post(
    '/moi/photo-de-profil',
    identifier,
    uploadImageProfil.single('photoProfil'), // 'photoProfil' est le nom du champ input type="file"
    profilController.uploadMaPhotoDeProfil
);
router.delete(
    '/moi/photo-de-profil',
    identifier,
    profilController.deleteMaPhotoDeProfil
);

// Routes d'upload pour le profil Travailleur
router.post(
    '/moi/travailleur/upload-document', 
    identifier, 
    isTravailleur, // S'assurer que c'est un travailleur
    uploadDocumentTravailleur.single('documentProfil'), // 'documentProfil' est le nom du champ du formulaire <input type="file" name="documentProfil">
    profilController.uploadDocumentCertifiant
);
router.post(
    '/moi/travailleur/upload-photo-talent', 
    identifier, 
    isTravailleur,
    uploadImageProfil.single('photoTalent'), // 'photoTalent' est le nom du champ du formulaire
    profilController.uploadPhotoPreuveTalent // Cette fonction attendra req.body.titre 
);
// Ajout les routes DELETE pour les documents et photos


// Route d'upload pour le logo de l'Employeur
router.post(
    '/moi/employeur/upload-logo',
    identifier,
    isEmployeur,
    uploadImageProfil.single('logoEntreprise'), // 'logoEntreprise' est le nom du champ
    profilController.uploadLogoEntreprise
);

router.delete('/moi/employeur/delete-logo', identifier, isEmployeur, profilController.deleteMonLogoEntreprise);
router.delete('/moi/travailleur/document/:nomFichier', identifier, isTravailleur, profilController.deleteMonDocumentCertifiant);

// Changer :photoId en :nomFichier
router.delete('/moi/travailleur/photo-talent/:nomFichier', identifier, isTravailleur, profilController.deleteMaPhotoTalent);



module.exports = router;