const Transaction = require('../models/transactionModel');
const User = require('../models/usersModel');
const Annonce = require('../models/annonceModel');
const { initierPaiementSchema } = require('../middlewares/validator');
const { createNotificationJobLink } = require('../utils/notificationManager');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const AppError = require('../utils/appError');

// Configuration des prix et durées
const PRODUITS_CONFIG = {
    abonnement_premium_employeur: {
        montant: parseInt(process.env.PRIX_PREMIUM_EMPLOYEUR_MOIS) || 5000,
        description: 'Abonnement Premium Employeur',
        dureeMois: 1,
        type: 'abonnement'
    },
    abonnement_premium_travailleur: {
        montant: parseInt(process.env.PRIX_PREMIUM_TRAVAILLEUR_MOIS) || 2000,
        description: 'Abonnement Premium Travailleur',
        dureeMois: 1,
        type: 'abonnement'
    },
    boost_annonce_standard: {
        montant: parseInt(process.env.PRIX_BOOST_STANDARD) || 1000,
        description: 'Boost Standard - 7 jours',
        dureeJours: 7,
        type: 'boost'
    },
    boost_annonce_premium: {
        montant: parseInt(process.env.PRIX_BOOST_PREMIUM) || 2500,
        description: 'Boost Premium - 14 jours',
        dureeJours: 14,
        type: 'boost'
    },
    boost_annonce_ultimate: {
        montant: parseInt(process.env.PRIX_BOOST_ULTIMATE) || 5000,
        description: 'Boost Ultimate - 30 jours',
        dureeJours: 30,
        type: 'boost'
    }
};

// Fonction pour déterminer le montant et la description en fonction du produit
const getDetailsProduit = (typeProduit, metadata = {}) => {
    const config = PRODUITS_CONFIG[typeProduit];
    if (!config) {
        throw new AppError('Type de produit inconnu pour le paiement.', 400);
    }

    return {
        montant: config.montant,
        description: config.description,
        dureeMois: config.dureeMois,
        dureeJours: config.dureeJours,
        type: config.type
    };
};

exports.initierPaiementSimule = async (req, res, next) => {
    try {
        const { error, value } = initierPaiementSchema.validate(req.body);
        if (error) {
            return next(new AppError(error.details[0].message, 400));
        }

        const { typeProduit, produitId, metadata: requestMetadata } = value;
        const userId = req.user.userId;

        const utilisateur = await User.findById(userId);
        if (!utilisateur) return next(new AppError('Utilisateur non trouvé.', 404));

        // Vérifications spécifiques selon le type de produit
        if (typeProduit.startsWith('abonnement_')) {
            // Vérifier si l'utilisateur n'est pas déjà premium avec un abonnement en cours
            if (typeProduit === 'abonnement_premium_employeur' && 
                utilisateur.typeAbonnement === 'premium_employeur' && 
                utilisateur.dateFinAbonnement > new Date()) {
                return next(new AppError('Vous avez déjà un abonnement Premium Employeur actif.', 400));
            }
            if (typeProduit === 'abonnement_premium_travailleur' && 
                utilisateur.typeAbonnement === 'premium_travailleur' && 
                utilisateur.dateFinAbonnement > new Date()) {
                return next(new AppError('Vous avez déjà un abonnement Premium Travailleur actif.', 400));
            }
        } else if (typeProduit.startsWith('boost_annonce_')) {
            // Vérifier que l'annonce existe et appartient à l'utilisateur
            if (!produitId) {
                return next(new AppError('ID de l\'annonce requis pour un boost.', 400));
            }

            const annonce = await Annonce.findById(produitId);
            if (!annonce) {
                return next(new AppError('Annonce non trouvée.', 404));
            }

            if (annonce.employeurId.toString() !== userId) {
                return next(new AppError('Vous n\'êtes pas autorisé à booster cette annonce.', 403));
            }

            // Vérifier si l'annonce n'est pas déjà boostée
            if (annonce.estPremiumAnnonce) {
                return next(new AppError('Cette annonce est déjà boostée.', 400));
            }
        }

        const { montant, description, dureeMois, dureeJours, type } = getDetailsProduit(typeProduit, requestMetadata);

        const transaction = new Transaction({
            userId,
            montant,
            devise: 'FCFA',
            description,
            typeProduit,
            produitId: produitId || null,
            statut: 'initiee',
            metadata: { 
                roleInitialUtilisateur: utilisateur.role,
                dureeMois: dureeMois,
                dureeJours: dureeJours,
                type: type,
                ...requestMetadata
            }
        });
        await transaction.save();

        logger.info(`[PAIEMENT_SIMULE] Transaction ${transaction._id} initiée pour ${typeProduit}. Redirection simulée vers passerelle...`);

        res.status(201).json({
            success: true,
            message: 'Initiation de paiement enregistrée. Vous allez être redirigé pour finaliser (simulation).',
            transactionId: transaction._id,
            detailsPaiement: {
                montant: transaction.montant,
                devise: transaction.devise,
                description: transaction.description,
                urlConfirmationSimulee: `/api/paiements/confirmer-simulation/${transaction._id}`
            }
        });

    } catch (error) {
        logger.error("Erreur initierPaiementSimule:", error);
        next(error);
    }
};

