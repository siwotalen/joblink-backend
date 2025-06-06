const Annonce = require('../models/annonceModel');
const User = require('../models/usersModel'); // Pour vérifier le type d'abonnement
const Categorie = require('../models/categorieModel');
const { createAnnonceSchema, updateAnnonceSchema } = require('../middlewares/validator');
const mongoose = require('mongoose');
const { createNotificationJobLink,createAdminNotificationJobLink } = require('../utils/notificationManager');
const { geocodeAddress } = require('../utils/geocodingService');
const logger = require('../utils/logger'); // <<< AJOUTEZ CETTE LIGNE
const AppError = require('../utils/appError');

// Employeur: Créer une annonce
exports.createAnnonce = async (req, res) => {
    try {
        const { error, value } = createAnnonceSchema.validate(req.body);
       

        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        const { titre, description, categorieId, localisation, /* autres champs */ } = value;
        let pointCoordinates = null;
        let adresseTextuellePourGeocodage = localisation.adresseTextuelle; // Si l'utilisateur fournit une adresse complète

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
        console.error("Erreur createAnnonce:", err);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la création de l\'annonce.' });
    }
};

// Tous les utilisateurs authentifiés: Lister les annonces (avec filtres et pagination)
exports.getAllAnnonces = async (req, res) => {
    try {
        const utilisateur = await User.findById(req.user.userId); // Récupérer l'utilisateur pour son type d'abonnement
        if (!utilisateur) return res.status(401).json({ success: false, message: "Utilisateur non trouvé." });

           const { 
            page = 1, limit = 10, 
            categorie, ville, motCle, 
            triPar, ordreTri = 'desc',
            longitude, latitude, distanceMaxKm // Nouveaux paramètres
        } = req.query;

        const queryFilters = { statut: 'active', dateExpiration: { $gte: new Date() } }; // Seules les annonces actives et non expirées
     
        if (utilisateur.role === 'travailleur' && utilisateur.typeAbonnement === 'gratuit') {
            const SEUIL_BAS_PRIX = 5000; // Doit être une constante ou une config
            queryFilters['remuneration.montant'] = { $lte: SEUIL_BAS_PRIX };
        }

        if (categorie) queryFilters.categorieId = categorie;
        if (ville) queryFilters['localisation.ville'] = new RegExp(ville, 'i'); // Recherche insensible à la casse

        if (motCle) {
            queryFilters.$text = { $search: motCle }; // Recherche full-text
        }

        // --- NOUVELLE LOGIQUE DE GÉOLOCALISATION ---
        if (longitude && latitude) {
            const lon = parseFloat(longitude);
            const lat = parseFloat(latitude);
            const maxDistMetres = (parseFloat(distanceMaxKm) || 10) * 1000; // Distance max en mètres, 10km par défaut

            if (!isNaN(lon) && !isNaN(lat) && !isNaN(maxDistMetres) && maxDistMetres > 0) {
                queryFilters['localisation.point'] = {
                    $nearSphere: {
                        $geometry: {
                            type: "Point",
                            coordinates: [lon, lat] // [longitude, latitude]
                        },
                        $maxDistance: maxDistMetres // Distance en mètres
                    }
                };
                logger.info(`Recherche géoactivée : autour de [${lon}, ${lat}], distance max ${maxDistMetres}m`);
            } else {
                logger.warn("Paramètres de géolocalisation invalides ou manquants (longitude, latitude, distanceMaxKm).");
            }
        }
        // --- FIN NOUVELLE LOGIQUE DE GÉOLOCALISATION ---


        const sortOptions = {};
        // Toujours trier par estPremiumAnnonce en premier pour le boost
        sortOptions['estPremiumAnnonce'] = -1; // Les premium en premier
                
        if (triPar && !(longitude && latitude)) { // Ne pas surcharger le tri par distance si géo-recherche active
            sortOptions[triPar] = ordreTri === 'asc' ? 1 : -1;
        } else if (!(longitude && latitude)) { // Tri par défaut si pas de géo-recherche ni de triPar
            sortOptions['createdAt'] = -1;// Par défaut, les plus récentes (après les premium)
        }
        const count = await Annonce.countDocuments(queryFilters);
        const annonces = await Annonce.find(queryFilters)
            .populate('categorieId', 'nom')
            .populate('employeurId', 'nom prenom profil.nomEntreprise') // Afficher nom de l'entreprise si disponible
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        res.status(200).json({
            success: true,
            annonces,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalAnnonces: count
        });

    } catch (err) {
        console.error("Erreur getAllAnnonces:", err);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération des annonces.' });
    }
};

// Tous les utilisateurs authentifiés: Voir une annonce spécifique
exports.getAnnonceById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID d\'annonce invalide.' });
        }

        const annonce = await Annonce.findOne({ _id: id, statut: 'active', dateExpiration: { $gte: new Date() } })
                                     .populate('categorieId', 'nom')
                                     .populate('employeurId', 'nom prenom email telephone profil'); // Renvoyer plus d'infos sur l'employeur

        if (!annonce) {
            return res.status(404).json({ success: false, message: 'Annonce non trouvée ou plus active.' });
        }
        
        // Vérifier si l'utilisateur gratuit peut voir cette annonce (au cas où il accède par URL directe)
        const utilisateur = await User.findById(req.user.userId);
        if (utilisateur.role === 'travailleur' && utilisateur.typeAbonnement === 'gratuit') {
            const SEUIL_BAS_PRIX = 5000;
            if (annonce.remuneration.montant > SEUIL_BAS_PRIX) {
                return res.status(403).json({ success: false, message: 'Cette annonce est réservée aux membres premium. Passez premium pour la consulter !' });
            }
        }
        
        // Incrémenter le nombre de vues (optionnel, peut se faire de manière plus robuste)
        annonce.nombreVues = (annonce.nombreVues || 0) + 1;
        await annonce.save({ validateBeforeSave: false }); // Sauver sans revalider pour ne pas bloquer sur d'anciennes règles

        res.status(200).json({ success: true, annonce });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Employeur: Mettre à jour son annonce
exports.updateAnnonce = async (req, res) => {
    try {
        const { id } = req.params; // ID de l'annonce
        const { userId } = req.user; // ID de l'employeur authentifié

        const { error, value } = updateAnnonceSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        
        const { titre, description, categorieId, localisation, /* autres champs */ } = value;

        let pointCoordinates = null;
        let adresseTextuellePourGeocodage = localisation.adresseTextuelle; // Si l'utilisateur fournit une adresse complète

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
            return res.status(404).json({ success: false, message: 'Annonce non trouvée.' });
        }

        // Vérifier si l'utilisateur est le propriétaire de l'annonce
        if (annonce.employeurId.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Vous n\'êtes pas autorisé à modifier cette annonce.' });
        }

        // Vérifier si la catégorie existe si elle est mise à jour
        if (value.categorieId) {
            const categorieExists = await Categorie.findById(value.categorieId);
            if (!categorieExists) {
                return res.status(400).json({ success: false, message: "La nouvelle catégorie spécifiée n'existe pas." });
            }
        }
        const annonceData = new Annonce({
            ...value,
            employeurId: req.user.userId, 
             localisation: {
                adresseTextuelle: localisation.adresseTextuelle || adresseTextuellePourGeocodage, // on Garde l'adresse textuelle
                ville: localisation.ville,
                quartier: localisation.quartier,
            },                                                                     
        });
        
        Object.assign(annonce, annonceData); // Appliquer les modifications
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
        console.error("Erreur updateAnnonce:", err);
        res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour.' });
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
            .exec();

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
