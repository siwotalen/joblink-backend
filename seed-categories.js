// Script pour ajouter des catégories de test
const mongoose = require('mongoose');
const Categorie = require('./models/categorieModel');

// Catégories de test
const categoriesTest = [
    { nom: 'Informatique et Technologies', description: 'Emplois dans le domaine de l\'informatique et des technologies' },
    { nom: 'Marketing et Communication', description: 'Emplois dans le marketing et la communication' },
    { nom: 'Finance et Comptabilité', description: 'Emplois dans la finance et la comptabilité' },
    { nom: 'Ressources Humaines', description: 'Emplois dans les ressources humaines' },
    { nom: 'Vente et Commerce', description: 'Emplois dans la vente et le commerce' },
    { nom: 'Enseignement et Formation', description: 'Emplois dans l\'enseignement et la formation' },
    { nom: 'Santé et Médical', description: 'Emplois dans le domaine de la santé' },
    { nom: 'Transport et Logistique', description: 'Emplois dans le transport et la logistique' },
    { nom: 'Construction et BTP', description: 'Emplois dans la construction et le BTP' },
    { nom: 'Restauration et Hôtellerie', description: 'Emplois dans la restauration et l\'hôtellerie' },
    { nom: 'Agriculture', description: 'Emplois dans l\'agriculture' },
    { nom: 'Autres', description: 'Autres types d\'emplois' }
];

async function seedCategories() {
    try {
        // Connexion à MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/joblink');
        console.log('Connecté à MongoDB');

        // Vérifier si des catégories existent déjà
        const existingCategories = await Categorie.find();
        if (existingCategories.length > 0) {
            console.log(`${existingCategories.length} catégories existent déjà.`);
            console.log('Catégories existantes:');
            existingCategories.forEach(cat => {
                console.log(`- ${cat.nom} (ID: ${cat._id})`);
            });
            return;
        }

        // Ajouter les catégories de test
        const categories = await Categorie.insertMany(categoriesTest);
        console.log(`${categories.length} catégories ajoutées avec succès !`);
        
        console.log('Catégories ajoutées:');
        categories.forEach(cat => {
            console.log(`- ${cat.nom} (ID: ${cat._id})`);
        });

    } catch (error) {
        console.error('Erreur lors de l\'ajout des catégories:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Déconnecté de MongoDB');
    }
}

// Exécuter le script
seedCategories(); 