const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware pour lire les données des formulaires
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configuration de la connexion à Supabase
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Test de connexion à la base de données
pool.connect()
    .then(() => console.log('✅ Connexion à Supabase réussie !'))
    .catch(err => console.error('❌ Erreur de connexion à Supabase :', err));

// 1. ROUTE ACCUEIL : Affichage public avec les annonces de la direction
app.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM annonces ORDER BY date_publication DESC');
        const annonces = result.rows;

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
                    .btn { display: inline-block; background-color: #2563eb; color: white; padding: 12px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; text-align: center; border: none; cursor: pointer; width: 100%; font-size: 1rem; }
                    .btn:hover { background-color: #1d4ed8; }
                    input, select, textarea { width: 100%; padding: 10px; margin: 8px 0 15px 0; display: inline-block; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; }
                </style>
            </head>
            <body>
                <header>
                    <h1>🏫 École Primaire</h1>
                    <p>Plateforme d'Information & Suivi Scolaire</p>
                </header>
                <nav>
                    <a href="/">Accueil</a>
                    <a href="/connexion">Connexion / Administration</a>
                </nav>
                <div class="container">
                    <div class="card">
                        <h2>📢 Annonces Officielles de la Direction</h2>
        `;

        if (annonces.length === 0) {
            html += `<p style="color: #6b7280;">Aucune annonce pour le moment.</p>`;
        } else {
            annonces.forEach(a => {
                html += `
                    <div class="annonce">
                        <h3>${a.titre}</h3>
                        <p>${a.contenu}</p>
                        <small>Publié le ${new Date(a.date_publication).toLocaleDateString('fr-FR')} par ${a.publie_par}</small>
                    </div>
                `;
            });
        }

        html += `
                    </div>
                    <div class="card">
                        <h2>🔐 Espace Membres & Administration</h2>
                        <p style="font-size: 0.95rem; color: #4b5563;">Accédez à votre espace ou gérez l'établissement.</p>
                        <a href="/connexion" class="btn">Se Connecter</a>
                    </div>
                </div>
            </body>
            </html>
        `;

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur.");
    }
});

// 2. ROUTE CONNEXION (Formulaire)
app.get('/connexion', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <title>Connexion - École Primaire</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f3f4f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .login-card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
                h2 { color: #1e3a8a; margin-top: 0; text-align: center; }
                label { font-weight: bold; font-size: 0.9rem; color: #374151; }
                input { width: 100%; padding: 10px; margin: 8px 0 15px 0; border: 1px solid #d1d5db; border-radius: 5px; box-sizing: border-box; }
                .btn { background-color: #2563eb; color: white; padding: 12px; border: none; border-radius: 5px; width: 100%; font-weight: bold; cursor: pointer; font-size: 1rem; }
                .btn:hover { background-color: #1d4ed8; }
                .back { display: block; text-align: center; margin-top: 15px; color: #4b5563; text-decoration: none; font-size: 0.9rem; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <h2>Connexion</h2>
                <form action="/connexion" method="POST">
                    <label>Identifiant (Email ou Code Élève)</label>
                    <input type="text" name="identifiant" required placeholder="Ex: fransenaugustin0@gmail.com">
                    
                    <label>Mot de passe</label>
                    <input type="password" name="password" required placeholder="Votre mot de passe">
                    
                    <button type="submit" class="btn">Se connecter</button>
                </form>
                <a href="/" class="back">← Retour à l'accueil</a>
            </div>
        </body>
        </html>
    `);
});

// Traitement de la connexion
app.post('/connexion', async (req, res) => {
    const { identifiant, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM utilisateurs WHERE (email = $1 OR code_eleve = $1) AND mot_de_passe = $2',
            [identifiant, password]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (user.role === 'ADMIN') {
                res.redirect(`/admin?nom=${user.nom}`);
            } else {
                res.send(`<h1>Bienvenue ${user.prenom} !</h1><p>Espace membre en cours de finalisation.</p><a href="/">Accueil</a>`);
            }
        } else {
            res.send(`<script>alert('Identifiant ou mot de passe incorrect'); window.location.href='/connexion';</script>`);
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur lors de la connexion.");
    }
});

