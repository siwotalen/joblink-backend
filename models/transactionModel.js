const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: { // L'utilisateur qui effectue le paiement
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  montant: {
    type: Number,
    required: [true, 'Le montant de la transaction est requis.'],
  },
  devise: {
    type: String,
    default: 'FCFA',
    required: true,
  },
  description: { // Ex: "Abonnement Premium Employeur - 1 Mois", "Boost Annonce XYZ"
    type: String,
    required: [true, 'La description de la transaction est requise.'],
  },
  typeProduit: { // Ce pour quoi l'utilisateur paie
    type: String,
    enum: ['abonnement_premium_employeur', 'abonnement_premium_travailleur', 'boost_annonce_specifique'],
    required: true,
  },
  produitId: { // Optionnel: ID de l'entité concernée (ex: annonceId pour un boost)
    type: mongoose.Schema.Types.ObjectId,
    // refPath: 'typeProduit' // Plus complexe si typeProduit ne mappe pas directement aux noms de modèles
  },
  methodePaiementSimulee: { // Dans un vrai système, ce serait 'Orange Money', 'MTN MoMo', 'Carte de Crédit'
    type: String,
    default: 'Simulation JobLink',
  },
  referenceExternePaiement: { // ID de transaction de la passerelle de paiement (pour un vrai système)
    type: String,
    index: true, // Utile pour la réconciliation
  },
  statut: {
    type: String,
    enum: ['initiee', 'en_attente_paiement', 'reussie', 'echouee', 'annulee', 'remboursee'],
    default: 'initiee',
    required: true,
  },
  metadata: { // Données supplémentaires (ex: détails de l'abonnement choisi, durée)
    type: mongoose.Schema.Types.Mixed,
  },
  dateInitiation: { type: Date, default: Date.now },
  datePaiementEffectif: { type: Date }, // Date à laquelle le statut passe à 'reussie'
  messageErreur: { type: String }, // Si le paiement échoue
}, {
  timestamps: true, // createdAt sera la date d'initiation, updatedAt pour les changements de statut
});

transactionSchema.index({ userId: 1, statut: 1, createdAt: -1 });
transactionSchema.index({ typeProduit: 1, statut: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);