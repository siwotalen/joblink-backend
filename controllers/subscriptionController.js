const Subscription = require('../models/subscriptionModel');
const Transaction = require('../models/transactionModel');
const User = require('../models/usersModel');
const monetBillService = require('../utils/monetBillService');
const { createNotificationJobLink } = require('../utils/notificationManager');
const logger = require('../utils/logger');
const AppError = require('../utils/appError');

// Plans disponibles
const SUBSCRIPTION_PLANS = {
    basic: {
        name: 'Basic',
        price: 5,
        currency: 'EUR',
        interval: 'monthly',
        features: {
            maxAnnonces: 10,
            prioritySupport: false,
            analytics: false,
            customBranding: false,
            apiAccess: false
        }
    },
    pro: {
        name: 'Pro',
        price: 15,
        currency: 'EUR',
        interval: 'monthly',
        features: {
            maxAnnonces: 50,
            prioritySupport: true,
            analytics: true,
            customBranding: false,
            apiAccess: false
        }
    },
    enterprise: {
        name: 'Enterprise',
        price: 30,
        currency: 'EUR',
        interval: 'monthly',
        features: {
            maxAnnonces: -1, // Illimité
            prioritySupport: true,
            analytics: true,
            customBranding: true,
            apiAccess: true
        }
    }
};

