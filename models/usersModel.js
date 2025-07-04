const mongoose = require('mongoose');

const plageHoraireSchema = new mongoose.Schema({
    debut: { type: String, trim: true }, // ex: "08:00"
    fin: { type: String, trim: true }    // ex: "17:00"
}, { _id: false });

const experienceSchema = new mongoose.Schema({
    domaine: { type: String, required: true, trim: true },
    annees: { type: Number, required: true, min: 0 }
}, { _id: false });
// Sous-schéma pour les informations spécifiques au profil Travailleur
const profilTravailleurSchema = new mongoose.Schema({
  competences: [{ type: String }], // ex: ['Plomberie', 'Cuisine']
  anneesExperience: { type: Number, min: 0 },
      presentation: { // NOUVEAU CHAMP
        type: String,
        trim: true,
        maxlength: [1500, 'La présentation ne peut pas dépasser 1500 caractères.']
    },
  experience: [experienceSchema],
  disponibilite: { // NOUVELLE STRUCTURE
        lundi: [plageHoraireSchema],
        mardi: [plageHoraireSchema],
        mercredi: [plageHoraireSchema],
        jeudi: [plageHoraireSchema],
        vendredi: [plageHoraireSchema],
        samedi: [plageHoraireSchema],
        dimanche: [plageHoraireSchema],
        notes: { type: String, trim: true, maxlength: 255 } // Pour des précisions type "Disponible jours fériés"
    },
  documentsCertifiants: [{ 
      nomOriginal: String, // Nom original du fichier
      nomFichierServeur: String, // Nom du fichier tel que stocké sur le serveur
      cheminAcces: String,   // URL ou chemin relatif pour accéder au fichier
      typeMime: String,
      taille: Number,
      valideParAdmin: { type: Boolean, default: false }, // Si l'admin doit valider
      dateUpload: { type: Date, default: Date.now }
  }],
  noteMoyenne: { type: Number, default: 2, min: 0, max: 5 },
  nombreAvis: { type: Number, default: 2, min: 0 },
  photosPreuveTalent: [{ 
      titre: String, // Titre donné par l'utilisateur
      nomOriginal: String,
      nomFichierServeur: String,
      cheminAcces: String,
      typeMime: String,
      taille: Number,
      dateUpload: { type: Date, default: Date.now }
  }],
  dateDeNaissance: { type: Date },
  // autres champs spécifiques au travailleur
}, { _id: true }); // _id: true car c'est un sous-document

// Sous-schéma pour les informations spécifiques au profil Employeur
const profilEmployeurSchema = new mongoose.Schema({
  nomEntreprise: { type: String },
  secteurActivite: { type: String },
  descriptionEntreprise: { type: String },
  adresseEntreprise: {
    rue: String,
    ville: String,
    quartier: String,
  },
  telephoneEntreprise: { type: String },
  logoEntreprise: {
      nomOriginal: String,
      nomFichierServeur: String,
      cheminAcces: String,
      typeMime: String,
      taille: Number,
  },
  noteMoyenne: { type: Number, default: 0, min: 0, max: 5 },
  nombreAvis: { type: Number, default: 0, min: 0 },
}, { _id: true });

const userSchema = mongoose.Schema({
  email: {
    type: String,
    required: [true, 'email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    minlength: [6, 'email must be at least 6 characters'],
  },
  password: {
    type: String,
    required: [true, 'password is required'],
    trim: true,
    select: false, // Ne pas retourner le mot de passe par défaut
  },
  nom: { type: String, required: true, trim: true }, // Nom de la personne ou contact principal
  prenom: { type: String, trim: true }, // Prénom
  telephone: { type: String, trim: true }, // Numéro de téléphone personnel

  role: {
    type: String,
    enum: ['travailleur', 'employeur', 'moderateur', 'admin'],
    required: [true, 'Le rôle est requis'],
  },
  savedJobs: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Annonce'
    }],
  
  typeAbonnement: {
    type: String,
    enum: ['gratuit', 'premium_travailleur', 'premium_employeur'],
    default: 'gratuit',
  },
  dateFinAbonnement: { type: Date },

   photoDeProfil: {
    nomOriginal: { type: String },
    nomFichierServeur: { type: String },
    cheminAcces: { type: String },   // URL ou chemin relatif
    typeMime: { type: String },
    taille: { type: Number },
  },

  profil: { // Champ polymorphe pour les données spécifiques au rôle
    type: mongoose.Schema.Types.Mixed, // Permet de stocker différents types de profils
    default: {} 
  },

  // Champs que vous aviez déjà et qui sont utiles
  verified: {
    type: Boolean,
    default: false,
  },
  verificationCode: {
    type: String,
    select: false,
  },
  verificationCodeValidation: {
    type: Date,
    select: false,
  },
  forgotPasswordCode: {
    type: String,
    select: false,
  },
  forgotPasswordCodeValidation: {
    type: Date, // Était Number, Date est plus cohérent
    select: false,
  },
  estActif: { type: Boolean, default: true }, // Pour la suspension de compte
  // Pour stocker le profil spécifique en fonction du rôle
  // Ces champs ne seront remplis que si le rôle correspond
  // Alternative à 'profil: Mixed', plus structurée si on n'utilise pas la discrimination Mongoose tout de suite
  // profilTravailleur: profilTravailleurSchema,
  // profilEmployeur: profilEmployeurSchema,
}, {
  timestamps: true,
  // Option pour la discrimination si on choisit cette voie plus tard
  // discriminatorKey: 'role', 
});
userSchema.index(
  { 'profil.localisation.point': '2dsphere' },
  { partialFilterExpression: { role: 'travailleur', 'profil.localisation.point': { $exists: true } } }
);

// Middleware pour peupler le bon sous-document profil en fonction du rôle si on utilise profil: Mixed
// Ou pour s'assurer que seul le bon profil est rempli si on utilise profilTravailleurSchema/profilEmployeurSchema
userSchema.pre('save', function(next) {
  if (this.isModified('role') || this.isNew) {
    if (this.role === 'travailleur' && (!this.profil || this.profil.constructor.name !== 'Object' || Object.keys(this.profil).length === 0)) {
      // Initialiser un objet vide pour le profil travailleur si ce n'est pas déjà fait.
      // Les données spécifiques seront ajoutées via une autre route (ex: /api/profil/travailleur)
      // ou lors de l'inscription si on demande plus d'infos.
      // Pour l'instant, on se contente de `Mixed` et on laisse l'application gérer le contenu de `profil`.
    } else if (this.role === 'employeur' && (!this.profil || this.profil.constructor.name !== 'Object' || Object.keys(this.profil).length === 0)) {
      // Idem pour employeur
    } else if (this.role === 'admin' || this.role === 'moderateur') {
      this.profil = undefined; // Les admins/modérateurs n'ont pas de profil spécifique de ce type
    }
  }
  next();
});


module.exports = mongoose.model('User', userSchema);
// Si on utilisait la discrimination:
// const User = mongoose.model('User', userSchema);
// const Travailleur = User.discriminator('travailleur', profilTravailleurSchema);
// const Employeur = User.discriminator('employeur', profilEmployeurSchema);
// module.exports = { User, Travailleur, Employeur };