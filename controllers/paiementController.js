const Transaction = require('../models/transactionModel');
const User = require('../models/usersModel');
const Annonce = require('../models/annonceModel'); // Si boost d'annonce
const { initierPaiementSchema } = require('../middlewares/validator');
const { createNotificationJobLink } = require('../utils/notificationManager'); // Adaptez le chemin
const logger = require('../utils/logger'); // Votre logger Winston
const mongoose = require('mongoose');
const AppError = require('../utils/appError');


// Fonction pour déterminer le montant et la description en fonction du produit
// À externaliser dans un service de configuration de produits/prix si ça devient complexe
const getDetailsProduit = (typeProduit, metadata = {}) => {
    // Ces valeurs devraient venir d'une configuration ou de la base de données
    // Pour la simulation, on les met en dur
    let montant;
    let description;
    let dureeAbonnementMois = 1; // Durée par défaut

    // if (metadata.dureeMois) dureeAbonnementMois = metadata.dureeMois;

    switch (typeProduit) {
        case 'abonnement_premium_employeur':
            montant = parseInt(process.env.PRIX_PREMIUM_EMPLOYEUR_MOIS) || 5000; // Ex: 5000 FCFA / mois
            description = `Abonnement Premium Employeur - ${dureeAbonnementMois} mois`;
            break;
        case 'abonnement_premium_travailleur':
            montant = parseInt(process.env.PRIX_PREMIUM_TRAVAILLEUR_MOIS) || 2000; // Ex: 2000 FCFA / mois
            description = `Abonnement Premium Travailleur - ${dureeAbonnementMois} mois`;
            break;
        // case 'boost_annonce_specifique':
        //     montant = 500; // Ex: 500 FCFA par boost
        //     description = `Boost pour annonce ID ${metadata.produitId}`;
        //     break;
        default:
            throw new AppError('Type de produit inconnu pour le paiement.', 400);
    }
    return { montant, description, dureeAbonnementMois };
};