// Fonction pour appliquer les bénéfices d'une transaction réussie
async function appliquerBeneficesTransaction(transaction) {
    const utilisateur = await User.findById(transaction.userId);
    if (!utilisateur) {
        logger.error(`[APPLIQUER_BENEFICES] Utilisateur ${transaction.userId} non trouvé pour transaction ${transaction._id}`);
        return false;
    }

    let nouveauTypeAbonnement = utilisateur.typeAbonnement;
    let nouvelleDateFinAbonnement = utilisateur.dateFinAbonnement || new Date();

    if (transaction.typeProduit === 'abonnement_premium_employeur' && utilisateur.role === 'employeur') {
        nouveauTypeAbonnement = 'premium_employeur';
    } else if (transaction.typeProduit === 'abonnement_premium_travailleur' && utilisateur.role === 'travailleur') {
        nouveauTypeAbonnement = 'premium_travailleur';
    } else if (transaction.typeProduit.startsWith('abonnement_')) {
        logger.warn(`[APPLIQUER_BENEFICES] Incohérence rôle/type d'abonnement pour ${transaction.userId}, type: ${transaction.typeProduit}, rôle: ${utilisateur.role}`);
    }

    // Calculer la nouvelle date de fin si c'est un abonnement
    if (transaction.typeProduit.startsWith('abonnement_') && transaction.metadata && transaction.metadata.dureeMois) {
        if (utilisateur.typeAbonnement === nouveauTypeAbonnement && utilisateur.dateFinAbonnement > new Date()) {
            nouvelleDateFinAbonnement = new Date(utilisateur.dateFinAbonnement);
        } else {
            nouvelleDateFinAbonnement = new Date();
        }
        nouvelleDateFinAbonnement.setMonth(nouvelleDateFinAbonnement.getMonth() + transaction.metadata.dureeMois);
    }

    // Appliquer les bénéfices selon le type
    if (transaction.typeProduit.startsWith('abonnement_')) {
        // Mettre à jour l'abonnement utilisateur
        if (nouveauTypeAbonnement !== 'gratuit') {
            await User.findByIdAndUpdate(utilisateur._id, {
                typeAbonnement: nouveauTypeAbonnement,
                dateFinAbonnement: nouvelleDateFinAbonnement,
            });

            await createNotificationJobLink(
                utilisateur._id,
                'ABONNEMENT_PREMIUM_ACTIVE_UTILISATEUR',
                `Félicitations ! Votre ${transaction.description} est maintenant actif jusqu'au ${nouvelleDateFinAbonnement.toLocaleDateString('fr-FR')}.`,
                '/profil/moi/abonnement',
                { nouveauAbonnement: nouveauTypeAbonnement, dateFin: nouvelleDateFinAbonnement.toISOString() }
            );
            logger.info(`[APPLIQUER_BENEFICES] Abonnement ${nouveauTypeAbonnement} activé pour ${utilisateur.email} jusqu'au ${nouvelleDateFinAbonnement}.`);
        }
    } else if (transaction.typeProduit.startsWith('boost_annonce_') && transaction.produitId) {
        // Booster l'annonce
        const dateFinBoost = new Date();
        dateFinBoost.setDate(dateFinBoost.getDate() + transaction.metadata.dureeJours);

        await Annonce.findByIdAndUpdate(transaction.produitId, {
            estPremiumAnnonce: true,
            dateExpiration: dateFinBoost // Utiliser dateExpiration pour la fin du boost
        });

        await createNotificationJobLink(
            utilisateur._id,
            'BOOST_ANNONCE_ACTIVE',
            `Votre annonce a été boostée avec succès ! Elle sera en position prioritaire pendant ${transaction.metadata.dureeJours} jours.`,
            '/dashboard-employeur',
            { annonceId: transaction.produitId, dureeJours: transaction.metadata.dureeJours }
        );
        logger.info(`[APPLIQUER_BENEFICES] Boost d'annonce activé pour ${utilisateur.email}, annonce: ${transaction.produitId}`);
    }

    return true;
}

