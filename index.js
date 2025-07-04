const express = require('express');
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require('mongoose');
const { apiLimiter } = require('./middlewares/Limiter');
const { corsOptions } = require('./middlewares/corsOptions');
const errorHandler = require('./middlewares/errorHandler');
const AppError = require('./utils/appError'); 
const logger = require('./utils/logger'); 
const path = require('path');
const { initScheduledJobs } = require('./utils/scheduler');


const authRouter = require('./routers/authRouter');
const categorieRouter = require('./routers/categorieRouter');
const annonceRouter = require('./routers/annonceRouter');
const candidatureRouter = require('./routers/candidatureRouter');
const messageRouter = require('./routers/messageRouter');
const profilRouter = require('./routers/profilRouter');
const adminRouter = require('./routers/adminRouter');
const signalementRouter = require('./routers/signalementRouter');
const faqRouter = require('./routers/faqRouter');
const notificationRouter = require('./routers/notificationRouter');
const paiementRouter = require('./routers/paiementRouter');
const travailleurRouter = require('./routers/travailleurRouter');
const avisRouter = require('./routers/avisRouter');
const statsRouter = require('./routers/statsRouter');
const app = express();
const employeurRouter = require('./routers/employeurRouter');
const contactRouter = require('./routers/contactRouter');
const jobRouter = require('./routers/jobsaveRouter');

// Configuration pour l'emplacement des photos
app.use(express.static(path.join(__dirname, 'public'))); 
// Middlewares
app.use(cors(corsOptions));
app.use(helmet());
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use('/api', apiLimiter)

// Connexion MongoDB
mongoose.connect(process.env.MONGO_URI)
   .then(() => {
      logger.info('MongoDB connected successfully!');
      initScheduledJobs(); // Initialiser les tâches planifiées

   })
   .catch((err) => {
      logger.error('MongoDB connection error:', err);
      process.exit(1); // Quitter si la DB ne se connecte pas
   });

// Routes
app.use('/api/auth', authRouter);
app.use('/api/categories', categorieRouter); 
app.use('/api/annonces', annonceRouter); 
app.use('/api/candidatures', candidatureRouter);
app.use('/api/messagerie', messageRouter);
app.use('/api/profil', profilRouter);
app.use('/api/admin', adminRouter);
app.use('/api/signalements', signalementRouter); 
app.use('/api/faq', faqRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/paiements', paiementRouter);
app.use('/api/travailleurs', travailleurRouter);
app.use('/api/avis', avisRouter);
app.use('/api/stats', statsRouter);
app.use('/api/employeur', employeurRouter);
app.use('/api/contact', contactRouter);
app.use('/api/jobs', jobRouter);
// app.all('*', (req, res, next) => {
//     next(new AppError(`Impossible de trouver ${req.originalUrl} sur ce serveur !`, 404));
// });

app.use(errorHandler);
// Démarrage du serveur
app.listen(process.env.PORT, () => {
  console.log(`app listening....`);
});