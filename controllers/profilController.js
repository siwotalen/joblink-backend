const User = require('../models/usersModel');
const { updateProfilTravailleurSchema, updateProfilEmployeurSchema,updateProfilCommunSchema } = require('../middlewares/validator');
const { createNotificationJobLink,createAdminNotificationJobLink } = require('../utils/notificationManager');
const fs = require('fs'); // Pour supprimer des fichiers si besoin
const path = require('path'); // Pour construire les chemins absolus des fichiers
const logger = require('../utils/logger'); // <<< AJOUTEZ CETTE LIGNE
const AppError = require('../utils/appError');
const mongoose = require('mongoose');
const { geocodeAddress } = require('../utils/geocodingService');
const Annonce = require('../models/annonceModel'); // Pour compter les annonces
// Récupérer le profil complet de l'utilisateur connecté (commun + spécifique au rôle)

exports.getMonProfil = async (req, res) => {
    try {
        const utilisateur = await User.findById(req.user.userId).select('-password -verificationCode -verificationCodeValidation -forgotPasswordCode -forgotPasswordCodeValidation');
        if (!utilisateur) {
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
        }
        res.status(200).json({ success: true, profil: utilisateur });
    } catch (error) {
        console.error("Erreur getMonProfil:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Mettre à jour les informations communes du profil de l'utilisateur connecté
exports.updateMonProfilCommun = async (req, res) => {
    try {
        const { error, value } = updateProfilCommunSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        // On ne peut pas changer email ou rôle ici (se fait via des processus plus sécurisés ou par admin)
        const champsAExclure = ['email', 'role', 'password', 'verified', 'typeAbonnement', 'dateFinAbonnement', 'estActif', 'profil'];
        for (const champ in value) {
            if (champsAExclure.includes(champ)) {
                delete value[champ]; // S'assurer de ne pas modifier les champs non autorisés
            }
        }
        
        if (Object.keys(value).length === 0) {
             return res.status(400).json({ success: false, message: "Aucune donnée valide à mettre à jour." });
        }

        const utilisateur = await User.findByIdAndUpdate(
            req.user.userId,
            { $set: value }, // Utiliser $set pour mettre à jour uniquement les champs fournis
            { new: true, runValidators: true, select: '-password -verificationCode -verificationCodeValidation -forgotPasswordCode -forgotPasswordCodeValidation' }
        );

        if (!utilisateur) {
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
        }
        await createNotificationJobLink(
            req.user.userId,
            'PROFIL_MIS_A_JOUR',
            'Votre profil JobLink a été mis à jour avec succès.',
            '/profil/moi'
        );
        res.status(200).json({ success: true, message: 'Informations mises à jour.', profil: utilisateur });

    } catch (error) {
        console.error("Erreur updateMonProfilCommun:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Mettre à jour le profil spécifique (Travailleur ou Employeur) de l'utilisateur connecté
exports.updateMonProfilSpecifique = async (req, res, next) => {
    try {
        const { role, userId } = req.user;
        let validationResult;
        let updateData = {};

        // 1. Valider en fonction du rôle
        if (role === 'travailleur') {
            validationResult = updateProfilTravailleurSchema.validate(req.body);
        } else if (role === 'employeur') {
            validationResult = updateProfilEmployeurSchema.validate(req.body);
        } else {
            return next(new AppError('Ce type d\'utilisateur n\'a pas de profil spécifique modifiable.', 403));
        }

        // 2. Vérifier le résultat de la validation
        if (validationResult.error) {
            return next(new AppError(validationResult.error.details[0].message, 400));
        }
        const value = validationResult.value; // Données validées

        if (Object.keys(value).length === 0) {
            return res.status(400).json({ success: false, message: "Aucune donnée de profil valide à mettre à jour." });
        }

        // 3. Gérer la géolocalisation si le rôle est 'travailleur' et que des données de localisation sont fournies
        if (role === 'travailleur' && value.localisation) {
            const {ville, quartier } = value.localisation;
            let adressePourGeocodage = `${quartier || ''} ${ville || ''}, Cameroun`.trim();
            
            if (adressePourGeocodage) {
                const coordinates = await geocodeAddress(adressePourGeocodage); // Assurez-vous que geocodeAddress est importé/défini
                if (coordinates) {
                    // On ajoute le point aux données à mettre à jour
                    value.localisation.point = { type: 'Point', coordinates: coordinates };
                } else {
                    logger.warn(`[PROFIL TRAVAILLEUR] Géocodage échoué pour ${userId}, adresse: "${adressePourGeocodage}".`);
                }
            }
        }

        // 4. Construire l'objet de mise à jour pour MongoDB
        for (const key in value) {
            updateData[`profil.${key}`] = value[key];
        }

        // 5. Mettre à jour la base de données
        const utilisateur = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true, select: 'profil nom email role' }
        );

        if (!utilisateur) {
            return next(new AppError('Utilisateur non trouvé.', 404));
        }
        
        await createNotificationJobLink(
            req.user.userId,
            'PROFIL_MIS_A_JOUR',
            'Votre profil JobLink a été mis à jour avec succès.',
            '/profil/moi' // Lien à adapter côté frontend
        );

        res.status(200).json({ success: true, message: 'Profil spécifique mis à jour.', profil: utilisateur });

    } catch (error) {
        logger.error("Erreur updateMonProfilSpecifique:", error);
        next(error);
    }
};

// --- Upload pour Profil Travailleur ---
exports.uploadDocumentCertifiant = async (req, res, next) => {
    try {
        if (!req.file) {
            return next(new AppError("Aucun fichier n'a été envoyé ou le type de fichier n'est pas supporté.", 400));
        }
        if (req.user.role !== 'travailleur') {
            // Supprimer le fichier uploadé si l'utilisateur n'est pas autorisé
            fs.unlink(req.file.path, (err) => { 
                if (err) logger.error("Erreur suppression fichier non autorisé:", err); 
            });
            return next(new AppError("Seuls les travailleurs peuvent uploader des documents certifiants.", 403));
        }

        const nouveauDocument = {
            nomOriginal: req.file.originalname,
            nomFichierServeur: req.file.filename,
            cheminAcces: `/uploads/profils/documents/${req.file.filename}`, // URL relative
            typeMime: req.file.mimetype,
            taille: req.file.size,
            valideParAdmin: false,
        };

        const utilisateur = await User.findByIdAndUpdate(
            req.user.userId,
            { $push: { 'profil.documentsCertifiants': nouveauDocument } },
            { new: true, runValidators: true, select: 'profil' } // Récupérer seulement le profil mis à jour
        );
        if (!utilisateur) return next(new AppError("Utilisateur non trouvé après l'upload.", 404));

        res.status(201).json({ 
            success: true, 
            message: "Document envoyé avec succès. Il pourra être examiné par un administrateur.", 
            document: utilisateur.profil.documentsCertifiants.slice(-1)[0] // Retourner le document ajouté
        });
    } catch (error) {
        logger.error("Erreur uploadDocumentCertifiant:", error);
        // Si le fichier a été uploadé mais qu'une erreur DB survient, le supprimer
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier après erreur DB:", err); });
        }
        next(error);
    }
};

exports.uploadPhotoPreuveTalent = async (req, res, next) => {
    try {
        if (!req.file) {
             return next(new AppError("Aucune image envoyée ou type de fichier non supporté.", 400));
        }
        if (req.user.role !== 'travailleur') {
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier non autorisé:", err); });
            return next(new AppError("Seuls les travailleurs peuvent uploader des photos de preuve.", 403));
        }

        const nouvellePhoto = {
            titre: req.body.titre || req.file.originalname, // Prendre le titre du body ou le nom original
            nomOriginal: req.file.originalname,
            nomFichierServeur: req.file.filename,
            cheminAcces: `/uploads/profils/images/${req.file.filename}`,
            typeMime: req.file.mimetype,
            taille: req.file.size,
        };

        const utilisateur = await User.findByIdAndUpdate(
            req.user.userId,
            { $push: { 'profil.photosPreuveTalent': nouvellePhoto } },
            { new: true, runValidators: true, select: 'profil' }
        );
        if (!utilisateur) return next(new AppError("Utilisateur non trouvé après l'upload.", 404));

        res.status(201).json({ 
            success: true, 
            message: "Photo de preuve de talent envoyée avec succès.", 
            photo: utilisateur.profil.photosPreuveTalent.slice(-1)[0]
        });
    } catch (error) {
        logger.error("Erreur uploadPhotoPreuveTalent:", error);
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier après erreur DB:", err); });
        }
        next(error);
    }
};

// --- Upload pour Profil Employeur (Logo) ---
exports.uploadLogoEntreprise = async (req, res, next) => {
    try {
        if (!req.file) {
            return next(new AppError("Aucune image envoyée ou type de fichier non supporté.", 400));
        }
        if (req.user.role !== 'employeur') {
             fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier non autorisé:", err); });
            return next(new AppError("Seuls les employeurs peuvent uploader un logo.", 403));
        }

        const logoData = {
            nomOriginal: req.file.originalname,
            nomFichierServeur: req.file.filename,
            cheminAcces: `/uploads/profils/images/${req.file.filename}`, // Même dossier que les images de profil
            typeMime: req.file.mimetype,
            taille: req.file.size,
        };

        const utilisateur = await User.findByIdAndUpdate(
            req.user.userId,
            { $set: { 'profil.logoEntreprise': logoData } }, // $set car il n'y a qu'un seul logo
            { new: true, runValidators: true, select: 'profil.logoEntreprise' }
        );
        if (!utilisateur) return next(new AppError("Utilisateur non trouvé après l'upload.", 404));

        res.status(200).json({ 
            success: true, 
            message: "Logo d'entreprise mis à jour avec succès.", 
            logo: utilisateur.profil.logoEntreprise 
        });
    } catch (error) {
        logger.error("Erreur uploadLogoEntreprise:", error);
         if (req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier après erreur DB:", err); });
        }
        next(error);
    }
};

// --- Upload Photo de Profil (pour tous les utilisateurs) ---
exports.uploadMaPhotoDeProfil = async (req, res, next) => {
    try {
        if (!req.file) {
            return next(new AppError("Aucune image envoyée ou type de fichier non supporté.", 400));
        }

        const utilisateurActuel = await User.findById(req.user.userId).select('photoDeProfil');
        if (!utilisateurActuel) {
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier pour utilisateur non trouvé:", err); });
            return next(new AppError("Utilisateur non trouvé.", 404));
        }

        // Si une ancienne photo de profil existe, la supprimer du serveur
        if (utilisateurActuel.photoDeProfil && utilisateurActuel.photoDeProfil.cheminAcces) {
            const cheminAnciennePhoto = path.join(__dirname, '..', 'public', utilisateurActuel.photoDeProfil.cheminAcces);
            // __dirname est le dossier du controller, '..' remonte à la racine du projet où 'public' se trouve
            if (fs.existsSync(cheminAnciennePhoto)) {
                fs.unlink(cheminAnciennePhoto, (err) => {
                    if (err) logger.error("Erreur suppression ancienne photo de profil:", err);
                    else logger.info(`Ancienne photo de profil supprimée: ${cheminAnciennePhoto}`);
                });
            }
        }

        const photoData = {
            nomOriginal: req.file.originalname,
            nomFichierServeur: req.file.filename,
            cheminAcces: `/uploads/profils/images/${req.file.filename}`, // Même dossier que les autres images de profil
            typeMime: req.file.mimetype,
            taille: req.file.size,
        };

        const utilisateurMisAJour = await User.findByIdAndUpdate(
            req.user.userId,
            { $set: { photoDeProfil: photoData } },
            { new: true, runValidators: true, select: 'photoDeProfil email nom' } // Renvoyer les infos utiles
        );

        res.status(200).json({ 
            success: true, 
            message: "Photo de profil mise à jour avec succès.", 
            photoDeProfil: utilisateurMisAJour.photoDeProfil 
        });
    } catch (error) {
        logger.error("Erreur uploadMaPhotoDeProfil:", error);
        if (req.file && req.file.path) { // S'assurer de supprimer le fichier uploadé en cas d'erreur DB
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier uploadé après erreur DB:", err); });
        }
        next(error);
    }
};

exports.deleteMaPhotoDeProfil = async (req, res, next) => {
    try {
        const utilisateur = await User.findById(req.user.userId).select('photoDeProfil');
        if (!utilisateur) {
            return next(new AppError("Utilisateur non trouvé.", 404));
        }

        if (!utilisateur.photoDeProfil || !utilisateur.photoDeProfil.cheminAcces) {
            return res.status(404).json({ success: false, message: "Aucune photo de profil à supprimer." });
        }

        const cheminPhoto = path.join(__dirname, '..', 'public', utilisateur.photoDeProfil.cheminAcces);
        if (fs.existsSync(cheminPhoto)) {
            fs.unlink(cheminPhoto, async (err) => {
                if (err) {
                    logger.error("Erreur suppression fichier photo de profil:", err);
                    // Ne pas bloquer si la suppression du fichier échoue, mais mettre à jour la DB quand même
                }
                await User.findByIdAndUpdate(req.user.userId, { $unset: { photoDeProfil: "" } });
                res.status(200).json({ success: true, message: "Photo de profil supprimée avec succès." });
            });
        } else {
            // Le fichier n'existe pas sur le serveur, on met juste à jour la DB
            logger.warn(`Fichier photo de profil non trouvé sur le serveur pour suppression: ${cheminPhoto}`);
            await User.findByIdAndUpdate(req.user.userId, { $unset: { photoDeProfil: "" } });
            res.status(200).json({ success: true, message: "Référence de la photo de profil supprimée (fichier non trouvé sur le serveur)." });
        }
    } catch (error) {
        logger.error("Erreur deleteMaPhotoDeProfil:", error);
        next(error);
    }
};

exports.deleteMonLogoEntreprise = async (req, res, next) => {
    try {
        if (req.user.role !== 'employeur') {
            return next(new AppError("Seuls les employeurs peuvent supprimer un logo.", 403));
        }

        const utilisateur = await User.findById(req.user.userId).select('profil.logoEntreprise');
        if (!utilisateur || !utilisateur.profil || !utilisateur.profil.logoEntreprise || !utilisateur.profil.logoEntreprise.cheminAcces) {
            return res.status(404).json({ success: false, message: "Aucun logo à supprimer." });
        }

        const cheminFichierLogo = utilisateur.profil.logoEntreprise.cheminAcces.startsWith('/')
                                ? utilisateur.profil.logoEntreprise.cheminAcces.substring(1)
                                : utilisateur.profil.logoEntreprise.cheminAcces;
        const cheminCompletFichierASupprimer = path.join(process.cwd(), 'public', cheminFichierLogo);
        
        logger.info(`Tentative de suppression du logo: ${cheminCompletFichierASupprimer}`);

        if (fs.existsSync(cheminCompletFichierASupprimer)) {
            fs.unlink(cheminCompletFichierASupprimer, (err) => {
                if (err) logger.error(`Erreur suppression fichier logo (${cheminCompletFichierASupprimer}):`, err);
                else logger.info(`Logo supprimé du serveur: ${cheminCompletFichierASupprimer}`);
            });
        } else {
            logger.warn(`Logo non trouvé sur le serveur pour suppression: ${cheminCompletFichierASupprimer}`);
        }

        // Supprimer la référence en base de données
        await User.findByIdAndUpdate(req.user.userId, {
            $unset: { 'profil.logoEntreprise': "" } 
        });

        res.status(200).json({ success: true, message: "Logo d'entreprise supprimé avec succès." });

    } catch (error) {
        logger.error("Erreur deleteMonLogoEntreprise:", error);
        next(error);
    }
};

exports.deleteMonDocumentCertifiant = async (req, res, next) => {
    try {
        const { nomFichier } = req.params; // L'identifiant est maintenant le nom du fichier sur le serveur
        const { userId } = req.user;

        const utilisateur = await User.findById(userId).select('profil.documentsCertifiants');
        if (!utilisateur || !utilisateur.profil || !utilisateur.profil.documentsCertifiants) {
            return next(new AppError("Aucun document à supprimer ou utilisateur non trouvé.", 404));
        }

        // CORRECTION : On cherche par nomFichierServeur
        const docASupprimer = utilisateur.profil.documentsCertifiants.find(d => d && d.nomFichierServeur === nomFichier);

        if (!docASupprimer) {
            return next(new AppError("Document non trouvé dans votre profil.", 404));
        }

        // Suppression du fichier physique (cette partie est correcte)
        if (docASupprimer.cheminAcces) {
            const cheminRelatif = docASupprimer.cheminAcces.startsWith('/') ? docASupprimer.cheminAcces.substring(1) : docASupprimer.cheminAcces;
            const cheminFichier = path.join(process.cwd(), 'public', cheminRelatif);
            if (fs.existsSync(cheminFichier)) {
                fs.unlink(cheminFichier, err => {
                    if (err) logger.error(`Erreur suppression fichier doc certifiant (${cheminFichier}):`, err);
                    else logger.info(`Doc certifiant supprimé du serveur: ${cheminFichier}`);
                });
            } else {
                logger.warn(`Fichier doc certifiant non trouvé sur le serveur: ${cheminFichier}`);
            }
        }

        // CORRECTION : Retirer du tableau en base de données en utilisant nomFichierServeur
        await User.findByIdAndUpdate(userId, {
            $pull: { 'profil.documentsCertifiants': { nomFichierServeur: nomFichier } }
        });

        res.status(200).json({ success: true, message: "Document certifiant supprimé avec succès." });
    } catch (error) {
        logger.error("Erreur deleteMonDocumentCertifiant:", error);
        next(error);
    }
};

exports.deleteMaPhotoTalent = async (req, res, next) => {
    try {
        const { nomFichier } = req.params; // L'identifiant est maintenant le nom du fichier
        const { userId } = req.user;

        const utilisateur = await User.findById(userId).select('profil.photosPreuveTalent');
        if (!utilisateur || !utilisateur.profil || !utilisateur.profil.photosPreuveTalent) {
            return next(new AppError("Aucune photo de talent à supprimer ou utilisateur non trouvé.", 404));
        }
        
        // CORRECTION : On cherche par nomFichierServeur
        const photoASupprimer = utilisateur.profil.photosPreuveTalent.find(p => p && p.nomFichierServeur === nomFichier);

        if (!photoASupprimer) {
            return next(new AppError("Photo de talent non trouvée dans votre profil.", 404));
        }
        
        // Logique de suppression du fichier physique (correcte)
        if (photoASupprimer.cheminAcces) {
            const cheminRelatif = photoASupprimer.cheminAcces.startsWith('/') ? photoASupprimer.cheminAcces.substring(1) : photoASupprimer.cheminAcces;
            const cheminFichier = path.join(process.cwd(), 'public', cheminRelatif);
             if (fs.existsSync(cheminFichier)) {
                fs.unlink(cheminFichier, err => {
                    if (err) logger.error(`Erreur suppression fichier photo talent (${cheminFichier}):`, err);
                    else logger.info(`Photo talent supprimée du serveur: ${cheminFichier}`);
                });
            } else {
                logger.warn(`Fichier photo talent non trouvé sur le serveur: ${cheminFichier}`);
            }
        }

        // CORRECTION : Retirer du tableau en base de données en utilisant nomFichierServeur
        await User.findByIdAndUpdate(userId, {
            $pull: { 'profil.photosPreuveTalent': { nomFichierServeur: nomFichier } }
        });
        
        res.status(200).json({ success: true, message: "Photo de talent supprimée avec succès." });
    } catch (error) {
        logger.error("Erreur deleteMaPhotoTalent:", error);
        next(error);
    }
};

