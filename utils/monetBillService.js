const axios = require('axios');
const logger = require('./logger');

class MonetBillService {
    constructor() {
        this.apiKey = process.env.MONET_BILL_API_KEY;
        this.secretKey = process.env.MONET_BILL_SECRET_KEY;
        this.baseURL = process.env.MONET_BILL_BASE_URL || 'https://api.monetbill.com';
        this.webhookSecret = process.env.MONET_BILL_WEBHOOK_SECRET;
    }

    // Initialiser un paiement
    async createPayment(paymentData) {
        try {
            const payload = {
                amount: paymentData.amount,
                currency: paymentData.currency || 'EUR',
                description: paymentData.description,
                customer_email: paymentData.customerEmail,
                customer_name: paymentData.customerName,
                customer_phone: paymentData.customerPhone,
                return_url: paymentData.returnUrl,
                cancel_url: paymentData.cancelUrl,
                webhook_url: paymentData.webhookUrl,
                metadata: {
                    type: paymentData.type, // 'subscription' ou 'boost'
                    userId: paymentData.userId,
                    planType: paymentData.planType,
                    annonceId: paymentData.annonceId,
                    boostType: paymentData.boostType
                }
            };

            const response = await axios.post(`${this.baseURL}/api/v1/payments`, payload, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                paymentId: response.data.payment_id,
                paymentUrl: response.data.payment_url,
                data: response.data
            };
        } catch (error) {
            logger.error('Erreur Monet Bill createPayment:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    // Vérifier le statut d'un paiement
    async checkPaymentStatus(paymentId) {
        try {
            const response = await axios.get(`${this.baseURL}/api/v1/payments/${paymentId}`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return {
                success: true,
                status: response.data.status,
                data: response.data
            };
        } catch (error) {
            logger.error('Erreur Monet Bill checkPaymentStatus:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    // Créer un abonnement récurrent
    async createSubscription(subscriptionData) {
        try {
            const payload = {
                amount: subscriptionData.amount,
                currency: subscriptionData.currency || 'EUR',
                description: subscriptionData.description,
                customer_email: subscriptionData.customerEmail,
                customer_name: subscriptionData.customerName,
                interval: subscriptionData.interval || 'monthly', // monthly, yearly
                return_url: subscriptionData.returnUrl,
                cancel_url: subscriptionData.cancelUrl,
                webhook_url: subscriptionData.webhookUrl,
                metadata: {
                    type: 'subscription',
                    userId: subscriptionData.userId,
                    planType: subscriptionData.planType
                }
            };

            const response = await axios.post(`${this.baseURL}/api/v1/subscriptions`, payload, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                subscriptionId: response.data.subscription_id,
                subscriptionUrl: response.data.subscription_url,
                data: response.data
            };
        } catch (error) {
            logger.error('Erreur Monet Bill createSubscription:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    // Annuler un abonnement
    async cancelSubscription(subscriptionId) {
        try {
            const response = await axios.post(`${this.baseURL}/api/v1/subscriptions/${subscriptionId}/cancel`, {}, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return {
                success: true,
                data: response.data
            };
        } catch (error) {
            logger.error('Erreur Monet Bill cancelSubscription:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    // Vérifier la signature du webhook
    verifyWebhookSignature(payload, signature) {
        const crypto = require('crypto');
        const expectedSignature = crypto
            .createHmac('sha256', this.webhookSecret)
            .update(JSON.stringify(payload))
            .digest('hex');
        
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    }

    // Traiter un webhook
    async processWebhook(payload, signature) {
        try {
            // Vérifier la signature
            if (!this.verifyWebhookSignature(payload, signature)) {
                logger.error('Signature webhook Monet Bill invalide');
                return { success: false, error: 'Signature invalide' };
            }

            const { event_type, payment_id, subscription_id, status, metadata } = payload;

            logger.info(`Webhook Monet Bill reçu: ${event_type} - Status: ${status}`);

            return {
                success: true,
                eventType: event_type,
                paymentId: payment_id,
                subscriptionId: subscription_id,
                status: status,
                metadata: metadata
            };
        } catch (error) {
            logger.error('Erreur traitement webhook Monet Bill:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Obtenir les méthodes de paiement disponibles
    async getPaymentMethods() {
        try {
            const response = await axios.get(`${this.baseURL}/api/v1/payment-methods`, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                }
            });

            return {
                success: true,
                methods: response.data.methods
            };
        } catch (error) {
            logger.error('Erreur Monet Bill getPaymentMethods:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message
            };
        }
    }
}

module.exports = new MonetBillService(); 