const Annonce = require('../models/annonceModel');
const User = require('../models/usersModel'); // Pour vérifier le type d'abonnement
const Categorie = require('../models/categorieModel');
const { createAnnonceSchema, updateAnnonceSchema } = require('../middlewares/validator');
const mongoose = require('mongoose');
const { createNotificationJobLink,createAdminNotificationJobLink } = require('../utils/notificationManager');
const { geocodeAddress } = require('../utils/geocodingService');
const logger = require('../utils/logger'); // <<< AJOUTEZ CETTE LIGNE
const AppError = require('../utils/appError');
const path = require('path');
const fs = require('fs');

// Employeur: Créer une annonce
exports.createAnnonce = async (req, res, next) => {
    try {
        const { error, value } = createAnnonceSchema.validate(req.body);
       

        if (error) {
            // Si l'upload a eu lieu mais que la validation Joi échoue, supprimer le fichier uploadé
            if (req.file && req.file.path) fs.unlink(req.file.path, (errUnlink) => { if(errUnlink) logger.error('Erreur suppression fichier après échec validation Joi (createAnnonce):', errUnlink);});
            return next(new AppError(error.details[0].message, 400));
        }
        const { titre, description, categorieId, localisation, /* autres champs */ } = value;
        let pointCoordinates = null;
        let adresseTextuellePourGeocodage = null; // Si l'utilisateur fournit une adresse complète

        if (!adresseTextuellePourGeocodage && localisation.ville) { // Construire une adresse si pas fournie complète
            adresseTextuellePourGeocodage = `${localisation.quartier || ''} ${localisation.ville}, Cameroun`.trim();
        }

        if (adresseTextuellePourGeocodage) {
            const coordinates = await geocodeAddress(adresseTextuellePourGeocodage);
            if (coordinates) {
                pointCoordinates = coordinates;
            } else {
                logger.warn(`Géocodage échoué pour l'annonce "${titre}", adresse: "${adresseTextuellePourGeocodage}". L'annonce sera créée sans point géographique précis.`);
                // Optionnel: rejeter la création si les coordonnées sont obligatoires
                // return next(new AppError("Impossible de déterminer les coordonnées géographiques pour l'adresse fournie. Veuillez vérifier l'adresse ou réessayer plus tard.", 400));
            }
        } else if (!localisation.point || !localisation.point.coordinates) {
            // Si aucune adresse textuelle n'est fournie ET que les coordonnées ne sont pas fournies directement (cas d'une API qui permettrait de les passer)
            logger.warn(`Aucune adresse ou coordonnées fournies pour l'annonce "${titre}". Géolocalisation impossible.`);
            // Optionnel: rejeter ici aussi si les coordonnées sont obligatoires.
        }
        // Vérifier si la catégorie existe
        const categorieExists = await Categorie.findById(value.categorieId);
        if (!categorieExists) {
            return res.status(400).json({ success: false, message: "La catégorie spécifiée n'existe pas." });
        }
        // Vérifier si l'employeur a atteint sa limite d'annonces
        if (req.user.role === 'employeur' && req.user.typeAbonnement === 'gratuit') {
            const LIMITE_ANNONCES_GRATUIT = process.env.LIMITE_ANNONCES_GRATUIT; // Mettre en config
            const annoncesActivesEmployeur = await Annonce.countDocuments({ 
                employeurId: req.user.userId, 
                statut: 'active',
                dateExpiration: { $gte: new Date() }
            });
            if (annoncesActivesEmployeur >= LIMITE_ANNONCES_GRATUIT) {
                return res.status(403).json({ 
                    success: false, 
                    message: `Vous avez atteint la limite de ${LIMITE_ANNONCES_GRATUIT} annonces actives pour les comptes gratuits. Passez au premium pour publier plus d'annonces.` 
                });
            }
        }
        const nouvelleAnnonce = new Annonce({
            ...value,
            employeurId: req.user.userId, // userId de l'employeur authentifié
            // estPremiumAnnonce: req.user.typeAbonnement === 'premium_employeur', // L'annonce est premium si l'employeur est premium
                                                                                  // Ou logique de paiement spécifique pour booster l'annonce
             localisation: {
                adresseTextuelle: localisation.adresseTextuelle || adresseTextuellePourGeocodage, // on Garde l'adresse textuelle
                ville: localisation.ville,
                quartier: localisation.quartier,
            },                                                                     
        });
        if (pointCoordinates) {
            nouvelleAnnonce.localisation.point = {
                type: 'Point',
                coordinates: pointCoordinates // [longitude, latitude]
            };
        } else if (value.localisation && value.localisation.point && value.localisation.point.coordinates) {
            // Si les coordonnées sont fournies directement et sont valides (ex: via une API admin ou un front qui fait déjà le geocoding)
            nouvelleAnnonce.localisation.point = value.localisation.point;
        }


        // Si l'employeur est premium, marquer l'annonce comme premium (pour référencement boosté)
        if (req.user.typeAbonnement === 'premium_employeur') {
            nouvelleAnnonce.estPremiumAnnonce = true;
            nouvelleAnnonce.dateExpiration = process.env.DUREE_VALIDITE_ANNONCE_PREMIUM_JOURS;
        }


        await nouvelleAnnonce.save();
        await createNotificationJobLink(
            req.user.userId, // ID de l'employeur
            'ANNONCE_CREEE_EMPLOYEUR',
            `Votre annonce "${nouvelleAnnonce.titre}" a été créée avec succès et est en cours de traitement (ou est maintenant visible).`,
            `/mes-annonces/${nouvelleAnnonce._id}`, // Lien vers l'annonce pour l'employeur
            { nomAnnonce: nouvelleAnnonce.titre }
        );
        await createAdminNotificationJobLink(
            'NOUVELLE_ANNONCE_A_VALIDER_ADMIN',
            `une nouvelle annonce "${nouvelleAnnonce.titre}" a été créée avec succès et est en attende  de traitement par vous.`,
            `/mes-annonces/${nouvelleAnnonce._id}`, // Lien vers l'annonce pour l'employeur
            { nomAnnonce: nouvelleAnnonce.titre }
        );
        res.status(201).json({ success: true, message: 'Annonce créée avec succès.', annonce: nouvelleAnnonce });

    } catch (err) {
        // Si une erreur DB survient après l'upload du fichier, supprimer le fichier
        if (req.file && req.file.path) fs.unlink(req.file.path, (errUnlink) => { if(errUnlink) logger.error('Erreur suppression fichier après échec DB (createAnnonce):', errUnlink);});
        logger.error("Erreur createAnnonce:", err);
        next(err);
    }
};

