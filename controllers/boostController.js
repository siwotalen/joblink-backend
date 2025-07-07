const Annonce = require('../models/annonceModel');
const Transaction = require('../models/transactionModel');
const User = require('../models/usersModel');
const { createNotificationJobLink } = require('../utils/notificationManager');
const logger = require('../utils/logger');
const AppError = require('../utils/appError');

// Types de boost disponibles
const BOOST_TYPES = {
    boost_annonce_standard: {
        name: 'Boost Standard',
        price: parseInt(process.env.PRIX_BOOST_STANDARD) || 1000,
        duration: 7,
        features: {
            priorityPosition: true,
            featuredBadge: false,
            emailPromotion: false,
            socialMediaPromotion: false
        }
    },
    boost_annonce_premium: {
        name: 'Boost Premium',
        price: parseInt(process.env.PRIX_BOOST_PREMIUM) || 2500,
        duration: 14,
        features: {
            priorityPosition: true,
            featuredBadge: true,
            emailPromotion: false,
            socialMediaPromotion: false
        }
    },
    boost_annonce_ultimate: {
        name: 'Boost Ultimate',
        price: parseInt(process.env.PRIX_BOOST_ULTIMATE) || 5000,
        duration: 30,
        features: {
            priorityPosition: true,
            featuredBadge: true,
            emailPromotion: true,
            socialMediaPromotion: true
        }
    }
};

// Obtenir tous les types de boost disponibles
exports.getBoostTypes = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            boostTypes: BOOST_TYPES
        });
    } catch (error) {
        logger.error('Erreur getBoostTypes:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
};

// Créer un boost pour une annonce
exports.createBoost = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { annonceId, boostType } = req.body;

        if (!BOOST_TYPES[boostType]) {
            return res.status(400).json({
                success: false,
                message: 'Type de boost invalide'
            });
        }

        const boostConfig = BOOST_TYPES[boostType];
        const user = await User.findById(userId);
        const annonce = await Annonce.findById(annonceId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
        }

        if (!annonce) {
            return res.status(404).json({
                success: false,
                message: 'Annonce non trouvée'
            });
        }

        // Vérifier que l'utilisateur est propriétaire de l'annonce
        if (annonce.employeurId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Vous n\'êtes pas autorisé à booster cette annonce'
            });
        }

        // Vérifier si l'annonce n'est pas déjà boostée
        if (annonce.estPremiumAnnonce) {
            return res.status(400).json({
                success: false,
                message: 'Cette annonce est déjà boostée'
            });
        }

        // Créer la transaction
        const transaction = new Transaction({
            userId,
            typeProduit: boostType,
            montant: boostConfig.price,
            devise: 'FCFA',
            description: `Boost ${boostConfig.name} - ${annonce.titre}`,
            statut: 'initiee',
            metadata: {
                annonceId: annonceId,
                boostType: boostType,
                dureeJours: boostConfig.duration,
                features: boostConfig.features
            }
        });

        await transaction.save();

        // Mettre à jour l'annonce
        const dateFinBoost = new Date();
        dateFinBoost.setDate(dateFinBoost.getDate() + boostConfig.duration);

        await Annonce.findByIdAndUpdate(annonceId, {
            estPremiumAnnonce: true,
            dateExpiration: dateFinBoost
        });

        // Notification
        await createNotificationJobLink(
            userId,
            'BOOST_ANNONCE_ACTIVE',
            `Votre annonce a été boostée avec succès ! Elle sera en position prioritaire pendant ${boostConfig.duration} jours.`,
            '/dashboard-employeur'
        );

        res.status(200).json({
            success: true,
            message: 'Boost créé avec succès',
            boost: {
                annonceId: annonceId,
                boostType: boostType,
                dureeJours: boostConfig.duration,
                dateFin: dateFinBoost
            }
        });

    } catch (error) {
        logger.error('Erreur createBoost:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
};

// Obtenir les boosts d'un utilisateur
exports.getUserBoosts = async (req, res) => {
    try {
        const userId = req.user.userId;

        // Récupérer les annonces boostées de l'utilisateur
        const annoncesBoostees = await Annonce.find({
            employeurId: userId,
            estPremiumAnnonce: true
        }).populate('categorieId', 'nom');

        const boosts = annoncesBoostees.map(annonce => {
            const boostType = Object.keys(BOOST_TYPES).find(key => 
                BOOST_TYPES[key].name.includes('Boost')
            );
            
            return {
                annonceId: annonce._id,
                annonce: {
                    titre: annonce.titre,
                    ville: annonce.localisation.ville,
                    categorie: annonce.categorieId?.nom
                },
                boostType: boostType || 'boost_annonce_standard',
                dateFin: annonce.dateExpiration,
                isActive: annonce.dateExpiration > new Date(),
                remainingDays: Math.ceil((annonce.dateExpiration - new Date()) / (1000 * 60 * 60 * 24))
            };
        });

        res.status(200).json({
            success: true,
            boosts
        });

    } catch (error) {
        logger.error('Erreur getUserBoosts:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
};

// Obtenir les boosts d'une annonce
exports.getAnnonceBoosts = async (req, res) => {
    try {
        const { annonceId } = req.params;

        const annonce = await Annonce.findById(annonceId);
        if (!annonce) {
            return res.status(404).json({
                success: false,
                message: 'Annonce non trouvée'
            });
        }

        const boost = {
            annonceId: annonce._id,
            isBoosted: annonce.estPremiumAnnonce,
            dateFin: annonce.dateExpiration,
            isActive: annonce.estPremiumAnnonce && annonce.dateExpiration > new Date(),
            remainingDays: annonce.estPremiumAnnonce ? 
                Math.ceil((annonce.dateExpiration - new Date()) / (1000 * 60 * 60 * 24)) : 0
        };

        res.status(200).json({
            success: true,
            boost
        });

    } catch (error) {
        logger.error('Erreur getAnnonceBoosts:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
};

// Webhook Monet Bill pour les boosts
exports.handleWebhook = async (req, res) => {
    try {
        // Pour l'instant, on simule le webhook
        // Dans un vrai système, on vérifierait la signature et traiterait les événements
        res.status(200).json({ success: true });
    } catch (error) {
        logger.error('Erreur webhook boost:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
}; 