const User = require('../models/usersModel');
const Categorie = require('../models/categorieModel'); // Au cas où l'admin gère aussi les catégories ici
const Annonce = require('../models/annonceModel');   // Pour la gestion des annonces par l'admin
const { adminUpdateUserSchema, adminCreateUserSchema } = require('../middlewares/validator');
const { doHash } = require('../utils/hashing'); // Si adminCreateUserSchema est utilisé
const mongoose = require('mongoose');
const Signalement = require('../models/signalementModel'); // S'assurer de l'import
const { adminUpdateSignalementSchema } = require('../middlewares/validator'); // S'assurer de l'import
const { createNotificationJobLink,createAdminNotificationJobLink } = require('../utils/notificationManager');
const Transaction = require('../models/transactionModel'); // Importer
const Avis = require('../models/avisModel');


// --- Gestion des Utilisateurs par l'Admin ---

// Lister tous les utilisateurs (avec filtres et pagination)
exports.getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 10, role, typeAbonnement, estActif, emailSearch, sortBy = 'createdAt', order = 'desc' } = req.query;
        const queryFilters = {};

        if (role) queryFilters.role = role;
        if (typeAbonnement) queryFilters.typeAbonnement = typeAbonnement;
        if (estActif !== undefined) queryFilters.estActif = estActif === 'true'; // Convertir en booléen
        if (emailSearch) queryFilters.email = new RegExp(emailSearch, 'i'); // Recherche partielle insensible à la casse

        const sortOptions = {};
        sortOptions[sortBy] = order === 'asc' ? 1 : -1;

        const count = await User.countDocuments(queryFilters);
        const users = await User.find(queryFilters)
            .select('-password -verificationCode -verificationCodeValidation -forgotPasswordCode -forgotPasswordCodeValidation') // Exclure les champs sensibles
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        res.status(200).json({
            success: true,
            users,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalUsers: count,
        });
    } catch (error) {
        console.error("Erreur getAllUsers (Admin):", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Obtenir les détails d'un utilisateur spécifique par son ID
exports.getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID utilisateur invalide.' });
        }

        const user = await User.findById(id)
            .select('-password -verificationCode -verificationCodeValidation -forgotPasswordCode -forgotPasswordCodeValidation');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
        }
        res.status(200).json({ success: true, user });
    } catch (error) {
        console.error("Erreur getUserById (Admin):", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Mettre à jour un utilisateur (par l'Admin)
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID utilisateur invalide.' });
        }

        const { error, value } = adminUpdateUserSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }
        
        // Empêcher l'admin de se désactiver ou de changer son propre rôle s'il est le seul admin 
        if (req.user.userId === id && (value.estActif === false || (value.role && value.role !== 'admin'))) {
              return res.status(403).json({ success: false, message: 'Vous ne pouvez pas vous désactiver ou changer votre rôle.' });
        }
        const originalUserRole = await User.findById(id).select('role typeAbonnement estActif');
        const updatedUser = await User.findByIdAndUpdate(id, { $set: value }, { 
            new: true, 
            runValidators: true,
            select: '-password -verificationCode -verificationCodeValidation -forgotPasswordCode -forgotPasswordCodeValidation'
        });

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'Utilisateur non trouvé.' });
        }

        if (value.estActif === false && updatedUser.estActif === true) { // S'il était actif et devient inactif
            await createNotificationJobLink(
                updatedUser._id,
                'COMPTE_UTILISATEUR_SUSPENDU',
                'Votre compte JobLink a été temporairement suspendu par un administrateur. Pour plus d\'informations, veuillez contacter le support.',
                '/contact' // Ou une page d'aide
            );
        } else if (value.estActif === true && updatedUser.estActif === false) { // S'il était inactif et devient actif
            await createNotificationJobLink(
                updatedUser._id,
                'COMPTE_UTILISATEUR_REACTIVE',
                'Bonne nouvelle ! Votre compte JobLink a été réactivé par un administrateur.',
                '/tableau-de-bord'
            );
        }
    // si value.role ou value.typeAbonnement a changé
        if (value.role && value.role !== originalUserRole.role) { // originalUserRole doit être récupéré avant la mise à jour
            await createNotificationJobLink(updatedUser._id, 'ADMIN_ACTION_SUR_COMPTE', `Le rôle de votre compte a été modifié à : ${value.role}.`, '/profil/moi');
        }
        if (value.typeAbonnement && value.typeAbonnement !== originalUserRole.typeAbonnement) {
            let messageAbo = `Votre type d'abonnement a été modifié à : ${value.typeAbonnement}.`;
            if(value.typeAbonnement.includes('premium')) {
                messageAbo = `Félicitations ! Votre compte a été mis à niveau vers ${value.typeAbonnement}. Profitez de tous les avantages !`;
                await createNotificationJobLink(updatedUser._id, 'ABONNEMENT_PREMIUM_ACTIVE_UTILISATEUR', messageAbo, '/premium/avantages', { nouveauAbonnement: value.typeAbonnement });
            } else {
                await createNotificationJobLink(updatedUser._id, 'ADMIN_ACTION_SUR_COMPTE', messageAbo, '/profil/moi/abonnement');
            }
        }
        res.status(200).json({ success: true, message: 'Utilisateur mis à jour.', user: updatedUser });
    } catch (error) {
        console.error("Erreur updateUser (Admin):", error);
        // Gérer les erreurs de validation Mongoose (ex: email dupliqué si on permettait de le changer)
        if (error.code === 11000) {
             return res.status(409).json({ success: false, message: "Conflit de données (ex: email déjà utilisé)." });
        }
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Optionnel: Créer un utilisateur (par l'Admin)
exports.createUser = async (req, res) => {
    try {
        const { error, value } = adminCreateUserSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const { email, password, ...autresInfos } = value;

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ success: false, message: 'Cet email est déjà utilisé.' });
        }

        const hashedPassword = await doHash(password, 12);
        const newUser = new User({
            email,
            password: hashedPassword,
            ...autresInfos,
            profil: autresInfos.profil || {} // Si on initialise le profil
        });

        await newUser.save();
        const userResponse = { ...newUser.toObject() };
        delete userResponse.password; // Assurer que le mot de passe n'est pas retourné

        res.status(201).json({ success: true, message: 'Utilisateur créé avec succès.', user: userResponse });

    } catch (error) {
        console.error("Erreur createUser (Admin):", error);
         if (error.code === 11000) {
            return res.status(409).json({ success: false, message: "Cet email est déjà utilisé." });
        }
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Lister toutes les annonces (avec plus de filtres pour l'admin)
exports.getAllAnnoncesAdmin = async (req, res) => {
    try {
        const { page = 1, limit = 10, statut, employeurId, categorieId, titreSearch, sortBy = 'createdAt', order = 'desc' } = req.query;
        const queryFilters = {};

        if (statut) queryFilters.statut = statut;
        if (employeurId && mongoose.Types.ObjectId.isValid(employeurId)) queryFilters.employeurId = employeurId;
        if (categorieId && mongoose.Types.ObjectId.isValid(categorieId)) queryFilters.categorieId = categorieId;
        if (titreSearch) queryFilters.titre = new RegExp(titreSearch, 'i');

        const sortOptions = {};
        sortOptions[sortBy] = order === 'asc' ? 1 : -1;

        const count = await Annonce.countDocuments(queryFilters);
        const annonces = await Annonce.find(queryFilters)
            .populate('employeurId', 'nom email')
            .populate('categorieId', 'nom')
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        
        res.status(200).json({
            success: true,
            annonces,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalAnnonces: count,
        });
    } catch (error) {
        console.error("Erreur getAllAnnoncesAdmin:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// Mettre à jour le statut ou d'autres champs d'une annonce par l'Admin
exports.updateAnnonceAdmin = async (req, res) => {
    try {
        const { id } = req.params; // ID de l'annonce
        const updateData = req.body; // Ex: { statut: 'inactive', estPremiumAnnonce: true }
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID d\'annonce invalide.' });
        }
        
        const annonce = await Annonce.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true });

        if (!annonce) {
            return res.status(404).json({ success: false, message: 'Annonce non trouvée.' });
        }
        await annonce.save()
        await createNotificationJobLink(
            annonce.employeurId,
            'ADMIN_ACTION_SUR_ANNONCE',
            `Votre annonce "${annonce.titre}" a été modifiée par un administrateur. Veuillez la vérifier.`,
            `/mes-annonces/${annonce._id}`,
            { nomAnnonce: annonce.titre }
        );
        res.status(200).json({ success: true, message: 'Annonce mise à jour par l\'admin.', annonce });
    } catch (error) {
        console.error("Erreur updateAnnonceAdmin:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.getAllSignalements = async (req, res) => {
    try {
        const { page = 1, limit = 10, statut, cibleType, sortBy = 'createdAt', order = 'desc' } = req.query;
        const queryFilters = {};

        if (statut) queryFilters.statut = statut;
        if (cibleType) queryFilters.cibleType = cibleType;

        const sortOptions = {};
        sortOptions[sortBy] = order === 'asc' ? 1 : -1;

        const count = await Signalement.countDocuments(queryFilters);
        const signalements = await Signalement.find(queryFilters)
            .populate('signaleParUserId', 'email nom prenom')
            .populate('cibleId') // Grâce à refPath, Mongoose saura quelle collection peupler
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        
        res.status(200).json({
            success: true,
            signalements,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalSignalements: count,
        });
    } catch (error) {
        console.error("Erreur getAllSignalements (Admin):", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.getSignalementByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'ID de signalement invalide.' });
        }
        const signalement = await Signalement.findById(id)
            .populate('signaleParUserId', 'email nom prenom')
            .populate('cibleId'); // Populer la cible (Annonce ou User)

        if (!signalement) {
            return res.status(404).json({ success: false, message: 'Signalement non trouvé.' });
        }
        res.status(200).json({ success: true, signalement });
    } catch (error) {
        console.error("Erreur getSignalementByIdAdmin:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.updateSignalementAdmin = async (req, res) => {
    try {
        const { id } = req.params; // ID du signalement
        const adminId = req.user.userId; // ID de l'admin qui traite

        const { error, value } = adminUpdateSignalementSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const { statut, notesAdmin } = value;

        const signalement = await Signalement.findById(id);
        if (!signalement) {
            return res.status(404).json({ success: false, message: 'Signalement non trouvé.' });
        }

        // Logique d'action basée sur le nouveau statut (exemple)
        // Cette partie est cruciale et dépend de nos processus de modération
        if (statut === 'action_prise_contenu_supprime' && signalement.cibleType === 'Annonce') {
            await Annonce.findByIdAndUpdate(signalement.cibleId, { statut: 'supprimee_par_admin' }); // ou findByIdAndDelete
        } else if (statut === 'action_prise_utilisateur_suspendu' && signalement.cibleType === 'User') {
            await User.findByIdAndUpdate(signalement.cibleId, { estActif: false });
        }
        // Ajouter d'autres logiques d'action ici...

        const updatedSignalement = await Signalement.findByIdAndUpdate(
            id,
            { 
                $set: { 
                    statut, 
                    notesAdmin: notesAdmin || signalement.notesAdmin, // Garder les anciennes notes si non fournies
                    adminIdTraitant: adminId,
                    dateTraitement: Date.now(),
                } 
            },
            { new: true, runValidators: true }
        ).populate('signaleParUserId', 'email').populate('cibleId');
        // Notifier l'utilisateur qui a signalé
        if (updatedSignalement && updatedSignalement.signaleParUserId) {
            let cibleInfoPourMessage = `${updatedSignalement.cibleType}`;
            if (updatedSignalement.cibleId) {
                if (updatedSignalement.cibleType === 'Annonce' && updatedSignalement.cibleId.titre) {
                    cibleInfoPourMessage = `l'annonce "${updatedSignalement.cibleId.titre}"`;
                } else if (updatedSignalement.cibleType === 'User' && updatedSignalement.cibleId.email) {
                    cibleInfoPourMessage = `l'utilisateur ${updatedSignalement.cibleId.email}`;
                } else {
                    cibleInfoPourMessage = `${updatedSignalement.cibleType} (ID: ${updatedSignalement.cibleId._id || updatedSignalement.cibleId})`;
                }
            }

            await createNotificationJobLink( // Utilisez la fonction JobLink
            updatedSignalement.signaleParUserId._id || updatedSignalement.signaleParUserId, // S'assurer que c'est bien l'ID
            'SIGNALEMENT_TRAITE_UTILISATEUR',
            `Votre signalement concernant ${cibleInfoPourMessage} a été traité par notre équipe. Nouveau statut : ${statut}.`,
            null, 
            { statutSignalement: statut, cibleType: updatedSignalement.cibleType }
            );
        }
        res.status(200).json({ success: true, message: 'Signalement mis à jour.', signalement: updatedSignalement });
    } catch (error) {
        console.error("Erreur updateSignalementAdmin:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.getAllTransactions = async (req, res, next) => {
    try {
        const { page = 1, limit = 20, userId, statut, typeProduit, sortBy = 'createdAt', order = 'desc' } = req.query;
        const queryFilters = {};

        if (userId && mongoose.Types.ObjectId.isValid(userId)) queryFilters.userId = userId;
        if (statut) queryFilters.statut = statut;
        if (typeProduit) queryFilters.typeProduit = typeProduit;

        const sortOptions = {};
        sortOptions[sortBy] = order === 'asc' ? 1 : -1;

        const count = await Transaction.countDocuments(queryFilters);
        const transactions = await Transaction.find(queryFilters)
            .populate('userId', 'nom email')
            .sort(sortOptions)
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        
        res.status(200).json({
            success: true,
            transactions,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalTransactions: count,
        });
    } catch (error) {
        logger.error("Erreur getAllTransactions (Admin):", error);
        next(error);
    }
};

// --- Statistiques globales pour le dashboard admin ---
exports.getDashboardStatsAdmin = async (req, res) => {
    try {
        const [totalUsers, totalJobs, reportedContent] = await Promise.all([
            User.countDocuments({}),
            Annonce.countDocuments({}),
            Signalement.countDocuments({})
        ]);
        res.status(200).json({
            success: true,
            stats: {
                totalUsers,
                totalJobs,
                reportedContent
            }
        });
    } catch (error) {
        console.error("Erreur getDashboardStatsAdmin:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

// --- Gestion des Avis par l'Admin ---

exports.getAllAvisAdmin = async (req, res) => {
    try {
        const { page = 1, limit = 10, note, estApprouve, estVisible, cibleRole, auteurRole } = req.query;
        const queryFilters = {};
        if (note) queryFilters.note = parseInt(note);
        if (estApprouve !== undefined && estApprouve !== '') queryFilters.estApprouve = estApprouve === 'true';
        if (estVisible !== undefined && estVisible !== '') queryFilters.estVisible = estVisible === 'true';
        if (cibleRole) queryFilters.cibleRole = cibleRole;
        if (auteurRole) queryFilters.auteurRole = auteurRole;
        const count = await Avis.countDocuments(queryFilters);
        const avis = await Avis.find(queryFilters)
            .populate('auteurId', 'nom prenom email')
            .populate('cibleId', 'nom prenom email')
            .populate('annonceId', 'titre')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();
        res.status(200).json({
            success: true,
            avis,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalAvis: count,
        });
    } catch (error) {
        console.error("Erreur getAllAvisAdmin:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.updateAvisAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { estApprouve, estVisible } = req.body;
        const updateData = {};
        if (estApprouve !== undefined) updateData.estApprouve = estApprouve;
        if (estVisible !== undefined) updateData.estVisible = estVisible;
        const avis = await Avis.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
            .populate('auteurId', 'nom prenom email')
            .populate('cibleId', 'nom prenom email')
            .populate('annonceId', 'titre');
        if (!avis) {
            return res.status(404).json({ success: false, message: 'Avis non trouvé.' });
        }
        res.status(200).json({ success: true, message: 'Avis modéré.', avis });
    } catch (error) {
        console.error("Erreur updateAvisAdmin:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};

exports.getAdvancedStatsAdmin = async (req, res) => {
    try {
        // Utilisateurs par rôle
        const usersByRole = await User.aggregate([
            { $group: { _id: "$role", count: { $sum: 1 } } }
        ]);
        // Annonces par statut
        const jobsByStatus = await Annonce.aggregate([
            { $group: { _id: "$statut", count: { $sum: 1 } } }
        ]);
        // Signalements par type
        const reportsByType = await Signalement.aggregate([
            { $group: { _id: "$cibleType", count: { $sum: 1 } } }
        ]);
        // Avis par note
        const reviewsByNote = await Avis.aggregate([
            { $group: { _id: "$note", count: { $sum: 1 } } }
        ]);
        res.status(200).json({
            success: true,
            usersByRole,
            jobsByStatus,
            reportsByType,
            reviewsByNote
        });
    } catch (error) {
        console.error("Erreur getAdvancedStatsAdmin:", error);
        res.status(500).json({ success: false, message: 'Erreur serveur.' });
    }
};