// --- TOUS PEUVENT VOIR LES ANNONCES ---
// getAllAnnonces : accessible à tous, limitation de prix seulement si connecté et travailleur gratuit
exports.getAllAnnonces = async (req, res, next) => {
    try {
        let utilisateur = null;
        let isPremium = false;
        let isTravailleurGratuit = false;

        // Si connecté, on récupère l'utilisateur pour appliquer la logique d'abonnement
        if (req.user && req.user.userId) {
            utilisateur = await User.findById(req.user.userId).select('role typeAbonnement');
            if (utilisateur) {
                isPremium = utilisateur.typeAbonnement && utilisateur.typeAbonnement.startsWith('premium');
                isTravailleurGratuit = utilisateur.role === 'travailleur' && utilisateur.typeAbonnement === 'gratuit';
            }
        }

        const {
            page = 1, limit = 10,
            categorie, ville, motCle,
            remunerationMin, remunerationMax,
            longitude, latitude, distanceMaxKm
        } = req.query;

        const queryFilters = { statut: 'active', dateExpiration: { $gte: new Date() } };

        // Limitation de prix pour travailleur gratuit connecté
        if (isTravailleurGratuit) {
            const SEUIL_BAS_PRIX = 5000;
            queryFilters['remuneration.montant'] = { $lte: SEUIL_BAS_PRIX };
        }

        // --- FILTRES SIMPLES (pour tous) ---
        if (categorie) queryFilters.categorieId = categorie;
        if (ville) queryFilters['localisation.ville'] = new RegExp(ville, 'i');
        if (motCle) {
            const regex = new RegExp(motCle, 'i');
            queryFilters.$or = [
                { titre: regex },
                { description: regex },
                { 'localisation.ville': regex },
                { competencesRequises: regex }
            ];
        }

        // --- FILTRES AVANCÉS (premium uniquement) ---
        let isGeoQuery = false;
        let userCoords = null;
        if (isPremium) {
            if (remunerationMin && !isNaN(parseFloat(remunerationMin))) {
                queryFilters['remuneration.montant'] = { ...queryFilters['remuneration.montant'], $gte: parseFloat(remunerationMin) };
            }
            if (remunerationMax && !isNaN(parseFloat(remunerationMax))) {
                queryFilters['remuneration.montant'] = { ...queryFilters['remuneration.montant'], $lte: parseFloat(remunerationMax) };
            }
            if (longitude && latitude) {
                const lon = parseFloat(longitude);
                const lat = parseFloat(latitude);
                const maxDistMetres = (parseFloat(distanceMaxKm) || 10) * 1000;
                if (!isNaN(lon) && !isNaN(lat) && !isNaN(maxDistMetres) && maxDistMetres > 0) {
                    queryFilters['localisation.point'] = {
                        $nearSphere: {
                            $geometry: { type: "Point", coordinates: [lon, lat] },
                            $maxDistance: maxDistMetres
                        }
                    };
                    isGeoQuery = true;
                    userCoords = [lon, lat];
                }
            }
        }

        // --- EXÉCUTION DE LA REQUÊTE ---
        let count, annonces;
        if (isGeoQuery) {
            const allGeoResults = await Annonce.find(queryFilters)
                .populate('categorieId', 'nom')
                .populate('employeurId', 'nom prenom profil.nomEntreprise profil.logoEntreprise')
                .lean();

            if (userCoords) {
                allGeoResults.forEach(a => {
                    if (a.localisation && a.localisation.point && Array.isArray(a.localisation.point.coordinates)) {
                        const [lon, lat] = a.localisation.point.coordinates;
                        const R = 6371;
                        const dLat = (lat - userCoords[1]) * Math.PI / 180;
                        const dLon = (lon - userCoords[0]) * Math.PI / 180;
                        const lat1 = userCoords[1] * Math.PI / 180;
                        const lat2 = lat * Math.PI / 180;
                        const aH = Math.sin(dLat/2) * Math.sin(dLat/2) +
                            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2);
                        const c = 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1-aH));
                        a.distanceKm = Math.round(R * c * 10) / 10;
                    }
                });
            }

            count = allGeoResults.length;
            const startIndex = (page - 1) * limit;
            const endIndex = page * limit;
            annonces = allGeoResults.slice(startIndex, endIndex);
        } else {
            const countPromise = Annonce.countDocuments(queryFilters);
            const annoncesPromise = Annonce.find(queryFilters)
                .populate('categorieId', 'nom')
                .populate('employeurId', 'nom prenom profil.nomEntreprise profil.logoEntreprise')
                .sort({ createdAt: -1 })
                .limit(parseInt(limit))
                .skip((page - 1) * parseInt(limit))
                .lean();
            [count, annonces] = await Promise.all([countPromise, annoncesPromise]);
        }

        res.status(200).json({
            success: true,
            annonces,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalAnnonces: count
        });

    } catch (err) {
        logger.error("Erreur getAllAnnonces:", err);
        next(err);
    }
};

