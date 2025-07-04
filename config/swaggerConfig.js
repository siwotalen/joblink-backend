// config/swaggerConfig.js
const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'JobLink API Documentation',
      version: '1.0.0',
      description: 'API pour la plateforme JobLink, connectant travailleurs informels et employeurs au Cameroun. Le backend gère les utilisateurs, annonces, candidatures, messagerie, abonnements, et plus encore.',
      contact: {
        name: 'Équipe JobLink',
        // url: 'https://votre-site.com',
        email: 'support@joblink.votre_domaine.com',
      },
      license: { // Optionnel
        name: 'MIT',
        url: 'https://spdx.org/licenses/MIT.html',
      },
    },
    servers: [
      {
        url: `http://localhost:${process.env.PORT || 8000}/api`,
        description: 'Serveur de Développement Local',
      },
      {
        url: process.env.PRODUCTION_API_URL || 'https://votre-api-en-prod.com/api', // Mettez votre URL de prod
        description: 'Serveur de Production',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Entrez le token JWT avec le préfixe "Bearer " (ex: "Bearer VotreTokenJWT")',
        },
      },
      schemas: {
        // --- Schémas d'Authentification ---
        UserInputSignup: {
          type: 'object',
          required: ['nom', 'email', 'password', 'role', 'telephone'],
          properties: {
            nom: { type: 'string', example: 'Kenfack' },
            prenom: { type: 'string', example: 'Harold', nullable: true },
            email: { type: 'string', format: 'email', example: 'kenfack@example.com' },
            password: { type: 'string', format: 'password', example: 'motdepasse123', minLength: 8 },
            role: { type: 'string', enum: ['travailleur', 'employeur'], example: 'travailleur' },
            telephone: { type: 'string', example: '690000000' },
          },
        },
        UserLogin: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'test@example.com' },
            password: { type: 'string', format: 'password', example: 'password123' },
          },
        },
        UserResponse: { // Réponse typique après login/signup ou pour get profil
          type: 'object',
          properties: {
            _id: { type: 'string', format: 'ObjectId' },
            nom: { type: 'string' },
            prenom: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['travailleur', 'employeur', 'admin', 'moderateur'] },
            telephone: { type: 'string', nullable: true },
            photoDeProfil: { 
              type: 'object', 
              nullable: true,
              properties: { cheminAcces: { type: 'string', format: 'url' }} 
            },
            typeAbonnement: { type: 'string', enum: ['gratuit', 'premium_travailleur', 'premium_employeur'] },
            dateFinAbonnement: { type: 'string', format: 'date-time', nullable: true },
            verified: { type: 'boolean' },
            estActif: { type: 'boolean' },
            profil: { type: 'object', description: "Champs spécifiques au rôle de l'utilisateur (ex: profil.nomEntreprise pour employeur)" },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        TokenResponse: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                message: { type: 'string' },
                token: { type: 'string', description: "Token JWT" },
                user: { $ref: '#/components/schemas/UserResponse' }
            }
        },

        // --- Schémas pour Annonces ---
        AnnonceInput: {
          type: 'object',
          required: ['titre', 'description', 'categorieId', 'localisation', 'remuneration'],
          properties: {
            titre: { type: 'string', maxLength: 100 },
            description: { type: 'string', maxLength: 2000 },
            categorieId: { type: 'string', format: 'ObjectId', description: "ID de la catégorie" },
            typeContrat: { type: 'string', nullable: true },
            localisation: { 
                type: 'object',
                required: ['ville'],
                properties: {
                    adresseTextuelle: { type: 'string', nullable: true },
                    ville: { type: 'string' },
                    quartier: { type: 'string', nullable: true },
                    // 'point' est géré par le backend via géocodage
                }
            },
            remuneration: {
                type: 'object',
                required: ['montant', 'periode'],
                properties: {
                    montant: { type: 'number', minimum: 0 },
                    devise: { type: 'string', default: 'FCFA', nullable: true },
                    periode: { type: 'string', enum: ['heure', 'jour', 'semaine', 'mois', 'prestation'] }
                }
            },
            dateDebutSouhaitee: { type: 'string', format: 'date', nullable: true },
            dureeMission: {
                type: 'object',
                nullable: true,
                properties: {
                    valeur: { type: 'number', minimum: 1 },
                    unite: { type: 'string', enum: ['jours', 'semaines', 'mois', 'annees'] }
                }
            },
            competencesRequises: { type: 'array', items: { type: 'string' }, nullable: true },
            estUrgent: { type: 'boolean', default: false },
            // imagePrincipaleAnnonce: est géré par multipart/form-data
            // documentsAnnonce: est géré par multipart/form-data sur une autre route
          }
        },
        AnnonceResponse: {
            allOf: [ // Hérite des champs d'AnnonceInput (pas parfait, mais pour l'exemple)
                { $ref: '#/components/schemas/AnnonceInput' }, 
                { 
                    type: 'object',
                    properties: {
                        _id: { type: 'string', format: 'ObjectId' },
                        employeurId: { type: 'object', $ref: '#/components/schemas/UserResponse' }, // Ou juste l'ID string
                        categorieId: { type: 'object', $ref: '#/components/schemas/CategorieResponse' }, // Ou juste l'ID string
                        imagePrincipale: { type: 'object', nullable: true, properties: { cheminAcces: { type: 'string'} } },
                        documentsJointsAnnonce: { type: 'array', items: { type: 'object', properties: { _id: { type: 'string'}, nomOriginal: {type: 'string'}, cheminAcces: {type: 'string'} }} },
                        statut: { type: 'string', enum: ['active', 'inactive', 'expiree', 'supprimee', 'en_attente_moderation'] },
                        dateExpiration: { type: 'string', format: 'date-time' },
                        dateFinPrestationEstimee: { type: 'string', format: 'date-time', nullable: true },
                        nombreVues: { type: 'number' },
                        estPremiumAnnonce: { type: 'boolean' },
                        'localisation.point': { type: 'object', properties: { type: {type: 'string'}, coordinates: {type: 'array', items: {type: 'number'}}}},
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    }
                }
            ]
        },
        AnnoncePaginatedResponse: {
            type: 'object',
            properties: {
                success: { type: 'boolean'},
                annonces: { type: 'array', items: { $ref: '#/components/schemas/AnnonceResponse'}},
                totalPages: { type: 'integer' },
                currentPage: { type: 'integer' },
                totalAnnonces: { type: 'integer' }
            }
        },

        // --- Schéma pour Catégorie ---
        CategorieInput: {
            type: 'object',
            required: ['nom'],
            properties: {
                nom: { type: 'string', minLength: 2, maxLength: 50 },
                description: { type: 'string', maxLength: 255, nullable: true }
            }
        },
        CategorieResponse: {
            allOf: [
                { $ref: '#/components/schemas/CategorieInput' },
                {
                    type: 'object',
                    properties: {
                        _id: { type: 'string', format: 'ObjectId' },
                        createdAt: { type: 'string', format: 'date-time' },
                        updatedAt: { type: 'string', format: 'date-time' },
                    }
                }
            ]
        },
        
        // --- Schéma pour Candidature ---
        CandidatureInput: {
            type: 'object',
            required: ['annonceId'],
            properties: {
                annonceId: {type: 'string', format: 'ObjectId'},
                lettreMotivation: { type: 'string', maxLength: 1500, nullable: true }
            }
        },
        CandidatureResponse: {
            // ... à définir en détail (avec travailleurId et employeurId populés)
            type: 'object',
            properties: {
                _id: {type: 'string'},
                annonceId: { $ref: '#/components/schemas/AnnonceResponse'}, // Ou juste l'ID
                travailleurId: { $ref: '#/components/schemas/UserResponse'}, // Ou juste l'ID
                employeurId: { $ref: '#/components/schemas/UserResponse'}, // Ou juste l'ID
                statut: {type: 'string', enum: ['en_attente', 'vue', 'preselectionnee', 'rejete', 'acceptee', 'terminee_automatiquement', 'terminee_manuellement']},
                lettreMotivation: {type: 'string', nullable: true},
                dateCandidature: { type: 'string', format: 'date-time'},
                // ... autres champs de candidature
            }
        },
        UpdateStatutCandidatureInput: {
            type: 'object',
            required: ['statut'],
            properties: {
                statut: {type: 'string', enum: ['vue', 'preselectionnee', 'rejete', 'acceptee']}
            }
        },


        // --- Schéma pour Message ---
        MessageInput: {
            type: 'object',
            required: ['destinataireId', 'contenu'],
            properties: {
                destinataireId: {type: 'string', format: 'ObjectId'},
                contenu: {type: 'string', minLength:1, maxLength:1000},
                annonceId: {type: 'string', format: 'ObjectId', nullable: true},
                candidatureId: {type: 'string', format: 'ObjectId', nullable: true},
            }
        },
        MessageResponse: {
            // ... à définir
        },

        // --- Schéma pour Profil (Mise à jour) ---
        ProfilCommunInput: { /* ... */ },
        ProfilTravailleurInput: { /* ... */ },
        ProfilEmployeurInput: { /* ... */ },

        // --- Schéma pour Avis ---
        AvisInput: {
            type: 'object',
            required: ['candidatureId', 'note'],
            properties: {
                candidatureId: { type: 'string', format: 'ObjectId' },
                // cibleId est déduit de la candidatureId côté backend
                note: { type: 'integer', minimum: 1, maximum: 5 },
                commentaire: { type: 'string', maxLength: 1000, nullable: true }
            }
        },
        AvisResponse: { /* ... */ },

        // --- Schéma pour Signalement ---
        SignalementInput: { /* ... */ },
        SignalementResponse: { /* ... */ },

        // --- Schéma pour FAQ ---
        FaqItemInput: { /* ... */ },
        FaqItemResponse: { /* ... */ },
        
        // --- Schéma d'Erreur Générique ---
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Description de l\'erreur.' },
            // errors: { type: 'array', items: { type: 'string' } } // Optionnel pour erreurs de validation multiples
          },
        },
        // --- Schéma pour succès simple sans données ---
        SuccessResponse: {
            type: 'object',
            properties: {
                success: {type: 'boolean', example: true},
                message: {type: 'string', example: "Opération réussie."}
            }
        }
      },
    },
    // Appliquer la sécurité globalement, peut être surchargé par endpoint
    security: [ 
      {
        bearerAuth: [], 
      },
    ],
  },
  // Chemin vers les fichiers contenant les annotations JSDoc pour l'API
  apis: ['./routers/*.js'], // Concentrez-vous sur les fichiers de routes
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;