const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  expediteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  destinataireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Optionnel: Lier le message à une annonce ou une candidature spécifique
  annonceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Annonce',
  },
  candidatureId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidature',
  },
  contenu: {
    type: String,
    required: [true, 'Le contenu du message ne peut pas être vide.'],
    trim: true,
    maxlength: [1000, 'Le message ne peut pas dépasser 1000 caractères.'],
  },
  lu: { // Si le destinataire a lu le message
    type: Boolean,
    default: false,
  },
  dateLecture: { type: Date },
}, {
  timestamps: true, // Donne createdAt (date d'envoi) et updatedAt
});

// Index pour récupérer les conversations entre deux utilisateurs
messageSchema.index({ expediteurId: 1, destinataireId: 1, createdAt: -1 });
messageSchema.index({ destinataireId: 1, lu: 1, createdAt: -1 }); // Pour les messages non lus

module.exports = mongoose.model('Message', messageSchema);