// --- TOUS PEUVENT VOIR UNE ANNONCE SPÉCIFIQUE ---
// getAnnonceById : limitation de prix seulement si connecté et travailleur gratuit
exports.getAnnonceById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID d\'annonce invalide.' });
        }

        // On ne filtre par prix QUE si connecté et travailleur gratuit
        let isTravailleurGratuit = false;
        if (req.user && req.user.userId) {
            const utilisateur = await User.findById(req.user.userId);
            if (utilisateur && utilisateur.role === 'travailleur' && utilisateur.typeAbonnement === 'gratuit') {
                isTravailleurGratuit = true;
            }
        }

        // Si travailleur gratuit, on ne retourne que si le prix est <= seuil
        let annonce;
        if (isTravailleurGratuit) {
            const SEUIL_BAS_PRIX = 5000;
            annonce = await Annonce.findOne({ _id: id, statut: 'active', dateExpiration: { $gte: new Date() }, 'remuneration.montant': { $lte: SEUIL_BAS_PRIX } })
                .populate('categorieId', 'nom')
                .populate({
                    path: 'employeurId',
                    select: 'nom prenom email telephone profil.nomEntreprise profil.logoEntreprise profil.descriptionEntreprise'
                });
        } else {
            annonce = await Annonce.findOne({ _id: id, statut: 'active', dateExpiration: { $gte: new Date() } })
                .populate('categorieId', 'nom')
                .populate({
                    path: 'employeurId',
                    select: 'nom prenom email telephone profil.nomEntreprise profil.logoEntreprise profil.descriptionEntreprise'
                });
        }

        if (!annonce) {
            return res.status(404).json({ success: false, message: 'Annonce non trouvée ou plus active.' });
        }

        // --- NOUVELLE LOGIQUE : Récupérer les annonces similaires ---
        const annoncesSimilaires = await Annonce.find({
            _id: { $ne: annonce._id },
            categorieId: annonce.categorieId._id,
            statut: 'active',
            dateExpiration: { $gte: new Date() }
        })
            .limit(3)
            .select('titre employeurId localisation.ville')
            .populate('employeurId', 'profil.nomEntreprise nom');

        // Incrémenter le nombre de vues (optionnel)
        annonce.nombreVues = (annonce.nombreVues || 0) + 1;
        await annonce.save({ validateBeforeSave: false });

        res.status(200).json({ success: true, annonce, annoncesSimilaires });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};
