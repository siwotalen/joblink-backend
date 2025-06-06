// config/swaggerConfig.js
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0', // Spécification OpenAPI
    info: {
      title: 'JobLink API Documentation',
      version: '1.0.0',
      description: 'API pour la plateforme JobLink, connectant travailleurs informels et employeurs au Cameroun.',
      contact: {
        name: 'siwo talen junior dalphane / POWER-SOFT',
        // url: 'https://votre-site.com', // Optionnel
        email: 'juniorsiwo95@gmail.com', // Optionnel
      },
    },
    servers: [ // Définissez vos serveurs (développement, production)
      {
        url: `http://localhost:${process.env.PORT || 8000}/api`, // URL de base de votre API en dev
        description: 'Serveur de Développement Local',
      },
      // Ajoutez ici l'URL de votre serveur de production quand vous en aurez une
      // {
      //   url: 'https://api.joblink.cm/api', // Exemple
      //   description: 'Serveur de Production',
      // },
    ],
    components: { // Définitions réutilisables (schémas, paramètres, réponses, etc.)
      securitySchemes: { // Pour décrire comment l'authentification fonctionne
        bearerAuth: { // Nommez-le comme vous voulez
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT', // Indique que c'est un token JWT
        },
      },
      schemas: { // Définissez ici vos modèles de données pour les requêtes et réponses
        // Exemple pour le modèle User (simplifié pour la réponse)
        UserResponse: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '60d0fe4f5311236168a109ca' },
            nom: { type: 'string', example: 'Doe' },
            prenom: { type: 'string', example: 'John' },
            email: { type: 'string', format: 'email', example: 'john.doe@example.com' },
            role: { type: 'string', enum: ['travailleur', 'employeur', 'admin', 'moderateur'], example: 'travailleur' },
            typeAbonnement: { type: 'string', enum: ['gratuit', 'premium_travailleur', 'premium_employeur'], example: 'gratuit' },
            photoDeProfil: { type: 'object', properties: { cheminAcces: {type: 'string'} } }, // Simplifié
            // Ajoutez d'autres champs pertinents que vous retournez
          }
        },
        UserInput: { // Exemple pour l'inscription
            type: 'object',
            required: ['nom', 'email', 'password', 'role', 'telephone'],
            properties: {
                nom: { type: 'string', example: 'Kenfack' },
                prenom: { type: 'string', example: 'Harold' },
                email: { type: 'string', format: 'email', example: 'kenfack@example.com' },
                password: { type: 'string', format: 'password', example: 'votreMotDePasse' },
                role: { type: 'string', enum: ['travailleur', 'employeur'], example: 'travailleur' },
                telephone: { type: 'string', example: '690000000' },
            }
        },
        Annonce: { // Exemple pour le modèle Annonce
            type: 'object',
            properties: {
                _id: { type: 'string' },
                titre: { type: 'string', example: 'Recherche Plombier Urgent' },
                description: { type: 'string', example: 'Besoin d\'un plombier pour une fuite...' },
                // ... autres champs d'annonce
            }
        },
        ErrorResponse: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: false },
                message: { type: 'string', example: 'Message d\'erreur détaillé.'}
            }
        }
        // Ajoutez des schémas pour Categorie, Candidature, Message, FaqItem, etc.
      }
    },
    security: [ // Appliquer la sécurité globalement (peut être surchargé par endpoint)
        {
            bearerAuth: [] // Cela signifie que par défaut, les endpoints nécessitent bearerAuth
        }
    ]
  },
  // Chemin vers les fichiers contenant les annotations JSDoc pour l'API
  // Adaptez les chemins pour qu'ils correspondent à la structure de votre projet
  apis: ['./routers/*.js', './controllers/*.js', './models/*.js'], // Inclure les modèles si vous y mettez des définitions de schémas Swagger
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;