const mongoose = require('mongoose');

const signalementSchema = new mongoose.Schema({
  signaleParUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  cibleType: {
    type: String,
    enum: ['Annonce', 'User'], // Simplifié pour l'instant, 'Message' peut venir plus tard
    required: true,
  },
  cibleId: { // ID de l'annonce ou de l'utilisateur signalé
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'cibleType', // Permet à Mongoose de populer dynamiquement en fonction de cibleType
  },
  raison: { // L'utilisateur choisira parmi une liste ou "Autre"
    type: String,
    enum: [
        'contenu_inapproprie', // Texte, images offensantes, etc.
        'arnaque_potentielle',   // Offre trop belle pour être vraie, demande d'argent suspecte
        'spam_publicite_non_sollicitee',
        'harcelement_comportement_abusif',
        'faux_profil_usurpation_identite',
        'annonce_discriminatoire',
        'probleme_technique_annonce', // Annonce mal formatée, lien cassé etc.
        'autre', // Si 'autre', le commentaire devient plus important
    ],
    required: true,
  },
  commentaire: { // Détails supplémentaires fournis par l'utilisateur qui signale
    type: String,
    trim: true,
    maxlength: 1000,
    required: function() { return this.raison === 'autre'; } // Commentaire requis si raison est 'autre'
  },
  statut: {
    type: String,
    enum: ['nouveau', 'en_cours_examen', 'action_prise_contenu_modifie', 'action_prise_utilisateur_averti', 'action_prise_utilisateur_suspendu', 'action_prise_contenu_supprime', 'rejete_signalement_infonde'],
    default: 'nouveau',
  },
  // Pour la gestion admin
  adminIdTraitant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  notesAdmin: { type: String, trim: true, default: '' },
  dateTraitement: { type: Date, default: null },
}, {
  timestamps: true, // createdAt = date du signalement
});

// Pour éviter qu'un utilisateur signale la même cible pour la même raison plusieurs fois (peut être trop restrictif)
// signalementSchema.index({ signaleParUserId: 1, cibleId: 1, raison: 1 }, { unique: true });
signalementSchema.index({ statut: 1, createdAt: -1 }); // Pour que l'admin voie les nouveaux signalements
signalementSchema.index({ cibleId: 1, cibleType: 1 }); // Pour retrouver les signalements d'une cible

module.exports = mongoose.model('Signalement', signalementSchema);