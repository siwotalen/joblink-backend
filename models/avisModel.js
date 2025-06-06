// models/avisModel.js
const mongoose = require('mongoose');

const avisSchema = new mongoose.Schema({
    auteurId: { // L'utilisateur qui laisse l'avis
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    auteurRole: { // Rôle de l'auteur au moment de l'avis (pour contexte)
        type: String,
        enum: ['travailleur', 'employeur'],
        required: true,
    },
    cibleId: { // L'utilisateur qui est noté
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    cibleRole: { // Rôle de la cible au moment de l'avis
        type: String,
        enum: ['travailleur', 'employeur'],
        required: true,
    },
    annonceId: { // L'annonce à laquelle cet avis est lié (contexte de la mission/prestation)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Annonce',
        required: true, 
    },
    // pour lier directement à une candidature spécifique
    candidatureId: { // Lier l'avis à la candidature qui a justifié cet avis
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Candidature',
        required: [true, 'L\'ID de la candidature est requis pour laisser un avis.'], // Rendu requis
    },
    
    note: { // Note sur 5 étoiles par exemple
        type: Number,
        required: [true, 'Une note est requise.'],
        min: [1, 'La note minimale est 1.'],
        max: [5, 'La note maximale est 5.'],
        validate: { // S'assurer que c'est un entier ou un demi-point si vous le souhaitez
            validator: Number.isInteger, // Ou une fonction custom pour les demi-points
            message: '{VALUE} n\'est pas une note entière valide.'
        }
    },
    commentaire: {
        type: String,
        trim: true,
        maxlength: [1000, 'Le commentaire ne peut pas dépasser 1000 caractères.'],
        // Rendre le commentaire optionnel ou requis en fonction de vos règles
    },
    // Pour la modération admin
    estApprouve: { type: Boolean, default: true }, // Approuvé par défaut, ou false si modération a priori
    estVisible: { type: Boolean, default: true }, // Pour cacher un avis sans le supprimer
    // raisonSignalement: { type: String }, // Si un avis est signalé
}, {
    timestamps: true,
});

// Index pour récupérer les avis d'un utilisateur cible
avisSchema.index({ cibleId: 1, estApprouve: 1, estVisible: 1, createdAt: -1 });
// Index pour récupérer les avis laissés par un utilisateur
avisSchema.index({ auteurId: 1, createdAt: -1 });
// Index pour s'assurer qu'un auteur ne laisse qu'un seul avis pour une candidature spécifique
avisSchema.index({ auteurId: 1, candidatureId: 1 }, { unique: true, message: 'Vous avez déjà laissé un avis pour cette prestation/personne concernant cette annonce.' });

// Méthode statique pour calculer la note moyenne et le nombre d'avis d'un utilisateur

avisSchema.statics.calculerStatsAvis = async function(cibleId) {
    try {
        const User = mongoose.model('User'); // S'assurer que le modèle User est accessible
        const stats = await this.aggregate([
            {
                $match: { 
                    cibleId: new mongoose.Types.ObjectId(cibleId),
                    estApprouve: true, 
                    estVisible: true 
                }
            },
            {
                $group: {
                    _id: '$cibleId',
                    noteMoyenne: { $avg: '$note' },
                    nombreAvis: { $sum: 1 }
                }
            }
        ]);

        const updateData = {};
        if (stats.length > 0) {
            updateData['profil.noteMoyenne'] = parseFloat(stats[0].noteMoyenne.toFixed(1));
            updateData['profil.nombreAvis'] = stats[0].nombreAvis;
        } else {
            updateData['profil.noteMoyenne'] = 0;
            updateData['profil.nombreAvis'] = 0;
        }
        
        // Utiliser $set pour s'assurer que les champs sont créés/mis à jour dans le sous-document profil
        await User.findByIdAndUpdate(cibleId, { $set: updateData });
        // logger.info(`Stats d'avis mises à jour pour ${cibleId}: ${JSON.stringify(updateData)}`);

    } catch (error) {
        // Utiliser votre logger winston ici
        console.error(`Erreur lors du calcul des stats d'avis pour l'utilisateur ${cibleId}:`, error);
    }
};

// Hook Mongoose pour recalculer les stats après la sauvegarde ou la suppression d'un avis
avisSchema.post('save', async function() {
    if (this.isModified('note') || this.isModified('estApprouve') || this.isModified('estVisible') || this.isNew) {
        await this.constructor.calculerStatsAvis(this.cibleId);
    }
});

// Hook pour la suppression (findOneAndDelete, remove, etc.)
// Pour findByIdAndDelete, Mongoose exécute findOneAnd... en interne.
// Il faut un hook pour 'findOneAndDelete' si vous utilisez cette méthode de suppression
avisSchema.post('findOneAndDelete', async function(doc) {
    if (doc) {
        await mongoose.model('Avis').calculerStatsAvis(doc.cibleId);
    }
});

// Hook Mongoose pour recalculer les stats après la sauvegarde ou la suppression d'un avis
module.exports = mongoose.model('Avis', avisSchema);