// Obtenir tous les plans disponibles
exports.getSubscriptionPlans = async (req, res) => {
    try {
        res.status(200).json({
            success: true,
            plans: SUBSCRIPTION_PLANS
        });
    } catch (error) {
        logger.error('Erreur getSubscriptionPlans:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
};

// Créer un abonnement
exports.createSubscription = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { planType } = req.body;

        if (!SUBSCRIPTION_PLANS[planType]) {
            return res.status(400).json({
                success: false,
                message: 'Plan d\'abonnement invalide'
            });
        }

        const plan = SUBSCRIPTION_PLANS[planType];
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
        }

        // Vérifier si l'utilisateur a déjà un abonnement actif
        const existingSubscription = await Subscription.findOne({
            userId,
            status: 'active'
        });

        if (existingSubscription) {
            return res.status(400).json({
                success: false,
                message: 'Vous avez déjà un abonnement actif'
            });
        }

        // Créer l'abonnement en base
        const subscription = new Subscription({
            userId,
            planType,
            price: plan.price,
            currency: plan.currency,
            paymentMethod: 'monet_bill',
            features: plan.features,
            endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 jours
        });

        await subscription.save();

        // Créer la transaction Monet Bill
        const paymentData = {
            amount: plan.price,
            currency: plan.currency,
            description: `Abonnement ${plan.name} - JobLink`,
            customerEmail: user.email,
            customerName: `${user.prenom} ${user.nom}`,
            customerPhone: user.phone,
            returnUrl: `${process.env.FRONTEND_URL}/subscription/success`,
            cancelUrl: `${process.env.FRONTEND_URL}/subscription/cancel`,
            webhookUrl: `${process.env.BACKEND_URL}/api/subscriptions/webhook`,
            type: 'subscription',
            userId: userId,
            planType: planType
        };

        const monetBillResponse = await monetBillService.createSubscription(paymentData);

        if (!monetBillResponse.success) {
            await subscription.remove();
            return res.status(400).json({
                success: false,
                message: monetBillResponse.error || 'Erreur lors de la création du paiement'
            });
        }

        // Mettre à jour l'abonnement avec les données Monet Bill
        subscription.monetBillData = {
            subscriptionId: monetBillResponse.subscriptionId,
            customerId: monetBillResponse.data.customer_id
        };
        await subscription.save();

        // Créer une transaction
        const transaction = new Transaction({
            userId,
            typeProduit: 'abonnement',
            montant: plan.price,
            devise: plan.currency,
            methodePaiementSimulee: 'monet_bill',
            statut: 'initiee',
            referenceExternePaiement: monetBillResponse.paymentId,
            detailsProduit: {
                planType: planType,
                planName: plan.name,
                features: plan.features
            }
        });

        await transaction.save();

        // Lier la transaction à l'abonnement
        subscription.transactionId = transaction._id;
        await subscription.save();

        res.status(200).json({
            success: true,
            message: 'Abonnement créé avec succès',
            subscription: {
                id: subscription._id,
                planType: subscription.planType,
                status: subscription.status,
                paymentUrl: monetBillResponse.subscriptionUrl
            }
        });

    } catch (error) {
        logger.error('Erreur createSubscription:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
};

// Obtenir l'abonnement actuel de l'utilisateur
exports.getCurrentSubscription = async (req, res) => {
    try {
        const userId = req.user.userId;

        const subscription = await Subscription.findOne({
            userId,
            status: { $in: ['active', 'pending'] }
        }).populate('transactionId');

        if (!subscription) {
            return res.status(200).json({
                success: true,
                subscription: null
            });
        }

        res.status(200).json({
            success: true,
            subscription: {
                id: subscription._id,
                planType: subscription.planType,
                status: subscription.status,
                startDate: subscription.startDate,
                endDate: subscription.endDate,
                price: subscription.price,
                currency: subscription.currency,
                features: subscription.features,
                isActive: subscription.isActive(),
                remainingDays: subscription.getRemainingDays()
            }
        });

    } catch (error) {
        logger.error('Erreur getCurrentSubscription:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
};

// Annuler un abonnement
exports.cancelSubscription = async (req, res) => {
    try {
        const userId = req.user.userId;

        const subscription = await Subscription.findOne({
            userId,
            status: 'active'
        });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Aucun abonnement actif trouvé'
            });
        }

        // Annuler chez Monet Bill
        if (subscription.monetBillData?.subscriptionId) {
            const cancelResponse = await monetBillService.cancelSubscription(
                subscription.monetBillData.subscriptionId
            );

            if (!cancelResponse.success) {
                logger.error('Erreur annulation Monet Bill:', cancelResponse.error);
            }
        }

        // Marquer comme annulé
        subscription.status = 'cancelled';
        subscription.autoRenew = false;
        await subscription.save();

        // Notification
        await createNotificationJobLink(
            userId,
            'ABONNEMENT_ANNULE',
            'Votre abonnement premium a été annulé. Vous pouvez le réactiver à tout moment.',
            '/subscription'
        );

        res.status(200).json({
            success: true,
            message: 'Abonnement annulé avec succès'
        });

    } catch (error) {
        logger.error('Erreur cancelSubscription:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
};

// Webhook Monet Bill
exports.handleWebhook = async (req, res) => {
    try {
        const signature = req.headers['x-monetbill-signature'];
        const payload = req.body;

        const webhookResult = await monetBillService.processWebhook(payload, signature);

        if (!webhookResult.success) {
            return res.status(400).json({
                success: false,
                message: webhookResult.error
            });
        }

        const { eventType, status, metadata } = webhookResult;

        if (eventType === 'subscription.payment_succeeded') {
            await handleSubscriptionPaymentSuccess(metadata, status);
        } else if (eventType === 'subscription.payment_failed') {
            await handleSubscriptionPaymentFailed(metadata, status);
        } else if (eventType === 'subscription.cancelled') {
            await handleSubscriptionCancelled(metadata);
        }

        res.status(200).json({ success: true });

    } catch (error) {
        logger.error('Erreur webhook subscription:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur serveur'
        });
    }
};

// Gérer le succès d'un paiement d'abonnement
async function handleSubscriptionPaymentSuccess(metadata, status) {
    try {
        const { userId, planType } = metadata;

        const subscription = await Subscription.findOne({
            userId,
            planType,
            status: 'pending'
        });

        if (subscription) {
            subscription.status = 'active';
            await subscription.save();

            // Notification
            await createNotificationJobLink(
                userId,
                'ABONNEMENT_ACTIVE',
                `Votre abonnement ${planType} est maintenant actif ! Profitez de toutes les fonctionnalités premium.`,
                '/dashboard'
            );
        }
    } catch (error) {
        logger.error('Erreur handleSubscriptionPaymentSuccess:', error);
    }
}

// Gérer l'échec d'un paiement d'abonnement
async function handleSubscriptionPaymentFailed(metadata, status) {
    try {
        const { userId, planType } = metadata;

        const subscription = await Subscription.findOne({
            userId,
            planType,
            status: 'pending'
        });

        if (subscription) {
            subscription.status = 'cancelled';
            await subscription.save();

            // Notification
            await createNotificationJobLink(
                userId,
                'PAIEMENT_ECHOUE',
                'Le paiement de votre abonnement a échoué. Veuillez réessayer.',
                '/subscription'
            );
        }
    } catch (error) {
        logger.error('Erreur handleSubscriptionPaymentFailed:', error);
    }
}

// Gérer l'annulation d'un abonnement
async function handleSubscriptionCancelled(metadata) {
    try {
        const { userId } = metadata;

        const subscription = await Subscription.findOne({
            userId,
            status: 'active'
        });

        if (subscription) {
            subscription.status = 'cancelled';
            subscription.autoRenew = false;
            await subscription.save();

            // Notification
            await createNotificationJobLink(
                userId,
                'ABONNEMENT_ANNULE',
                'Votre abonnement premium a été annulé.',
                '/subscription'
            );
        }
    } catch (error) {
        logger.error('Erreur handleSubscriptionCancelled:', error);
    }
} 