const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Configuration de la connexion à Supabase
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test de connexion à la base de données
pool.connect()
    .then(() => console.log('✅ Connexion à Supabase réussie !'))
    .catch(err => console.error('❌ Erreur de connexion à Supabase :', err));

// Route principale de test
app.get('/', (req, res) => {
    res.send('Bienvenue sur le site de l\'école - Projet Primaire en ligne !');
});

// Démarrage du serveur
app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur le port ${port}`);
});
