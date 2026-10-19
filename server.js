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

// 1. ROUTE ACCUEIL : Page d'accueil aux couleurs de LEKOL S&H
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
                <title>LEKOL S&H - Site Officiel</title>
                <style>
                    * { box-sizing: border-box; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                    body { margin: 0; padding: 0; background-color: #f3f4f6; color: #1f2937; }
                    header { background: linear-gradient(135deg, #1d4ed8, #1e3a8a); color: white; padding: 40px 20px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    header h1 { margin: 0; font-size: 2.2rem; letter-spacing: 1px; }
                    header p { margin-top: 10px; opacity: 0.9; font-size: 1.05rem; }
                    nav { background-color: #0f172a; padding: 12px; text-align: center; }
                    nav a { color: white; text-decoration: none; margin: 0 15px; font-weight: 600; font-size: 0.95rem; }
                    nav a:hover { color: #60a5fa; }
                    .container { max-width: 850px; margin: 30px auto; padding: 0 20px; }
                    .card { background: white; border-radius: 12px; padding: 25px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); margin-bottom: 25px; }
                    .card h2 { margin-top: 0; color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; font-size: 1.4rem; }
                    .annonce { background-color: #eff6ff; border-left: 5px solid #2563eb; padding: 18px; margin-bottom: 15px; border-radius: 6px; }
                    .annonce h3 { margin: 0 0 8px 0; color: #1e40af; font-size: 1.2rem; }
                    .annonce p { margin: 0 0 10px 0; font-size: 1rem; color: #374151; }
                    .annonce small { color: #6b7280; font-size: 0.85rem; }
                    .btn { display: inline-block; background-color: #2563eb; color: white; padding: 14px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; text-align: center; border: none; cursor: pointer; width: 100%; font-size: 1.05rem; transition: background 0.2s; }
                    .btn:hover { background-color: #1d4ed8; }
                </style>
            </head>
            <body>
                <header>
                    <h1>LEKOL S&H</h1>
                    <p>Plateforme Officielle d'Information & Suivi Scolaire</p>
                </header>
                <nav>
                    <a href="/">Accueil</a>
                    <a href="/connexion">Connexion / Administration</a>
                </nav>
                <div class="container">
                    <div class="card">
                        <h2>📢 Annonces Officielles de LEKOL S&H</h2>
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
                        <h2>🔐 Espace Membres & Direction</h2>
                        <p style="font-size: 1rem; color: #4b5563; margin-bottom: 20px;">Accédez à votre espace ou connectez-vous au panneau de contrôle de l'établissement.</p>
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

// 2. ROUTE CONNEXION
app.get('/connexion', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <title>Connexion - LEKOL S&H</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #f3f4f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .login-card { background: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
                h2 { color: #1e3a8a; margin-top: 0; text-align: center; }
                label { font-weight: bold; font-size: 0.9rem; color: #374151; }
                input { width: 100%; padding: 12px; margin: 8px 0 18px 0; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 1rem; }
                .btn { background-color: #2563eb; color: white; padding: 12px; border: none; border-radius: 6px; width: 100%; font-weight: bold; cursor: pointer; font-size: 1rem; }
                .btn:hover { background-color: #1d4ed8; }
                .back { display: block; text-align: center; margin-top: 15px; color: #4b5563; text-decoration: none; font-size: 0.9rem; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <h2>Connexion LEKOL S&H</h2>
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

// 3. PANNEAU D'ADMINISTRATION COMPLET (Contrôle total de la direction)
app.get('/admin', async (req, res) => {
    try {
        const classesResult = await pool.query('SELECT * FROM classes ORDER BY nom');
        const annoncesResult = await pool.query('SELECT * FROM annonces ORDER BY date_publication DESC');
        const elevesResult = await pool.query(`
            SELECT u.*, c.nom as nom_classe 
            FROM utilisateurs u 
            LEFT JOIN classes c ON u.classe_id = c.id 
            WHERE u.role = 'ELEVE' ORDER BY u.id DESC
        `);
        const staffResult = await pool.query(`
            SELECT * FROM utilisateurs 
            WHERE role IN ('ADMIN', 'TITULAIRE', 'PROF') ORDER BY role, nom
        `);

        let html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <title>Administration - LEKOL S&H</title>
                <style>
                    body { font-family: 'Segoe UI', sans-serif; background: #f3f4f6; margin: 0; padding: 20px; }
                    .admin-container { max-width: 1000px; margin: auto; background: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                    h1 { color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 12px; margin-top: 0; }
                    .section { margin-bottom: 35px; padding: 25px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
                    h2 { color: #374151; font-size: 1.25rem; margin-top: 0; }
                    input, select, textarea { width: 100%; padding: 12px; margin: 6px 0 15px 0; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 0.95rem; }
                    .btn { background-color: #2563eb; color: white; padding: 12px 20px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
                    .btn:hover { background-color: #1d4ed8; }
                    .btn-danger { background-color: #dc2626; padding: 6px 12px; font-size: 0.85rem; }
                    .btn-danger:hover { background-color: #b91c1c; }
                    table { width: 100%; border-collapse: collapse; margin-top: 12px; background: white; }
                    th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-size: 0.9rem; }
                    th { background-color: #1e3a8a; color: white; }
                    .logout { float: right; background: #dc2626; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; font-size: 0.9rem; font-weight: bold; }
                    .logout:hover { background: #b91c1c; }
                </style>
            </head>
            <body>
                <div class="admin-container">
                    <a href="/" class="logout">Déconnexion</a>
                    <h1>⚙️ Panneau de Direction - LEKOL S&H</h1>
                    
                    <!-- SECTION 1 : Annonces (Ajout & Suppression) -->
                    <div class="section">
                        <h2>📢 Gérer les Annonces Officielles</h2>
                        <form action="/admin/annonce" method="POST" style="margin-bottom: 20px;">
                            <label>Titre de l'annonce</label>
                            <input type="text" name="titre" required placeholder="Ex: Examen du 7 novembre / Congé...">
                            
                            <label>Contenu du message</label>
                            <textarea name="contenu" rows="3" required placeholder="Détails de l'annonce..."></textarea>
                            
                            <button type="submit" class="btn">Publier l'annonce</button>
                        </form>

                        <h3>Annonces Actives :</h3>
                        <table>
                            <tr>
                                <th>Titre</th>
                                <th>Date</th>
                                <th>Action</th>
                            </tr>
        `;

        annoncesResult.rows.forEach(a => {
            html += `
                <tr>
                    <td><b>${a.titre}</b><br><small>${a.contenu}</small></td>
                    <td>${new Date(a.date_publication).toLocaleDateString('fr-FR')}</td>
                    <td>
                        <form action="/admin/annonce/delete/${a.id}" method="POST" style="margin:0;">
                            <button type="submit" class="btn btn-danger">Retirer</button>
                        </form>
                    </td>
                </tr>
            `;
        });

        html += `
                        </table>
                    </div>

                    <!-- SECTION 2 : Ajouter des membres de la direction ou professeurs -->
                    <div class="section">
                        <h2>👨‍💼 Ajouter un Membre du Staff (Direction / Professeur)</h2>
                        <form action="/admin/staff" method="POST">
                            <label>Nom</label>
                            <input type="text" name="nom" required placeholder="Nom de famille">
                            
                            <label>Prénom</label>
                            <input type="text" name="prenom" required placeholder="Prénom">
                            
                            <label>Email de connexion</label>
                            <input type="email" name="email" required placeholder="email@lekolsh.com">
                            
                            <label>Mot de passe</label>
                            <input type="password" name="password" required placeholder="Mot de passe sécurisé">
                            
                            <label>Rôle dans l'établissement</label>
                            <select name="role" required>
                                <option value="ADMIN">Direction (Administrateur)</option>
                                <option value="TITULAIRE">Professeur Titulaire (Principal)</option>
                                <option value="PROF">Professeur Intervenant</option>
                            </select>
                            
                            <button type="submit" class="btn">Ajouter ce membre</button>
                        </form>

                        <h3 style="margin-top: 25px;">Équipe Administrative & Enseignants Enregistrés :</h3>
                        <table>
                            <tr>
                                <th>Nom & Prénom</th>
                                <th>Email</th>
                                <th>Rôle</th>
                            </tr>
        `;

        staffResult.rows.forEach(s => {
            html += `
                <tr>
                    <td>${s.nom} ${s.prenom}</td>
                    <td>${s.email}</td>
                    <td><b>${s.role}</b></td>
                </tr>
            `;
        });

        html += `
                        </table>
                    </div>

                    <!-- SECTION 3 : Inscrire un élève -->
                    <div class="section">
                        <h2>➕ Inscrire un Élève (Génération automatique du Code)</h2>
                        <form action="/admin/eleve" method="POST">
                            <label>Nom de l'élève</label>
                            <input type="text" name="nom" required placeholder="Nom de famille">
                            
                            <label>Prénom de l'élève</label>
                            <input type="text" name="prenom" required placeholder="Prénom">
                            
                            <label>Classe</label>
                            <select name="classe_id" required>
                                <option value="">-- Choisir une classe --</option>
        `;

        classesResult.rows.forEach(c => {
            html += `<option value="${c.id}">${c.nom} (${c.niveau})</option>`;
        });

        html += `
                            </select>
                            
                            <label>Mot de passe initial (accès parent/élève)</label>
                            <input type="text" name="password" required value="ecole2026">
                            
                            <button type="submit" class="btn">Enregistrer l'élève & Générer son Code</button>
                        </form>

                        <h3 style="margin-top: 25px;">Liste des Élèves Enregistrés :</h3>
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
        await pool.query('INSERT INTO annonces (titre, contenu, publie_par) VALUES ($1, $2, $3)', [titre, contenu, 'Direction - LEKOL S&H']);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur ajout annonce.");
    }
});

// Traitement : Supprimer une annonce
app.post('/admin/annonce/delete/:id', async (req, res) => {
    const annonceId = req.params.id;
    try {
        await pool.query('DELETE FROM annonces WHERE id = $1', [annonceId]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur lors de la suppression de l'annonce.");
    }
});

// Traitement : Ajouter un membre du staff (Admin ou Prof)
app.post('/admin/staff', async (req, res) => {
    const { nom, prenom, email, password, role } = req.body;
    try {
        await pool.query(
            'INSERT INTO utilisateurs (nom, prenom, email, mot_de_passe, role) VALUES ($1, $2, $3, $4, $5)',
            [nom, prenom, email, password, role]
        );
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur lors de l'ajout du membre du staff.");
    }
});

// Traitement : Inscrire un élève et générer son code unique
app.post('/admin/eleve', async (req, res) => {
    const { nom, prenom, classe_id, password } = req.body;
    try {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const code_eleve = `S&H-${randomNum}`; // Code personnalisé aux couleurs de l'école

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
