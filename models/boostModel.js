const mongoose = require('mongoose');

const boostSchema = new mongoose.Schema({
    annonceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Annonce',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    boostType: {
        type: String,
        enum: ['standard', 'premium', 'ultimate'],
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'expired', 'cancelled', 'pending'],
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
    features: {
        duration: { type: Number, required: true }, // Durée en jours
        priorityPosition: { type: Boolean, default: false },
        featuredBadge: { type: Boolean, default: false },
        emailPromotion: { type: Boolean, default: false },
        socialMediaPromotion: { type: Boolean, default: false }
    },
    monetBillData: {
        boostId: String,
        customerId: String,
        webhookData: mongoose.Schema.Types.Mixed
    },
    analytics: {
        views: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 },
        applications: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Index pour les requêtes fréquentes
boostSchema.index({ annonceId: 1, status: 1 });
boostSchema.index({ endDate: 1, status: 'active' });
boostSchema.index({ 'features.priorityPosition': 1, status: 'active' });

// Méthode pour vérifier si le boost est actif
boostSchema.methods.isActive = function() {
    return this.status === 'active' && this.endDate > new Date();
};

// Méthode pour obtenir les features du boost
boostSchema.methods.getFeatures = function() {
    const boostFeatures = {
        standard: {
            duration: 7,
            priorityPosition: true,
            featuredBadge: false,
            emailPromotion: false,
            socialMediaPromotion: false
        },
        premium: {
            duration: 14,
            priorityPosition: true,
            featuredBadge: true,
            emailPromotion: false,
            socialMediaPromotion: false
        },
        ultimate: {
            duration: 30,
            priorityPosition: true,
            featuredBadge: true,
            emailPromotion: true,
            socialMediaPromotion: true
        }
    };
    
    return boostFeatures[this.boostType] || boostFeatures.standard;
};

// Méthode pour calculer la durée restante
boostSchema.methods.getRemainingDays = function() {
    if (!this.isActive()) return 0;
    const now = new Date();
    const remaining = this.endDate - now;
    return Math.ceil(remaining / (1000 * 60 * 60 * 24));
};

module.exports = mongoose.model('Boost', boostSchema); 