// Employeur: Mettre à jour son annonce
 exports.updateAnnonce = async (req, res, next) => {
    try {
        const { id } = req.params; // ID de l'annonce
        const { userId } = req.user; // ID de l'employeur authentifié

        const { error, value } = updateAnnonceSchema.validate(req.body);
        if (error) {
            if (req.file && req.file.path) fs.unlink(req.file.path, (errUnlink) => { if(errUnlink) logger.error('Erreur suppression fichier après échec validation Joi (updateAnnonce):', errUnlink);});
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        
        const { titre, description, categorieId, localisation, /* autres champs */ } = value;

        let pointCoordinates = null;
        let adresseTextuellePourGeocodage = null;

        if (!adresseTextuellePourGeocodage && localisation.ville) { // Construire une adresse si pas fournie complète
            adresseTextuellePourGeocodage = `${localisation.quartier || ''} ${localisation.ville}, Cameroun`.trim();
        }

        if (adresseTextuellePourGeocodage) {
            const coordinates = await geocodeAddress(adresseTextuellePourGeocodage);
            if (coordinates) {
                pointCoordinates = coordinates;
            } else {
                logger.warn(`Géocodage échoué pour l'annonce "${titre}", adresse: "${adresseTextuellePourGeocodage}". L'annonce sera créée sans point géographique précis.`);
                // Optionnel: rejeter la création si les coordonnées sont obligatoires
                // return next(new AppError("Impossible de déterminer les coordonnées géographiques pour l'adresse fournie. Veuillez vérifier l'adresse ou réessayer plus tard.", 400));
            }
        } else if (!localisation.point || !localisation.point.coordinates) {
            // Si aucune adresse textuelle n'est fournie ET que les coordonnées ne sont pas fournies directement (cas d'une API qui permettrait de les passer)
            logger.warn(`Aucune adresse ou coordonnées fournies pour l'annonce "${titre}". Géolocalisation impossible.`);
            // Optionnel: rejeter ici aussi si les coordonnées sont obligatoires.
        }
        const annonce = await Annonce.findById(id);
        if (!annonce) {
            if (req.file && req.file.path) fs.unlink(req.file.path, (errUnlink) => { if(errUnlink) logger.error('Erreur suppression fichier, annonce non trouvée (updateAnnonce):', errUnlink);});
            return next(new AppError('Annonce non trouvée.', 404));
        }
        if (annonce.employeurId.toString() !== userId) {
            if (req.file && req.file.path) fs.unlink(req.file.path, (errUnlink) => { if(errUnlink) logger.error('Erreur suppression fichier, non autorisé (updateAnnonce):', errUnlink);});
        return next(new AppError('Vous n\'êtes pas autorisé à modifier cette annonce.', 403));
        }

        // Vérifier si la catégorie existe si elle est mise à jour
        if (value.categorieId) {
            const categorieExists = await Categorie.findById(value.categorieId);
            if (!categorieExists) {
                return next(new AppError('La nouvelle catégorie spécifiée n\'existe pas.', 400));

            }
        }
            Object.assign(annonce, {
            ...value,
            employeurId: req.user.userId,
            localisation: {
                adresseTextuelle: localisation.adresseTextuelle || adresseTextuellePourGeocodage,
                ville: localisation.ville,
                quartier: localisation.quartier,
                // Ajoute le point SEULEMENT si tu on as des coordonnées
                ...(pointCoordinates ? {
                    point: {
                        type: 'Point',
                        coordinates: pointCoordinates
                    }
                } : (value.localisation && value.localisation.point && value.localisation.point.coordinates ? {
                    point: value.localisation.point
                } : {}))
            }
        });
        await annonce.save();
        await createNotificationJobLink(
            req.user.userId,
            'ANNONCE_MODIFIEE_EMPLOYEUR',
            `Votre annonce "${annonce.titre}" a été modifiée avec succès.`,
            `/mes-annonces/${annonce._id}`,
            { nomAnnonce: annonce.titre }
        );
        res.status(200).json({ success: true, message: 'Annonce mise à jour.', annonce });
    } catch (err) {
        if (req.file && req.file.path) fs.unlink(req.file.path, (errUnlink) => { if(errUnlink) logger.error('Erreur suppression fichier après échec DB (updateAnnonce):', errUnlink);});
        logger.error("Erreur updateAnnonce:", err);
        next(err);
    }
};

// Employeur ou Admin: Supprimer une annonce
exports.deleteAnnonce = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, role } = req.user;

        const annonce = await Annonce.findById(id);
        if (!annonce) {
            return res.status(404).json({ success: false, message: 'Annonce non trouvée.' });
        }

        // Soit l'admin, soit le propriétaire de l'annonce peut supprimer
        if (role !== 'admin' && annonce.employeurId.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Action non autorisée.' });
        }

        // On pourrait changer le statut à 'supprimee' au lieu de la supprimer physiquement (soft delete)
        // annonce.statut = 'supprimee';
        // await annonce.save();
        await Annonce.findByIdAndDelete(id);


        res.status(200).json({ success: true, message: 'Annonce supprimée.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Employeur: Lister SES propres annonces
exports.getMyAnnonces = async (req, res) => {
    try {
        const { userId } = req.user;
        const { page = 1, limit = 10, statut, motCle } = req.query;
        const queryFilters = { employeurId: userId };

        if (statut) queryFilters.statut = statut;
        if (motCle) queryFilters.titre = new RegExp(motCle, 'i'); // Recherche sur le titre de ses annonces

        const count = await Annonce.countDocuments(queryFilters);
        const annonces = await Annonce.find(queryFilters)
            .populate('categorieId', 'nom')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const Candidature = require('../models/candidatureModel');
        for (const annonce of annonces) {
            const candidatures = await Candidature.find({ annonceId: annonce._id });
            annonce.candidaturesCount = candidatures.length;
            annonce.candidaturesAccepteesCount = candidatures.filter(c => c.statut === 'acceptee').length;
            annonce.candidaturesTermineesCount = candidatures.filter(c => ['terminee_automatiquement', 'terminee_manuellement'].includes(c.statut)).length;
        }
        res.status(200).json({
            success: true,
            annonces,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalAnnonces: count
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.uploadDocumentPourAnnonce = async (req, res, next) => {
    try {
        const { annonceId } = req.params;
        const { userId } = req.user; // ID de l'employeur connecté

        if (!req.file) {
            return next(new AppError("Aucun document envoyé ou type de fichier non supporté.", 400));
        }
        if (!mongoose.Types.ObjectId.isValid(annonceId)) {
            return next(new AppError("ID d'annonce invalide.", 400));
        }

        const annonce = await Annonce.findById(annonceId);
        if (!annonce) {
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier pour annonce non trouvée:", err); });
            return next(new AppError("Annonce non trouvée.", 404));
        }

        // Vérifier si l'utilisateur est le propriétaire de l'annonce
        if (annonce.employeurId.toString() !== userId) {
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier non autorisé (annonce):", err); });
            return next(new AppError("Vous n'êtes pas autorisé à modifier cette annonce.", 403));
        }

        // Limiter le nombre de documents par annonce (optionnel)
        const MAX_DOCS_PAR_ANNONCE = process.env.MAX_DOCS_PAR_ANNONCE || 3; 
        if (annonce.documentsJointsAnnonce && annonce.documentsJointsAnnonce.length >= MAX_DOCS_PAR_ANNONCE) {
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier (limite atteinte):", err); });
            return next(new AppError(`Limite de ${MAX_DOCS_PAR_ANNONCE} documents atteinte pour cette annonce.`, 400));
        }

        const nouveauDocument = {
            nomOriginal: req.file.originalname,
            nomFichierServeur: req.file.filename,
            cheminAcces: `/uploads/annonces/documents/${req.file.filename}`,
            typeMime: req.file.mimetype,
            taille: req.file.size,
        };

        const annonceMiseAJour = await Annonce.findByIdAndUpdate(
            annonceId,
            { $push: { documentsJointsAnnonce: nouveauDocument } },
            { new: true, runValidators: true }
        ).populate('documentsJointsAnnonce'); // Populer pour renvoyer le tableau à jour

        if (!annonceMiseAJour) return next(new AppError("Erreur lors de l'ajout du document à l'annonce.", 500));
        
        res.status(201).json({
            success: true,
            message: "Document ajouté à l'annonce avec succès.",
            document: annonceMiseAJour.documentsJointsAnnonce.slice(-1)[0] // Renvoyer le document ajouté
        });

    } catch (error) {
        logger.error("Erreur uploadDocumentPourAnnonce:", error);
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, (err) => { if (err) logger.error("Erreur suppression fichier uploadé après erreur DB (annonce):", err); });
        }
        next(error);
    }
};

exports.deleteDocumentPourAnnonce = async (req, res, next) => {
    try {
        const { annonceId, documentId } = req.params; // documentId est l'_id du sous-document dans le tableau
        const { userId } = req.user;

        if (!mongoose.Types.ObjectId.isValid(annonceId) || !mongoose.Types.ObjectId.isValid(documentId)) {
            return next(new AppError("ID d'annonce ou de document invalide.", 400));
        }

        const annonce = await Annonce.findOne({ _id: annonceId, employeurId: userId });
        if (!annonce) {
            return next(new AppError("Annonce non trouvée ou vous n'êtes pas le propriétaire.", 404));
        }

        const documentASupprimer = annonce.documentsJointsAnnonce.id(documentId); // Trouve le sous-document par son _id
        if (!documentASupprimer) {
            return next(new AppError("Document non trouvé dans cette annonce.", 404));
        }

        const cheminFichier = path.join(__dirname, '..', 'public', documentASupprimer.cheminAcces);

        // Supprimer la référence en base de données
        await Annonce.findByIdAndUpdate(annonceId, {
            $pull: { documentsJointsAnnonce: { _id: documentId } }
        });

        // Supprimer le fichier physique
        if (fs.existsSync(cheminFichier)) {
            fs.unlink(cheminFichier, (err) => {
                if (err) {
                    logger.error(`Erreur suppression fichier physique ${cheminFichier}:`, err);
                    // Que faire si la suppression du fichier échoue ? La DB est déjà mise à jour.
                    // On pourrait logguer et continuer, ou tenter de rollback la DB (complexe).
                } else {
                    logger.info(`Fichier supprimé du serveur: ${cheminFichier}`);
                }
            });
        } else {
            logger.warn(`Fichier non trouvé sur le serveur pour suppression (annonce): ${cheminFichier}`);
        }
        
        res.status(200).json({ success: true, message: "Document supprimé de l'annonce avec succès." });

    } catch (error) {
        logger.error("Erreur deleteDocumentPourAnnonce:", error);
        next(error);
    }
};

exports.uploadPhotoDescriptivePourAnnonce = async (req, res, next) => {
    try {
        const { annonceId } = req.params;
        const { userId } = req.user;
        if (!req.file) return next(new AppError("Aucune image envoyée.", 400));
        if (!mongoose.Types.ObjectId.isValid(annonceId)) return next(new AppError("ID d'annonce invalide.", 400));
        const annonce = await Annonce.findById(annonceId);
        if (!annonce) {
            fs.unlink(req.file.path, () => {});
            return next(new AppError("Annonce non trouvée.", 404));
        }
        if (annonce.employeurId.toString() !== userId) {
            fs.unlink(req.file.path, () => {});
            return next(new AppError("Non autorisé.", 403));
        }
        // Limite de 5 photos
        if (annonce.photosDescriptivesAnnonce && annonce.photosDescriptivesAnnonce.length >= 5) {
            fs.unlink(req.file.path, () => {});
            return next(new AppError("Limite de 5 photos atteinte.", 400));
        }
        const nouvellePhoto = {
            nomOriginal: req.file.originalname,
            nomFichierServeur: req.file.filename,
            cheminAcces: `/uploads/annonces/photos/${req.file.filename}`,
            typeMime: req.file.mimetype,
            taille: req.file.size,
        };
        annonce.photosDescriptivesAnnonce.push(nouvellePhoto);
        await annonce.save();
        res.status(201).json({ success: true, photo: nouvellePhoto });
    } catch (error) {
        if (req.file && req.file.path) fs.unlink(req.file.path, () => {});
        next(error);
    }
};

exports.deletePhotoDescriptivePourAnnonce = async (req, res, next) => {
    try {
        const { annonceId, photoId } = req.params;
        const { userId } = req.user;
        if (!mongoose.Types.ObjectId.isValid(annonceId) || !mongoose.Types.ObjectId.isValid(photoId)) {
            return next(new AppError("ID d'annonce ou de photo invalide.", 400));
        }
        const annonce = await Annonce.findOne({ _id: annonceId, employeurId: userId });
        if (!annonce) return next(new AppError("Annonce non trouvée ou non autorisé.", 404));
        const photo = annonce.photosDescriptivesAnnonce.id(photoId);
        if (!photo) return next(new AppError("Photo non trouvée.", 404));
        const cheminFichier = path.join(__dirname, '..', 'public', photo.cheminAcces);
        annonce.photosDescriptivesAnnonce.pull(photoId);
        await annonce.save();
        if (fs.existsSync(cheminFichier)) fs.unlink(cheminFichier, () => {});
        res.status(200).json({ success: true });
    } catch (error) {
        next(error);
    }
};

exports.reactivateAnnonce = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.user;
        const annonce = await Annonce.findOne({ _id: id, employeurId: userId });
        if (!annonce) {
            return res.status(404).json({ success: false, message: "Annonce non trouvée ou non autorisée." });
        }
        if (annonce.statut !== 'expiree') {
            return res.status(400).json({ success: false, message: "Seules les annonces expirées peuvent être réactivées." });
        }
        // Vérifier les candidatures
        const Candidature = require('../models/candidatureModel');
        const candidatures = await Candidature.find({ annonceId: id });
        const hasAccepteeOrTerminee = candidatures.some(c =>
            ['acceptee', 'terminee_automatiquement', 'terminee_manuellement'].includes(c.statut)
        );
        if (hasAccepteeOrTerminee) {
            return res.status(400).json({ success: false, message: "Impossible de réactiver : une candidature a déjà été acceptée ou terminée." });
        }
        // Réactiver
        annonce.statut = 'active';
        // Met à jour la date d'expiration
        const DUREE_VALIDITE_ANNONCE_JOURS = parseInt(process.env.DUREE_VALIDITE_ANNONCE_GRATUIT_JOURS) || 30;
        annonce.dateExpiration = new Date(Date.now() + DUREE_VALIDITE_ANNONCE_JOURS * 24 * 60 * 60 * 1000);
        await annonce.save();
        res.json({ success: true, message: "Annonce réactivée avec succès." });
    } catch (err) {
        res.status(500).json({ success: false, message: "Erreur serveur." });
    }
};