exports.initierPaiementSimule = async (req, res, next) => {
    try {
        const { error, value } = initierPaiementSchema.validate(req.body);
        if (error) {
            return next(new AppError(error.details[0].message, 400));
        }

        const { typeProduit, produitId /*, metadata: requestMetadata */ } = value;
        const userId = req.user.userId;

        const utilisateur = await User.findById(userId);
        if (!utilisateur) return next(new AppError('Utilisateur non trouvé.', 404));

        // Vérifier si l'utilisateur n'est pas déjà premium avec un abonnement en cours pour le même type
        if (typeProduit === 'abonnement_premium_employeur' && utilisateur.typeAbonnement === 'premium_employeur' && utilisateur.dateFinAbonnement > new Date()) {
             return next(new AppError('Vous avez déjà un abonnement Premium Employeur actif.', 400));
        }
        if (typeProduit === 'abonnement_premium_travailleur' && utilisateur.typeAbonnement === 'premium_travailleur' && utilisateur.dateFinAbonnement > new Date()) {
             return next(new AppError('Vous avez déjà un abonnement Premium Travailleur actif.', 400));
        }

        const { montant, description, dureeAbonnementMois } = getDetailsProduit(typeProduit /*, requestMetadata */);

        const transaction = new Transaction({
            userId,
            montant,
            devise: 'FCFA',
            description,
            typeProduit,
            produitId: produitId || null,
            statut: 'initiee', // Pour la simulation, on la passera vite à 'reussie'
            metadata: { 
                roleInitialUtilisateur: utilisateur.role, // Utile pour savoir quel type de premium activer
                dureeAbonnementMois: dureeAbonnementMois,
                // ...requestMetadata
            }
        });
        await transaction.save();

        // --- SIMULATION DU PROCESSUS DE PAIEMENT ---
        // Dans un vrai système, ici on redirigerait vers la passerelle de paiement
        // ou on attendrait un callback/webhook.
        // Pour la simulation, on va directement "confirmer" le paiement.
        
        // Appelons une fonction qui traite le succès du paiement
        // On pourrait la mettre dans une autre route /webhook/paiement-simule-confirme
        // mais pour simplifier, on l'appelle directement ici après un court délai simulé.

        logger.info(`[PAIEMENT_SIMULE] Transaction ${transaction._id} initiée pour ${typeProduit}. Redirection simulée vers passerelle...`);

        // Retourner une réponse à l'utilisateur pour qu'il "aille payer"
        res.status(201).json({
            success: true,
            message: 'Initiation de paiement enregistrée. Vous allez être redirigé pour finaliser (simulation).',
            transactionId: transaction._id,
            detailsPaiement: { // Infos pour la page de paiement simulée du frontend
                montant: transaction.montant,
                devise: transaction.devise,
                description: transaction.description,
                // URL de confirmation simulée que le frontend appellera
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
    let nouvelleDateFinAbonnement = utilisateur.dateFinAbonnement || new Date(); // Si pas de date, commencer à partir de maintenant

    if (transaction.typeProduit === 'abonnement_premium_employeur' && utilisateur.role === 'employeur') {
        nouveauTypeAbonnement = 'premium_employeur';
    } else if (transaction.typeProduit === 'abonnement_premium_travailleur' && utilisateur.role === 'travailleur') {
        nouveauTypeAbonnement = 'premium_travailleur';
    } else if (transaction.typeProduit.startsWith('abonnement_')) {
        logger.warn(`[APPLIQUER_BENEFICES] Incohérence rôle/type d'abonnement pour ${transaction.userId}, type: ${transaction.typeProduit}, rôle: ${utilisateur.role}`);
        // Ne pas changer le type d'abonnement si le rôle ne correspond pas
    }
    // else if (transaction.typeProduit === 'boost_annonce_specifique' && transaction.produitId) {
    //     await Annonce.findByIdAndUpdate(transaction.produitId, { $set: { estPremiumAnnonce: true, dateBoostExpiration: ... } });
    //     // Pas de changement d'abonnement utilisateur pour un simple boost
    // }

    // Calculer la nouvelle date de fin si c'est un abonnement
    if (transaction.typeProduit.startsWith('abonnement_') && transaction.metadata && transaction.metadata.dureeAbonnementMois) {
        // Si l'utilisateur a déjà un abonnement actif du même type, on prolonge
        if (utilisateur.typeAbonnement === nouveauTypeAbonnement && utilisateur.dateFinAbonnement > new Date()) {
            nouvelleDateFinAbonnement = new Date(utilisateur.dateFinAbonnement);
        } else { // Sinon, on part de la date actuelle
            nouvelleDateFinAbonnement = new Date();
        }
        nouvelleDateFinAbonnement.setMonth(nouvelleDateFinAbonnement.getMonth() + transaction.metadata.dureeAbonnementMois);
    }

    // Mettre à jour l'utilisateur SEULEMENT si un changement d'abonnement est pertinent
    if (nouveauTypeAbonnement !== 'gratuit' && transaction.typeProduit.startsWith('abonnement_')) {
        await User.findByIdAndUpdate(utilisateur._id, {
            typeAbonnement: nouveauTypeAbonnement,
            dateFinAbonnement: nouvelleDateFinAbonnement,
        });

        await createNotificationJobLink(
            utilisateur._id,
            'ABONNEMENT_PREMIUM_ACTIVE_UTILISATEUR',
            `Félicitations ! Votre ${transaction.description} est maintenant actif jusqu'au ${nouvelleDateFinAbonnement.toLocaleDateString('fr-FR')}.`,
            '/profil/moi/abonnement', // Lien vers la gestion de l'abonnement
            { nouveauAbonnement: nouveauTypeAbonnement, dateFin: nouvelleDateFinAbonnement.toISOString() }
        );
        logger.info(`[APPLIQUER_BENEFICES] Abonnement ${nouveauTypeAbonnement} activé pour ${utilisateur.email} jusqu'au ${nouvelleDateFinAbonnement}.`);
        return true;
    }
    return false; // Aucun bénéfice d'abonnement appliqué
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

        // S'assurer que la transaction appartient à l'utilisateur connecté (important!)
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
        // transaction.referenceExternePaiement = `SIMUL_${Date.now()}`; // Pour la simulation
        await transaction.save();

        logger.info(`[PAIEMENT_SIMULE] Transaction ${transaction._id} confirmée comme réussie.`);

        // Appliquer les bénéfices (ex: mise à niveau de l'abonnement)
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

// Fonction pour appliquer les bénéfices d'une transaction réussie
async function appliquerBeneficesTransaction(transaction) {
    const utilisateur = await User.findById(transaction.userId);
    if (!utilisateur) {
        logger.error(`[APPLIQUER_BENEFICES] Utilisateur ${transaction.userId} non trouvé pour transaction ${transaction._id}`);
        return false;
    }

    let nouveauTypeAbonnement = utilisateur.typeAbonnement;
    let nouvelleDateFinAbonnement = utilisateur.dateFinAbonnement || new Date(); // Si pas de date, commencer à partir de maintenant

    if (transaction.typeProduit === 'abonnement_premium_employeur' && utilisateur.role === 'employeur') {
        nouveauTypeAbonnement = 'premium_employeur';
    } else if (transaction.typeProduit === 'abonnement_premium_travailleur' && utilisateur.role === 'travailleur') {
        nouveauTypeAbonnement = 'premium_travailleur';
    } else if (transaction.typeProduit.startsWith('abonnement_')) {
        logger.warn(`[APPLIQUER_BENEFICES] Incohérence rôle/type d'abonnement pour ${transaction.userId}, type: ${transaction.typeProduit}, rôle: ${utilisateur.role}`);
        // Ne pas changer le type d'abonnement si le rôle ne correspond pas
    }
    // else if (transaction.typeProduit === 'boost_annonce_specifique' && transaction.produitId) {
    //     await Annonce.findByIdAndUpdate(transaction.produitId, { $set: { estPremiumAnnonce: true, dateBoostExpiration: ... } });
    //     // Pas de changement d'abonnement utilisateur pour un simple boost
    // }

    // Calculer la nouvelle date de fin si c'est un abonnement
    if (transaction.typeProduit.startsWith('abonnement_') && transaction.metadata && transaction.metadata.dureeAbonnementMois) {
        // Si l'utilisateur a déjà un abonnement actif du même type, on prolonge
        if (utilisateur.typeAbonnement === nouveauTypeAbonnement && utilisateur.dateFinAbonnement > new Date()) {
            nouvelleDateFinAbonnement = new Date(utilisateur.dateFinAbonnement);
        } else { // Sinon, on part de la date actuelle
            nouvelleDateFinAbonnement = new Date();
        }
        nouvelleDateFinAbonnement.setMonth(nouvelleDateFinAbonnement.getMonth() + transaction.metadata.dureeAbonnementMois);
    }

    // Mettre à jour l'utilisateur SEULEMENT si un changement d'abonnement est pertinent
    if (nouveauTypeAbonnement !== 'gratuit' && transaction.typeProduit.startsWith('abonnement_')) {
        await User.findByIdAndUpdate(utilisateur._id, {
            typeAbonnement: nouveauTypeAbonnement,
            dateFinAbonnement: nouvelleDateFinAbonnement,
        });

        await createNotificationJobLink(
            utilisateur._id,
            'ABONNEMENT_PREMIUM_ACTIVE_UTILISATEUR',
            `Félicitations ! Votre ${transaction.description} est maintenant actif jusqu'au ${nouvelleDateFinAbonnement.toLocaleDateString('fr-FR')}.`,
            '/profil/moi/abonnement', // Lien vers la gestion de l'abonnement
            { nouveauAbonnement: nouveauTypeAbonnement, dateFin: nouvelleDateFinAbonnement.toISOString() }
        );
        logger.info(`[APPLIQUER_BENEFICES] Abonnement ${nouveauTypeAbonnement} activé pour ${utilisateur.email} jusqu'au ${nouvelleDateFinAbonnement}.`);
        return true;
    }
    return false; // Aucun bénéfice d'abonnement appliqué
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

        // S'assurer que la transaction appartient à l'utilisateur connecté (important!)
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
        // transaction.referenceExternePaiement = `SIMUL_${Date.now()}`; // Pour la simulation
        await transaction.save();

        logger.info(`[PAIEMENT_SIMULE] Transaction ${transaction._id} confirmée comme réussie.`);

        // Appliquer les bénéfices (ex: mise à niveau de l'abonnement)
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