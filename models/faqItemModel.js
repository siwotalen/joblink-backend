const mongoose = require('mongoose');

const faqItemSchema = new mongoose.Schema({
  question: { 
    type: String, 
    required: [true, 'La question est requise.'], 
    trim: true, 
    unique: true, // Chaque question doit être unique
    maxlength: [255, 'La question ne peut pas dépasser 255 caractères.']
  },
  reponse: { 
    type: String, 
    required: [true, 'La réponse est requise.'], 
    trim: true,
    maxlength: [5000, 'La réponse ne peut pas dépasser 5000 caractères.'] // Assez long pour des réponses détaillées
  },
  categorie: { // Pour regrouper les FAQ, ex: "Compte", "Annonces", "Paiements", "Général"
    type: String, 
    trim: true, 
    default: 'Général',
    maxlength: [50, 'La catégorie ne peut pas dépasser 50 caractères.']
  },
  ordreAffichage: { // Pour contrôler l'ordre d'affichage au sein d'une catégorie
    type: Number, 
    default: 0 
  },
  estActif: { // Permet de désactiver une FAQ sans la supprimer
    type: Boolean, 
    default: true 
  },
  motsCles: [{ type: String, trim: true, lowercase: true }], // Pour une future recherche dans la FAQ
}, { 
  timestamps: true 
});

faqItemSchema.index({ categorie: 1, estActif: 1, ordreAffichage: 1, question: 1 }); // Pour l'affichage groupé et trié
faqItemSchema.index({ motsCles: 'text', question: 'text', reponse: 'text' }); // Pour la recherche full-text

//: Générer automatiquement des mots-clés à partir de la question et de la réponse
faqItemSchema.pre('save', function(next) {
  if (this.isModified('question') || this.isModified('reponse') || this.isNew) {
    const textToParse = `${this.question} ${this.reponse}`;
    // Logique simple pour extraire des mots-clés (à améliorer)
    this.motsCles = [...new Set(textToParse.toLowerCase().match(/\b(\w{4,})\b/g) || [])]; // Mots de 4 lettres ou plus
  }
  next();
});

module.exports = mongoose.model('FaqItem', faqItemSchema);