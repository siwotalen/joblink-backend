// controllers/travailleurController.js (ou userController.js)
const User = require('../models/usersModel');
const AppError = require('../utils/appError');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const Candidature = require('../models/candidatureModel');
// const SavedJob = require('../models/savedJobModel'); // Modèle à créer
exports.rechercherTravailleursProximite = async (req, res, next) => {
    try {
        const { longitude, latitude, distanceMaxKm = 10, page = 1, limit = 10, competences, noteMin } = req.query;

        if (!longitude || !latitude) {
            return next(new AppError("Les coordonnées (longitude et latitude) sont requises pour la recherche par proximité.", 400));
        }

        const lon = parseFloat(longitude);
        const lat = parseFloat(latitude);
        const maxDistMetres = parseFloat(distanceMaxKm) * 1000;

        if (isNaN(lon) || isNaN(lat) || isNaN(maxDistMetres) || maxDistMetres <= 0) {
            return next(new AppError("Paramètres de géolocalisation invalides.", 400));
        }

        const queryFilters = {
            role: 'travailleur',
            estActif: true, // Ne montrer que les travailleurs actifs
            'profil.localisation.point': { // S'assurer que le champ existe pour que $nearSphere fonctionne bien
                $nearSphere: {
                    $geometry: { type: "Point", coordinates: [lon, lat] },
                    $maxDistance: maxDistMetres
                }
            }
        };

        // Filtre par compétences (si le champ competences est un tableau dans profil)
        if (competences) {
            const competencesArray = Array.isArray(competences) ? competences : competences.split(',');
            queryFilters['profil.competences'] = { $in: competencesArray.map(c => new RegExp(c.trim(), 'i')) };
        }

        // Filtre par note minimale
        if (noteMin && !isNaN(parseFloat(noteMin))) {
            queryFilters['profil.noteMoyenne'] = { $gte: parseFloat(noteMin) };
        }
        
        const countPromise = User.countDocuments(queryFilters);
        const travailleursPromise = User.find(queryFilters)
            .select('nom prenom email photoDeProfil.cheminAcces profil role typeAbonnement') // Sélectionner les champs pertinents
            // MongoDB trie par distance par défaut avec $nearSphere
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const [count, travailleurs] = await Promise.all([countPromise, travailleursPromise]);

        res.status(200).json({
            success: true,
            travailleurs,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            totalTravailleurs: count
        });

    } catch (error) {
        logger.error("Erreur rechercherTravailleursProximite:", error);
        next(error);
    }
};

exports.getDashboardStatsTravailleur = async (req, res, next) => {
    try {
        const travailleurId = req.user.userId;

        // Lancer les requêtes en parallèle pour plus d'efficacité
        const [
            candidaturesRecentes,
            statsStatut,
            user
        ] = await Promise.all([
            // 1. Récupérer les 3 dernières candidatures avec leurs détails
            Candidature.find({ travailleurId })
                .sort({ updatedAt: -1 }) // Trier par la dernière mise à jour
                .limit(3)
                .populate({
                    path: 'annonceId',
                    select: 'titre',
                    populate: { path: 'employeurId', select: 'profil.nomEntreprise nom' }
                }),
            
            // 2. Agréger les statistiques sur les statuts des candidatures
            Candidature.aggregate([
                { $match: { travailleurId: new mongoose.Types.ObjectId(travailleurId) } },
                { $group: { _id: '$statut', count: { $sum: 1 } } }
            ]),
            
            // 3. Récupérer l'utilisateur pour les jobs sauvegardés
            User.findById(travailleurId)
        ]);
        
        // Transformer les stats en un objet plus simple à utiliser
        const statsFinales = {
            candidaturesTotal: 0,
            candidaturesAcceptees: 0,
            entretiens: 0,
            savedJobs: user?.savedJobs?.length || 0
        };
        
        statsStatut.forEach(stat => {
            statsFinales.candidaturesTotal += stat.count;
            if (stat._id === 'acceptee') {
                statsFinales.candidaturesAcceptees = stat.count;
            }
            if (stat._id === 'preselectionnee') {
                statsFinales.entretiens = stat.count;
            }
        });

        res.status(200).json({
            success: true,
            stats: statsFinales,
            candidaturesRecentes
        });

    } catch (error) {
        logger.error("Erreur getDashboardStatsTravailleur:", error);
        next(error);
    }
};