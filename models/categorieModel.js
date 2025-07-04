const mongoose = require('mongoose');

const categorieSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de la catégorie est requis.'],
    unique: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  // icone: { type: String }, // Optionnel: pour un affichage plus visuel
  // slug: { type: String, unique: true, lowercase: true } // Optionnel: pour des URLs plus propres
}, {
  timestamps: true,
});

// Middleware pour générer un slug si vous l'utilisez (exemple)
// categorieSchema.pre('save', function(next) {
//   if (this.isModified('nom') || this.isNew) {
//     this.slug = this.nom.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '');
//   }
//   next();
// });

module.exports = mongoose.model('Categorie', categorieSchema);