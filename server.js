const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ Connexion à Supabase réussie !'))
    .catch(err => console.error('❌ Erreur de connexion à Supabase :', err));

// 1. PAGE D'ACCUEIL PUBLIQUE
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
                    .btn { display: inline-block; background-color: #2563eb; color: white; padding: 14px 20px; text-decoration: none; border-radius: 8px; font-weight: bold; text-align: center; border: none; cursor: pointer; width: 100%; font-size: 1.05rem; }
                </style>
            </head>
            <body>
                <header>
                    <h1>LEKOL S&H</h1>
                    <p>Plateforme Officielle d'Information & Suivi Scolaire</p>
                </header>
                <nav>
                    <a href="/">Accueil</a>
                    <a href="/connexion">Connexion / Espace Membre</a>
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
                        <p style="font-size: 1rem; color: #4b5563; margin-bottom: 20px;">Accédez à votre espace élève/parent ou connectez-vous au panneau de contrôle.</p>
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

// 2. CONNEXION
app.get('/connexion', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Connexion - LEKOL S&H</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #f3f4f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .login-card { background: white; padding: 35px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
                h2 { color: #1e3a8a; margin-top: 0; text-align: center; }
                label { font-weight: bold; font-size: 0.9rem; color: #374151; }
                input { width: 100%; padding: 12px; margin: 8px 0 18px 0; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 1rem; }
                .btn { background-color: #2563eb; color: white; padding: 12px; border: none; border-radius: 6px; width: 100%; font-weight: bold; cursor: pointer; font-size: 1rem; }
                .back { display: block; text-align: center; margin-top: 15px; color: #4b5563; text-decoration: none; font-size: 0.9rem; }
            </style>
        </head>
        <body>
            <div class="login-card">
                <h2>Connexion LEKOL S&H</h2>
                <form action="/connexion" method="POST">
                    <label>Identifiant (Email ou Code Élève)</label>
                    <input type="text" name="identifiant" required placeholder="Ex: S&H-9518 ou fransenaugustin0@gmail.com">
                    
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

app.post('/connexion', async (req, res) => {
    const { identifiant, password } = req.body;
    try {
        const result = await pool.query(
            'SELECT * FROM utilisateurs WHERE (email = $1 OR code_eleve = $1) AND mot_de_passe = $2',
            [identifiant, password]
        );

        if (result.rows.length > 0) {
            const user = result.rows[0];
            if (user.role === 'ADMIN' || user.role === 'TITULAIRE' || user.role === 'PROF') {
                res.redirect(`/admin`);
            } else if (user.role === 'ELEVE' || user.role === 'PARENT') {
                res.redirect(`/espace-eleve?id=${user.id}`);
            }
        } else {
            res.send(`<script>alert('Identifiant ou mot de passe incorrect'); window.location.href='/connexion';</script>`);
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur de connexion.");
    }
});

// 3. ESPACE ÉLÈVE & PARENT
app.get('/espace-eleve', async (req, res) => {
    const eleveId = req.query.id;
    if (!eleveId) return res.redirect('/connexion');

    try {
        const eleveResult = await pool.query(`
            SELECT u.*, c.nom as nom_classe 
            FROM utilisateurs u 
            LEFT JOIN classes c ON u.classe_id = c.id 
            WHERE u.id = $1
        `, [eleveId]);

        if (eleveResult.rows.length === 0) return res.redirect('/connexion');
        const eleve = eleveResult.rows[0];

        const presencesResult = await pool.query('SELECT * FROM presences WHERE eleve_id = $1 ORDER BY date_presence DESC', [eleveId]);
        const presences = presencesResult.rows;

        const totalP = presences.filter(p => p.statut === 'PRESENT').length;
        const totalA = presences.filter(p => p.statut === 'ABSENT').length;
        const totalR = presences.filter(p => p.statut === 'RETARD').length;

        const devoirsResult = await pool.query('SELECT * FROM devoirs WHERE classe_id = $1 ORDER BY date_pour ASC', [eleve.classe_id]);
        const devoirs = devoirsResult.rows;

        const notesResult = await pool.query('SELECT * FROM notes WHERE eleve_id = $1 ORDER BY date_saisie DESC', [eleveId]);
        const notes = notesResult.rows;

        let html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Espace Élève - ${eleve.prenom} ${eleve.nom}</title>
                <style>
                    * { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; }
                    body { margin: 0; padding: 0; background-color: #f3f4f6; color: #1f2937; }
                    header { background: linear-gradient(135deg, #1d4ed8, #1e3a8a); color: white; padding: 25px 20px; }
                    .header-content { max-width: 900px; margin: auto; display: flex; justify-content: space-between; align-items: center; }
                    header h1 { margin: 0; font-size: 1.4rem; }
                    header p { margin: 5px 0 0 0; opacity: 0.9; font-size: 0.9rem; }
                    .logout { background: #dc2626; color: white; padding: 8px 15px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 0.85rem; }
                    .container { max-width: 900px; margin: 20px auto; padding: 0 15px; }
                    .grid-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
                    .stat-card { background: white; padding: 15px; border-radius: 10px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                    .stat-card h3 { margin: 0; font-size: 1.8rem; }
                    .stat-card p { margin: 5px 0 0 0; color: #6b7280; font-size: 0.85rem; font-weight: bold; }
                    .card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 20px; }
                    .card h2 { margin-top: 0; color: #1e3a8a; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; font-size: 1.2rem; }
                    input { width: 100%; padding: 10px; margin: 6px 0 12px 0; border: 1px solid #d1d5db; border-radius: 6px; }
                    .btn { background-color: #2563eb; color: white; padding: 10px 18px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #e5e7eb; padding: 10px; text-align: left; font-size: 0.9rem; }
                    th { background-color: #1e3a8a; color: white; }
                    .badge { padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem; color: white; display: inline-block; }
                    .badge-present { background-color: #16a34a; }
                    .badge-absent { background-color: #dc2626; }
                    .badge-retard { background-color: #d97706; }
                    .devoir-item { background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px; margin-bottom: 10px; border-radius: 4px; }
                </style>
            </head>
            <body>
                <header>
                    <div class="header-content">
                        <div>
                            <h1>Bonjour, ${eleve.prenom} ${eleve.nom} ! 👋</h1>
                            <p>Classe : <b>${eleve.nom_classe || 'Non assignée'}</b> | Code Élève : <b>${eleve.code_eleve}</b></p>
                        </div>
                        <a href="/" class="logout">Déconnexion</a>
                    </div>
                </header>

                <div class="container">
                    <div class="grid-stats">
                        <div class="stat-card">
                            <h3 style="color: #16a34a;">${totalP}</h3>
                            <p>PRÉSENCES</p>
                        </div>
                        <div class="stat-card">
                            <h3 style="color: #dc2626;">${totalA}</h3>
                            <p>ABSENCES</p>
                        </div>
                        <div class="stat-card">
                            <h3 style="color: #d97706;">${totalR}</h3>
                            <p>RETARDS</p>
                        </div>
                    </div>

                    <div class="card">
                        <h2>📚 Devoirs & Leçons à Faire</h2>
        `;

        if (devoirs.length === 0) {
            html += `<p style="color: #6b7280;">Aucun devoir enregistré pour le moment. Bravo ! 🎉</p>`;
        } else {
            devoirs.forEach(d => {
                html += `
                    <div class="devoir-item">
                        <h4 style="margin:0 0 5px 0; color:#1e40af;">Matière : ${d.matiere}</h4>
                        <p style="margin:0 0 5px 0;">${d.description}</p>
                        <small style="color:#64748b; font-weight:bold;">📅 À rendre pour le : ${new Date(d.date_pour).toLocaleDateString('fr-FR')}</small>
                    </div>
                `;
            });
        }

        html += `
                    </div>

                    <div class="card">
                        <h2>📅 Suivi des Présences & Retards</h2>
        `;

        if (presences.length === 0) {
            html += `<p style="color: #6b7280;">Aucune prise de présence enregistrée pour l'instant.</p>`;
        } else {
            html += `
                <table>
                    <tr>
                        <th>Date</th>
                        <th>Statut</th>
                        <th>Remarque</th>
                    </tr>
            `;
            presences.forEach(p => {
                let badgeClass = 'badge-present';
                if (p.statut === 'ABSENT') badgeClass = 'badge-absent';
                if (p.statut === 'RETARD') badgeClass = 'badge-retard';

                html += `
                    <tr>
                        <td><b>${new Date(p.date_presence).toLocaleDateString('fr-FR')}</b></td>
                        <td><span class="badge ${badgeClass}">${p.statut}</span></td>
                        <td>${p.remarque || 'Aucune'}</td>
                    </tr>
                `;
            });
            html += `</table>`;
        }

        html += `
                    </div>

                    <div class="card">
                        <h2>📊 Relevé des Notes</h2>
        `;

        if (notes.length === 0) {
            html += `<p style="color: #6b7280;">Aucune note enregistrée pour le moment.</p>`;
        } else {
            html += `
                <table>
                    <tr>
                        <th>Matière</th>
                        <th>Note</th>
                        <th>Période</th>
                    </tr>
            `;
            notes.forEach(n => {
                html += `
                    <tr>
                        <td><b>${n.matiere}</b></td>
                        <td><b style="color: #2563eb; font-size: 1.1rem;">${n.note}</b> / 100</td>
                        <td>${n.periode}</td>
                    </tr>
                `;
            });
            html += `</table>`;
        }

        html += `
                    </div>

                    <div class="card" style="background: #fffbeb; border-left: 5px solid #f59e0b;">
                        <h2>🔒 Mon Profil & Sécurité du Compte</h2>
                        <form action="/espace-eleve/update" method="POST">
                            <input type="hidden" name="eleve_id" value="${eleve.id}">
                            
                            <label><b>Nouveau Mot de Passe (pour remplacer "ecole2026")</b></label>
                            <input type="password" name="password" value="${eleve.mot_de_passe}" required>

                            <label><b>Adresse E-mail de contact</b></label>
                            <input type="email" name="email" value="${eleve.email || ''}" placeholder="votre-email@gmail.com">

                            <button type="submit" class="btn" style="background:#f59e0b;">Enregistrer mes informations</button>
                        </form>
                    </div>
                </div>
            </body>
            </html>
        `;

        res.send(html);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur chargement espace élève.");
    }
});

app.post('/espace-eleve/update', async (req, res) => {
    const { eleve_id, password, email } = req.body;
    try {
        await pool.query(
            'UPDATE utilisateurs SET mot_de_passe = $1, email = $2 WHERE id = $3',
            [password, email, eleve_id]
        );
        res.send(`<script>alert('Informations mises à jour avec succès !'); window.location.href='/espace-eleve?id=${eleve_id}';</script>`);
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur mise à jour.");
    }
});

// 4. PANNEAU ADMINISTRATION RÉORGANISÉ PAR ONGLETS & MENU
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

        let html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Administration - LEKOL S&H</title>
                <style>
                    * { box-sizing: border-box; font-family: 'Segoe UI', sans-serif; }
                    body { margin: 0; padding: 20px; background: #f3f4f6; }
                    .admin-container { max-width: 1000px; margin: auto; background: white; padding: 25px; border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                    .top-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 15px; margin-bottom: 20px; }
                    h1 { color: #1e3a8a; margin: 0; font-size: 1.5rem; }
                    .logout { background: #dc2626; color: white; padding: 8px 15px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 0.85rem; }
                    
                    /* Navigation Onglets */
                    .menu-tabs { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 25px; }
                    .tab-btn { background: #e2e8f0; border: none; padding: 12px 18px; border-radius: 8px; font-weight: bold; cursor: pointer; color: #334155; font-size: 0.95rem; }
                    .tab-btn.active { background: #2563eb; color: white; }

                    .section-tab { display: none; padding: 20px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }
                    .section-tab.active { display: block; }

                    input, select, textarea { width: 100%; padding: 12px; margin: 6px 0 15px 0; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.95rem; }
                    .btn { background-color: #2563eb; color: white; padding: 12px 20px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; }
                    .btn-danger { background-color: #dc2626; padding: 6px 12px; font-size: 0.85rem; width: auto; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; background: white; }
                    th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; font-size: 0.9rem; }
                    th { background-color: #1e3a8a; color: white; }
                </style>
                <script>
                    function openTab(tabName, btnElement) {
                        var tabs = document.getElementsByClassName('section-tab');
                        for (var i = 0; i < tabs.length; i++) {
                            tabs[i].classList.remove('active');
                        }
                        var btns = document.getElementsByClassName('tab-btn');
                        for (var i = 0; i < btns.length; i++) {
                            btns[i].classList.remove('active');
                        }
                        document.getElementById(tabName).classList.add('active');
                        btnElement.classList.add('active');
                    }
                </script>
            </head>
            <body>
                <div class="admin-container">
                    <div class="top-header">
                        <h1>⚙️ Panneau Direction - LEKOL S&H</h1>
                        <a href="/" class="logout">Déconnexion</a>
                    </div>

                    <!-- MENU DE NAVIGATION ADMINISTRATIVE -->
                    <div class="menu-tabs">
                        <button class="tab-btn active" onclick="openTab('tab-eleves', this)">📋 Élèves & Codes</button>
                        <button class="tab-btn" onclick="openTab('tab-appel', this)">📝 Prise d'Appel</button>
                        <button class="tab-btn" onclick="openTab('tab-notes', this)">📊 Notes</button>
                        <button class="tab-btn" onclick="openTab('tab-annonces', this)">📢 Annonces</button>
                    </div>

                    <!-- ONGLET 1 : INSCRIPTION & LISTE DES ÉLÈVES + CODES -->
                    <div id="tab-eleves" class="section-tab active">
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

                        <h3 style="margin-top: 30px; color:#1e3a8a;">📋 Liste complète des Élèves & Codes d'accès</h3>
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
                    <td><b style="color:#2563eb;">${e.code_eleve}</b></td>
                    <td>${e.nom} ${e.prenom}</td>
                    <td>${e.nom_classe || 'Non assigné'}</td>
                </tr>
            `;
        });

        html += `
                        </table>
                    </div>

                    <!-- ONGLET 2 : PRISE D'APPEL (PRÉSENCE / ABSENCE / RETARD) -->
                    <div id="tab-appel" class="section-tab">
                        <h2>📝 Faire l'Appel (Présence, Absence ou Retard)</h2>
                        <form action="/admin/presence" method="POST">
                            <label>Sélectionner l'Élève</label>
                            <select name="eleve_id" required>
                                <option value="">-- Choisir un élève --</option>
        `;

        elevesResult.rows.forEach(e => {
            html += `<option value="${e.id}">${e.nom} ${e.prenom} (${e.nom_classe || 'Sans classe'}) - Code: ${e.code_eleve}</option>`;
        });

        html += `
                            </select>

                            <label>Statut</label>
                            <select name="statut" required>
                                <option value="PRESENT">PRÉSENT</option>
                                <option value="ABSENT">ABSENT</option>
                                <option value="RETARD">RETARD</option>
                            </select>

                            <label>Date</label>
                            <input type="date" name="date_presence" required value="${new Date().toISOString().split('T')[0]}">

                            <label>Remarque (facultative)</label>
                            <input type="text" name="remarque" placeholder="Ex: Arrivé en retard / Mot d'excuse">

                            <button type="submit" class="btn" style="background:#16a34a;">Valider la Présence</button>
                        </form>
                    </div>

                    <!-- ONGLET 3 : NOTES -->
                    <div id="tab-notes" class="section-tab">
                        <h2>📊 Attribuer une Note à un Élève</h2>
                        <form action="/admin/note" method="POST">
                            <label>Sélectionner l'Élève</label>
                            <select name="eleve_id" required>
                                <option value="">-- Choisir un élève --</option>
        `;

        elevesResult.rows.forEach(e => {
            html += `<option value="${e.id}">${e.nom} ${e.prenom} (${e.nom_classe || 'Sans classe'})</option>`;
        });

        html += `
                            </select>

                            <label>Matière</label>
                            <input type="text" name="matiere" required placeholder="Ex: Mathématiques, Grammaire...">

                            <label>Note obtenue (sur 100)</label>
                            <input type="number" step="0.5" name="note" required placeholder="Ex: 85">

                            <label>Période / Contrôle</label>
                            <input type="text" name="periode" required placeholder="Ex: 1er Contrôle / Examen Trimestriel">

                            <button type="submit" class="btn">Enregistrer la Note</button>
                        </form>
                    </div>

                    <!-- ONGLET 4 : ANNONCES -->
                    <div id="tab-annonces" class="section-tab">
                        <h2>📢 Publier / Retirer une Annonce</h2>
                        <form action="/admin/annonce" method="POST" style="margin-bottom: 25px;">
                            <label>Titre de l'annonce</label>
                            <input type="text" name="titre" required placeholder="Ex: Congé du 18 mai...">
                            <label>Contenu</label>
                            <textarea name="contenu" rows="3" required></textarea>
                            <button type="submit" class="btn">Publier l'annonce</button>
                        </form>

                        <h3>Annonces en ligne :</h3>
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

// TRAITEMENTS
app.post('/admin/presence', async (req, res) => {
    const { eleve_id, statut, date_presence, remarque } = req.body;
    try {
        await pool.query(
            'INSERT INTO presences (eleve_id, statut, date_presence, remarque) VALUES ($1, $2, $3, $4)',
            [eleve_id, statut, date_presence, remarque]
        );
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur enregistrement présence.");
    }
});

app.post('/admin/note', async (req, res) => {
    const { eleve_id, matiere, note, periode } = req.body;
    try {
        await pool.query(
            'INSERT INTO notes (eleve_id, matiere, note, periode) VALUES ($1, $2, $3, $4)',
            [eleve_id, matiere, note, periode]
        );
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur enregistrement note.");
    }
});

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

app.post('/admin/annonce/delete/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM annonces WHERE id = $1', [req.params.id]);
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur suppression.");
    }
});

app.post('/admin/eleve', async (req, res) => {
    const { nom, prenom, classe_id, password } = req.body;
    try {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const code_eleve = `S&H-${randomNum}`;

        await pool.query(
            'INSERT INTO utilisateurs (nom, prenom, code_eleve, mot_de_passe, role, classe_id) VALUES ($1, $2, $3, $4, $5, $6)',
            [nom, prenom, code_eleve, password, 'ELEVE', classe_id]
        );

        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur inscription élève.");
    }
});

app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur le port ${port}`);
});
