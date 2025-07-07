const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    planType: {
        type: String,
        enum: ['basic', 'pro', 'enterprise'],
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'expired', 'pending'],
        default: 'pending'
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: {
        type: Date,
        required: true
    },
    price: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'EUR'
    },
    paymentMethod: {
        type: String,
        enum: ['monet_bill', 'card', 'mobile_money'],
        required: true
    },
    transactionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    },
    autoRenew: {
        type: Boolean,
        default: true
    },
    features: {
        maxAnnonces: { type: Number, default: 0 },
        prioritySupport: { type: Boolean, default: false },
        analytics: { type: Boolean, default: false },
        customBranding: { type: Boolean, default: false },
        apiAccess: { type: Boolean, default: false }
    },
    monetBillData: {
        subscriptionId: String,
        customerId: String,
        webhookData: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: true
});

// Index pour les requêtes fréquentes
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ endDate: 1, status: 'active' });

// Méthode pour vérifier si l'abonnement est actif
subscriptionSchema.methods.isActive = function() {
    return this.status === 'active' && this.endDate > new Date();
};

// Méthode pour obtenir les features du plan
subscriptionSchema.methods.getFeatures = function() {
    const planFeatures = {
        basic: {
            maxAnnonces: 10,
            prioritySupport: false,
            analytics: false,
            customBranding: false,
            apiAccess: false
        },
        pro: {
            maxAnnonces: 50,
            prioritySupport: true,
            analytics: true,
            customBranding: false,
            apiAccess: false
        },
        enterprise: {
            maxAnnonces: -1, // Illimité
            prioritySupport: true,
            analytics: true,
            customBranding: true,
            apiAccess: true
        }
    };
    
    return planFeatures[this.planType] || planFeatures.basic;
};

module.exports = mongoose.model('Subscription', subscriptionSchema); 