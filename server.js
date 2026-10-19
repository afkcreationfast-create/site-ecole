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

// Route principale : Page d'accueil du site de l'école
app.get('/', async (req, res) => {
    try {
        // Récupérer les annonces de la direction depuis Supabase
        const result = await pool.query('SELECT * FROM annonces ORDER BY date_publication DESC');
        const annonces = result.rows;

        // Générer une interface HTML moderne
        let html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Site Officiel - École Primaire</title>
                <style>
                    * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                    body { margin: 0; padding: 0; background-color: #f3f4f6; color: #1f2937; }
                    header { background: linear-gradient(135deg, #1e3a8a, #3b82f6); color: white; padding: 30px 20px; text-align: center; }
                    header h1 { margin: 0; font-size: 1.8rem; }
                    header p { margin-top: 8px; opacity: 0.9; font-size: 0.95rem; }
                    nav { background-color: #1e293b; padding: 12px; text-align: center; }
                    nav a { color: white; text-decoration: none; margin: 0 12px; font-weight: 600; font-size: 0.9rem; }
                    .container { max-width: 800px; margin: 20px auto; padding: 20px; }
                    .card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 20px; }
                    .card h2 { margin-top: 0; color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; font-size: 1.3rem; }
                    .annonce { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 12px; border-radius: 4px; }
                    .annonce h3 { margin: 0 0 5px 0; color: #b45309; font-size: 1.1rem; }
                    .annonce p { margin: 0 0 8px 0; font-size: 0.95rem; }
                    .annonce small { color: #78350f; font-size: 0.8rem; }
                    .btn-login { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; width: 100%; text-align: center; }
                </style>
            </head>
            <body>
                <header>
                    <h1>🏫 École Primaire</h1>
                    <p>Plateforme d'Information & Suivi Scolaire</p>
                </header>
                <nav>
                    <a href="/">Accueil</a>
                    <a href="/connexion">Espace Membre</a>
                </nav>
                <div class="container">
                    <div class="card">
                        <h2>📢 Annonces Officielles de la Direction</h2>
        `;

        if (annonces.length === 0) {
            html += `<p style="color: #6b7280;">Aucune annonce pour le moment. Bienvenue sur le portail officiel de l'école !</p>`;
        } else {
            annonces.forEach(a => {
                html += `
                    <div class="annonce">
                        <h3>${a.titre}</h3>
                        <p>${a.contenu}</p>
                        <small>Publié le ${new Date(a.date_publication).toLocaleDateString('fr-FR')} par la ${a.publie_par}</small>
                    </div>
                `;
            });
        }

        html += `
                    </div>
                    <div class="card">
                        <h2>🔐 Accès Parents, Élèves & Professeurs</h2>
                        <p style="font-size: 0.95rem; color: #4b5563;">Consultez les notes, l'appel quotidien des absences et les devoirs de votre classe.</p>
                        <a href="/connexion" class="btn-login">Se Connecter</a>
                    </div>
                </div>
            </body>
            </html>
        `;

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur lors du chargement de la page d'accueil.");
    }
});

// Route de connexion
app.get('/connexion', (req, res) => {
    res.send(`
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #f3f4f6;">
            <div style="max-width: 400px; margin: auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <h2>Espace de Connexion</h2>
                <p>Connexion par Code Élève ou E-mail bientôt disponible.</p>
                <a href="/" style="color: #2563eb; font-weight: bold;">← Retour à l'accueil</a>
            </div>
        </body>
    `);
});

// Démarrage du serveur
app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur le port ${port}`);
});