// 3. PANNEAU D'ADMINISTRATION (Gestion des élèves et annonces)
app.get('/admin', async (req, res) => {
    try {
        const classesResult = await pool.query('SELECT * FROM classes ORDER BY nom');
        const elevesResult = await pool.query(`
            SELECT u.*, c.nom as nom_classe 
            FROM utilisateurs u 
            LEFT JOIN classes c ON u.classe_id = c.id 
            WHERE u.role = 'ELEVE' ORDER BY u.id DESC
        `);

        let html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <title>Administration - École Primaire</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; background: #f3f4f6; margin: 0; padding: 20px; }
                    .admin-container { max-width: 1000px; margin: auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    h1 { color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
                    .section { margin-bottom: 30px; padding: 20px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
                    h2 { color: #374151; font-size: 1.2rem; margin-top: 0; }
                    input, select, textarea { width: 100%; padding: 10px; margin: 6px 0 12px 0; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; }
                    .btn { background-color: #2563eb; color: white; padding: 10px 20px; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; }
                    .btn:hover { background-color: #1d4ed8; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; background: white; }
                    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 0.9rem; }
                    th { background-color: #1e3a8a; color: white; }
                    .logout { float: right; background: #dc2626; color: white; padding: 8px 15px; text-decoration: none; border-radius: 5px; font-size: 0.9rem; }
                </style>
            </head>
            <body>
                <div class="admin-container">
                    <a href="/" class="logout">Déconnexion</a>
                    <h1>⚙️ Panneau de Direction (Administration)</h1>
                    
                    <!-- SECTION 1 : Publier une annonce -->
                    <div class="section">
                        <h2>📢 Publier une Annonce Urgente</h2>
                        <form action="/admin/annonce" method="POST">
                            <label>Titre de l'annonce</label>
                            <input type="text" name="titre" required placeholder="Ex: Examen du 7 novembre / Pas de classe...">
                            
                            <label>Contenu du message</label>
                            <textarea name="contenu" rows="3" required placeholder="Détails de l'annonce..."></textarea>
                            
                            <button type="submit" class="btn">Publier l'annonce</button>
                        </form>
                    </div>

                    <!-- SECTION 2 : Inscrire un élève et générer son code -->
                    <div class="section">
                        <h2>➕ Inscrire un Élève (Génération automatique du Code)</h2>
                        <form action="/admin/eleve" method="POST">
                            <label>Nom de l'élève</label>
                            <input type="text" name="nom" required placeholder="Nom de famille">
                            
                            <label>Prénom de l'élève</label>
                            <input type="text" name="prenom" required placeholder="Prénom">
                            
                            <label>Classe (Kinder A, 1ère A, etc.)</label>
                            <select name="classe_id" required>
                                <option value="">-- Choisir une classe --</option>
        `;

        classesResult.rows.forEach(c => {
            html += `<option value="${c.id}">${c.nom} (${c.niveau})</option>`;
        });

        html += `
                            </select>
                            
                            <label>Mot de passe initial (pour l'accès élève/parent)</label>
                            <input type="text" name="password" required value="ecole2026">
                            
                            <button type="submit" class="btn">Enregistrer l'élève & Générer son Code</button>
                        </form>
                    </div>

                    <!-- SECTION 3 : Liste des élèves inscrits -->
                    <div class="section">
                        <h2>📋 Liste des Élèves Enregistrés</h2>
                        <table>
                            <tr>
                                <th>Code Élève unique</th>
                                <th>Nom & Prénom</th>
                                <th>Classe</th>
                            </tr>
        `;

        elevesResult.rows.forEach(e => {
            html += `
                <tr>
                    <td><b>${e.code_eleve}</b></td>
                    <td>${e.nom} ${e.prenom}</td>
                    <td>${e.nom_classe || 'Non assigné'}</td>
                </tr>
            `;
        });

        html += `
                        </table>
                    </div>
                </div>
            </body>
            </html>
        `;

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur chargement admin.");
    }
});

// Traitement : Ajouter une annonce
app.post('/admin/annonce', async (req, res) => {
    const { titre, contenu } = req.body;
    try {
        await pool.query('INSERT INTO annonces (titre, contenu) VALUES ($1, $2)', [titre, contenu]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur ajout annonce.");
    }
});

// Traitement : Inscrire un élève et générer son code unique
app.post('/admin/eleve', async (req, res) => {
    const { nom, prenom, classe_id, password } = req.body;
    try {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const code_eleve = `ELEV-${randomNum}`;

        await pool.query(
            'INSERT INTO utilisateurs (nom, prenom, code_eleve, mot_de_passe, role, classe_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [nom, prenom, code_eleve, password, 'ELEVE', classe_id]
        );

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur lors de l'inscription de l'élève.");
    }
});

// Démarrage du serveur
app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur le port ${port}`);
});