exports.confirmerPaiementSimule = async (req, res, next) => {
    try {
        const { transactionId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(transactionId)) {
            return next(new AppError("ID de transaction invalide.", 400));
        }

        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return next(new AppError("Transaction non trouvée.", 404));
        }

        if (transaction.userId.toString() !== req.user.userId) {
            return next(new AppError("Accès non autorisé à cette transaction.", 403));
        }

        if (transaction.statut === 'reussie') {
            return res.status(200).json({ success: true, message: 'Ce paiement a déjà été confirmé et traité.', transaction });
        }
        if (transaction.statut !== 'initiee' && transaction.statut !== 'en_attente_paiement') {
            return next(new AppError(`Impossible de confirmer cette transaction (statut: ${transaction.statut}).`, 400));
        }

        // Mettre à jour la transaction
        transaction.statut = 'reussie';
        transaction.datePaiementEffectif = new Date();
        await transaction.save();

        logger.info(`[PAIEMENT_SIMULE] Transaction ${transaction._id} confirmée comme réussie.`);

        // Appliquer les bénéfices
        await appliquerBeneficesTransaction(transaction);

        res.status(200).json({
            success: true,
            message: 'Paiement simulé confirmé avec succès ! Votre service est activé.',
            transaction
        });

    } catch (error) {
        logger.error("Erreur confirmerPaiementSimule:", error);
        next(error);
    }
};

// Obtenir les produits disponibles
exports.getProduitsDisponibles = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const utilisateur = await User.findById(userId);
        
        if (!utilisateur) {
            return next(new AppError('Utilisateur non trouvé.', 404));
        }

        const produits = [];

        // Ajouter les abonnements selon le rôle
        if (utilisateur.role === 'employeur') {
            produits.push({
                id: 'abonnement_premium_employeur',
                ...PRODUITS_CONFIG.abonnement_premium_employeur,
                disponible: !(utilisateur.typeAbonnement === 'premium_employeur' && utilisateur.dateFinAbonnement > new Date())
            });
        } else if (utilisateur.role === 'travailleur') {
            produits.push({
                id: 'abonnement_premium_travailleur',
                ...PRODUITS_CONFIG.abonnement_premium_travailleur,
                disponible: !(utilisateur.typeAbonnement === 'premium_travailleur' && utilisateur.dateFinAbonnement > new Date())
            });
        }

        // Ajouter les boosts pour les employeurs
        if (utilisateur.role === 'employeur') {
            Object.entries(PRODUITS_CONFIG).forEach(([id, config]) => {
                if (id.startsWith('boost_annonce_')) {
                    produits.push({
                        id,
                        ...config,
                        disponible: true // Les boosts sont toujours disponibles
                    });
                }
            });
        }

        res.status(200).json({
            success: true,
            produits
        });

    } catch (error) {
        logger.error("Erreur getProduitsDisponibles:", error);
        next(error);
    }
};

// Obtenir l'abonnement actuel de l'utilisateur
exports.getAbonnementActuel = async (req, res, next) => {
    try {
        const userId = req.user.userId;
        const utilisateur = await User.findById(userId);
        
        if (!utilisateur) {
            return next(new AppError('Utilisateur non trouvé.', 404));
        }

        const abonnement = {
            type: utilisateur.typeAbonnement,
            dateFin: utilisateur.dateFinAbonnement,
            estActif: utilisateur.dateFinAbonnement > new Date(),
            joursRestants: Math.ceil((utilisateur.dateFinAbonnement - new Date()) / (1000 * 60 * 60 * 24))
        };

        res.status(200).json({
            success: true,
            abonnement
        });

    } catch (error) {
        logger.error("Erreur getAbonnementActuel:", error);
        next(error);
    }
};