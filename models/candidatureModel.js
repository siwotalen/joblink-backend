const mongoose = require('mongoose');

const candidatureSchema = new mongoose.Schema({
  annonceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Annonce',
    required: [true, 'L\'annonce est requise.'],
  },
  travailleurId: { // L'utilisateur qui postule (doit avoir le rôle 'travailleur')
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Le travailleur est requis.'],
  },
  employeurId: { // L'ID de l'employeur qui a posté l'annonce (pour faciliter les requêtes)
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  lettreMotivation: { // Optionnel
    type: String,
    trim: true,
    maxlength: [1500, 'La lettre de motivation ne peut pas dépasser 1500 caractères.'],
  },
  //autres documents spécifiques à la candidature
  documentsCandidature: [{
    nomFichier: String,
    url: String,
  }],
 statut: {
    type: String,
    enum: ['en_attente', 'vue', 'preselectionnee', 'rejete', 'acceptee', 'terminee_automatiquement', 'terminee_manuellement'], // Statuts plus précis
    default: 'en_attente',
  },
  dateCandidature: {
    type: Date,
    default: Date.now,
  },
  // Champ pour noter quand l'employeur a mis à jour le statut
  dateMiseAJourStatut: { type: Date }, 
  dateAcceptation: { type: Date }, // Quand la candidature est passée à 'acceptee'
  dateFinPrestationEstimeeCandidature: { type: Date }, // Copiée de l'annonce lors de l'acceptation
  datePrestationEffectivementTerminee: { type: Date }, // Quand le cron la marque terminée ou l'employeur manuellement
  avisPeriodeOuverteJusquau: { type: Date }, // datePrestationEffectivementTerminee + 7 jours
  avisEmployeurLaisse: { type: Boolean, default: false },
  avisTravailleurLaisse: { type: Boolean, default: false },
}, {
  timestamps: true,
});

// s'Assurer qu'un travailleur ne peut postuler qu'une seule fois à la même annonce
candidatureSchema.index({ annonceId: 1, travailleurId: 1 }, { unique: true });
candidatureSchema.index({ employeurId: 1, statut: 1 }); // Pour que l'employeur filtre ses candidatures
candidatureSchema.index({ travailleurId: 1 }); // Pour que le travailleur voie ses candidatures

module.exports = mongoose.model('Candidature', candidatureSchema);