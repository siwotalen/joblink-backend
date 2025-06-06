const mongoose = require('mongoose');

const annonceSchema = new mongoose.Schema({
  titre: {
    type: String,
    required: [true, 'Le titre de l\'annonce est requis.'],
    trim: true,
    maxlength: [100, 'Le titre ne peut pas dépasser 100 caractères.'],
  },
  description: {
    type: String,
    required: [true, 'La description de l\'annonce est requise.'],
    trim: true,
    maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères.'],
  },
  categorieId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Categorie',
    required: [true, 'La catégorie est requise.'],
  },
  employeurId: { // L'utilisateur qui a posté l'annonce (doit avoir le rôle 'employeur')
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  typeContrat: { // Ex: 'CDD', 'CDI', 'Mission ponctuelle', 'Stage'
    type: String,
    // enum: ['CDD', 'CDI', 'MISSION', 'STAGE', 'FREELANCE'], // Si vous voulez limiter les options
    trim: true,
  },
  localisation: {
    adresseTextuelle: { type: String, trim: true }, // Ex: "Rue de la poste, Akwa, Douala" (garder pour affichage)
    ville: { type: String, required: [true, 'La ville est requise.'], trim: true },
    quartier: { type: String, trim: true }, // Optionnel
       // Champ GeoJSON pour les requêtes géospatiales
    point: { 
        type: {
            type: String,
            enum: ['Point'], // Type GeoJSON 'Point'
            required: true,
            default: 'Point'
        },
        coordinates: { // [longitude, latitude] -- IMPORTANT: longitude d'abord !
            type: [Number], 
            required: true,
            // index: '2dsphere' // L'index sera créé plus bas pour plus de clarté
        }
    }
  },
  remuneration: {
    montant: { type: Number, required: [true, 'Le montant de la rémunération est requis.'] },
    devise: { type: String, default: 'FCFA' },
    periode: { 
      type: String, 
      enum: ['heure', 'jour', 'semaine', 'mois', 'prestation'], 
      default: 'prestation',
      required: [true, 'La période de rémunération est requise.']
    },
  },
  dateDebutSouhaitee: { type: Date },
  dureeMission: { // Structure pour la durée
      valeur: { type: Number, min: 1 },
      unite: { type: String, enum: ['jours', 'semaines', 'mois', 'annees'] }
  },
  dateFinPrestationEstimee: { type: Date }, // Calculé automatiquement
  competencesRequises: [{ type: String, trim: true }], // Compétences spécifiques pour le poste
  estUrgent: { type: Boolean, default: false },
  
  // Champs liés à la monétisation et visibilité
  estPremiumAnnonce: { type: Boolean, default: false }, // Si l'annonce elle-même est boostée (payant pour l'employeur)
  statut: {
    type: String,
    enum: ['active', 'inactive', 'expiree', 'supprimee', 'en_attente_moderation'],
    default: 'active', // Ou 'en_attente_moderation' si vous voulez modérer toutes les annonces
  },
  dateExpiration: { type: Date }, // Pour que les annonces ne restent pas indéfiniment
  nombreVues: { type: Number, default: 0 },

  // Documents joints par l'employeur (ex: description de poste détaillée en PDF)
 documentsJointsAnnonce: [{
    nomOriginal: String,
    nomFichierServeur: String,
    cheminAcces: String,
    typeMime: String,
    taille: Number,
    dateUpload: { type: Date, default: Date.now }
}],

}, {
  timestamps: true,
});

// Index pour améliorer les recherches fréquentes
annonceSchema.index({ titre: 'text', description: 'text', 'localisation.ville': 'text' }); // Pour la recherche full-text
annonceSchema.index({ categorieId: 1 });
annonceSchema.index({ employeurId: 1 });
annonceSchema.index({ 'remuneration.montant': 1 });
annonceSchema.index({ statut: 1, dateExpiration: 1 });
annonceSchema.index({ 'localisation.point': '2dsphere' });

// Logique pour la date d'expiration et date de fin de prestation estimée
annonceSchema.pre('save', function(next) {
     // Calcul de dateExpiration de l'annonce
  if (this.isNew && !this.dateExpiration) {
    const DUREE_VALIDITE_ANNONCE_JOURS = process.env.DUREE_VALIDITE_ANNONCE_GRATUIT_JOURS; // Configurable
    this.dateExpiration = new Date(Date.now() + DUREE_VALIDITE_ANNONCE_JOURS * 24 * 60 * 60 * 1000);
  }

    // Calcul de dateFinPrestationEstimee
    if (this.isModified('dateDebutSouhaitee') || this.isModified('dureeMission') || (this.isNew && this.dateDebutSouhaitee && this.dureeMission && this.dureeMission.valeur && this.dureeMission.unite)) {
        if (this.dateDebutSouhaitee && this.dureeMission && this.dureeMission.valeur && this.dureeMission.unite) {
            let dateFin = new Date(this.dateDebutSouhaitee);
            const valeur = this.dureeMission.valeur;
            switch (this.dureeMission.unite) {
                case 'jours': dateFin.setDate(dateFin.getDate() + valeur); break;
                case 'semaines': dateFin.setDate(dateFin.getDate() + (valeur * 7)); break;
                case 'mois': dateFin.setMonth(dateFin.getMonth() + valeur); break;
                case 'annees': dateFin.setFullYear(dateFin.getFullYear() + valeur); break;
            }
            dateFin.setDate(dateFin.getDate() + 1); // Jour de surplus
            this.dateFinPrestationEstimee = dateFin;
        } else {
            this.dateFinPrestationEstimee = undefined;
        }
    }
    next();
});



module.exports = mongoose.model('Annonce', annonceSchema);