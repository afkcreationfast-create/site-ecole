const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

const rolesAdmin = ["ADMIN", "TITULAIRE"];
const rolesProf = ["PROF"];
const rolesStaff = ["ADMIN", "TITULAIRE", "PROF"];

if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  console.error("Configure DATABASE_URL et SESSION_SECRET dans Render.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on("error", err => console.error("Erreur PostgreSQL:", err.message));

app.disable("x-powered-by");
if (isProduction) app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(express.json({ limit: "20mb" }));

// Permet d'accéder aux fichiers statiques (comme logo.jpeg à la racine)
app.use(express.static(__dirname));

app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  name: "lekolsid",
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: "Trop de tentatives. Réessaie dans 15 minutes."
});

const h = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));

const dateFr = value =>
  value ? new Date(value).toLocaleDateString("fr-FR", { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : "—";

// FIXATION STRICTE DE L'HEURE SUR LE FUSEAU HORAIRE D'HAÏTI
const getTodayDate = () => {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Port-au-Prince" });
};

// PLAN ANNUEL SCOLAIRE OFFICIEL 2026-2027 (LEKOL S&H)[span_1](start_span)[span_1](end_span)
const planScolaire2026 = {
  "2026-08": [
    { titre: "Inventaire & Acquisition", desc: "Achat et inventaire du matériel pour l'école primaire et le collège" },
    { titre: "Traitement des dossiers & entretiens", desc: "Rencontre et entretiens avec les nouveaux enseignants" },
    { titre: "Séminaire d'orientation professionnelle", desc: "Orientation de la Promotion 2026-2027" }
  ],
  "2026-09": [
    { titre: "Cours spécial de préparation", desc: "Cours de mise à niveau avant la grande ouverture" },
    { titre: "Réunion des parents", desc: "Lancement officiel de l'année scolaire" },
    { titre: "Séminaire des enseignants", desc: "Discussion et ateliers pédagogiques" },
    { titre: "Rentrée scolaire officielle", desc: "Vérification des uniformes et des livres" }
  ],
  "2026-10": [
    { titre: "Élection du conseil des élèves", desc: "Élections scolaires pour le Collège" },
    { titre: "Supervision officielle des enseignants", desc: "Observations en classe" },
    { titre: "Commémoration de la mort de Dessalines", desc: "Activité culturelle et historique" },
    { titre: "Réunion de suivi des parents", desc: "Préparation pour les examens trimestriels" }
  ],
  "2026-11": [
    { titre: "1er Examen Trimestriel", desc: "Évaluations du premier trimestre" },
    { titre: "Commémoration de Vertières", desc: "Célébration de la fête de l'Indépendance" }
  ],
  "2026-12": [
    { titre: "Remise des bulletins (Primaire & Collège)", desc: "Livraison officielle des résultats aux parents" },
    { titre: "Vacances de Noël", desc: "Début des vacances du premier trimestre" }
  ],
  "2027-01": [
    { titre: "Rentrée scolaire du 2ème trimestre", desc: "Reprise des cours pour tous les élèves" }
  ],
  "2027-02": [
    { titre: "2ème Examen Trimestriel", desc: "Évaluations du deuxième trimestre" },
    { titre: "Vacances de Carnaval & Mercredi des Cendres", desc: "Période de congé de Carnaval" },
    { titre: "Inscriptions ouvertes pour la Maternelle", desc: "Nouveaux élèves pour Kindergarten" }
  ],
  "2027-03": [
    { titre: "Inscriptions sur liste d'attente", desc: "Inscriptions Primaire & Collège" },
    { titre: "Remise des bulletins du 2ème trimestre", desc: "Distribution des résultats aux parents" },
    { titre: "EXPOSMART (Foire Scientifique & Techno)", desc: "Exposition des projets d'élèves en sciences et technologie" },
    { titre: "Anniversaire de l'École S&H", desc: "Célébration officielle de l'établissement" },
    { titre: "Vacances de Pâques", desc: "Congé de Pâques" }
  ],
  "2027-04": [
    { titre: "Examen d'entrée Maternelle", desc: "Tests d'admission" },
    { titre: "3ème Examen Trimestriel", desc: "Évaluations du troisième trimestre" }
  ],
  "2027-05": [
    { titre: "Remise des bulletins du 3ème trimestre", desc: "Remise des résultats" },
    { titre: "Fête du Drapeau", desc: "Défilé dans les rues avec les écoles du village" },
    { titre: "Pique-nique des enseignants & élèves", desc: "Journée récréative de détente" }
  ],
  "2027-06": [
    { titre: "4ème Examen Trimestriel & Examens d'État", desc: "Fin de l'année académique et examens officiels" },
    { titre: "Graduation Promotion 2026-2027", desc: "Cérémonie officielle de remise de diplômes" }
  ]
};

// MIGRATIONS AUTOMATIQUES BDD
async function initTables() {
  try {
    await pool.query(`
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS photo_url TEXT;
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS email VARCHAR(150);

      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        niveau VARCHAR(50) DEFAULT 'Fondamental'
      );
      
      CREATE TABLE IF NOT EXISTS matieres_classes (
        id SERIAL PRIMARY KEY,
        classe_id INT REFERENCES classes(id) ON DELETE CASCADE,
        nom_matiere VARCHAR(100) NOT NULL,
        nom_prof VARCHAR(100) DEFAULT 'Enseignant',
        coeff INT DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS horaires (
        id SERIAL PRIMARY KEY,
        classe_id INT REFERENCES classes(id) ON DELETE CASCADE,
        jour VARCHAR(20) NOT NULL,
        heure_debut VARCHAR(10) NOT NULL,
        heure_fin VARCHAR(10) NOT NULL,
        matiere VARCHAR(100) NOT NULL,
        professeur VARCHAR(100) DEFAULT 'Enseignant',
        coeff INT DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS annonces (
        id SERIAL PRIMARY KEY,
        titre VARCHAR(200) NOT NULL,
        contenu TEXT NOT NULL,
        date_pub DATE DEFAULT CURRENT_DATE,
        auteur VARCHAR(100) DEFAULT 'Direction'
      );

      CREATE TABLE IF NOT EXISTS galerie (
        id SERIAL PRIMARY KEY,
        titre VARCHAR(200) NOT NULL,
        photo_base64 TEXT NOT NULL,
        date_ajout DATE DEFAULT CURRENT_DATE
      );

      CREATE TABLE IF NOT EXISTS presences (
        id SERIAL PRIMARY KEY,
        eleve_id INT REFERENCES utilisateurs(id) ON DELETE CASCADE,
        classe_id INT REFERENCES classes(id) ON DELETE CASCADE,
        date_presence DATE NOT NULL,
        statut VARCHAR(20) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS devoirs (
        id SERIAL PRIMARY KEY,
        classe_id INT REFERENCES classes(id) ON DELETE CASCADE,
        matiere VARCHAR(100) NOT NULL,
        titre VARCHAR(200) NOT NULL,
        description TEXT NOT NULL,
        date_pour DATE NOT NULL,
        date_pub DATE DEFAULT CURRENT_DATE,
        professeur VARCHAR(100) DEFAULT 'Enseignant',
        image_url TEXT
      );

      ALTER TABLE devoirs ADD COLUMN IF NOT EXISTS image_url TEXT;
      ALTER TABLE devoirs ADD COLUMN IF NOT EXISTS date_pub DATE DEFAULT CURRENT_DATE;
      ALTER TABLE devoirs ADD COLUMN IF NOT EXISTS professeur VARCHAR(100) DEFAULT 'Enseignant';

      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'presences_eleve_id_date_presence_key') THEN
          ALTER TABLE presences ADD CONSTRAINT presences_eleve_id_date_presence_key UNIQUE (eleve_id, date_presence);
        END IF;
      END $$;

      ALTER TABLE notes ADD COLUMN IF NOT EXISTS total_max INT DEFAULT 100;
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS type_eval VARCHAR(50) DEFAULT 'Contrôle';
    `);

    const checkClasses = await pool.query("SELECT COUNT(*) FROM classes");
    if (parseInt(checkClasses.rows[0].count) === 0) {
      await pool.query("INSERT INTO classes (nom, niveau) VALUES ('1ère Année A', 'Fondamental'), ('1ère Année B', 'Fondamental'), ('2ème Année A', 'Fondamental'), ('Kindergarten', 'Maternelle')");
    }
  } catch(err) {
    console.log("Info DB init:", err.message);
  }
}

initTables();

// LAYOUT RESPONSIVE & STYLE GLOBAL (DESIGN PREMIUM 2026)
const layout = (title, content, req) => {
  const isAuth = !!req.session.user;
  const user = isAuth ? req.session.user : null;
  const userRole = user ? user.role : null;
  const photo = user && user.photo_url ? user.photo_url : "https://via.placeholder.com/40";

  const schoolLogoHtml = `<a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;">
    <img src="/logo.jpeg" alt="LEKOL S&H" style="width:42px;height:42px;object-fit:contain;border-radius:8px;background:#ffffff;padding:2px;image-rendering:-webkit-optimize-contrast;">
    <span style="font-size:1.2rem;font-weight:900;color:#fff;letter-spacing:0.5px">LEKOL <span style="color:var(--gold)">S&amp;H</span></span>
  </a>`;

  let navItems = `<a href="/" class="nav-item">🏠 Tableau de Bord</a>
                  <a href="/devoirs" class="nav-item">📖 Devoirs &amp; Leçons</a>
                  <a href="/horaire" class="nav-item">📅 Horaire des Cours</a>
                  <a href="/calendrier" class="nav-item">🗓️ Calendrier &amp; Présence</a>
                  <a href="/galerie" class="nav-item">📸 Galerie Scolaire</a>`;

  if (isAuth) {
    if (rolesAdmin.includes(userRole)) {
      navItems += `<a href="/admin/appel" class="nav-item">📝 Prise d'Appel</a>
                   <a href="/admin" class="nav-item">⚙️ Panneau Direction</a>`;
    } else if (rolesProf.includes(userRole)) {
      navItems += `<a href="/admin/appel" class="nav-item">📝 Prise d'Appel</a>
                   <a href="/prof" class="nav-item">👨‍🏫 Espace Professeur</a>`;
    } else if (userRole === "PARENT") {
      navItems += `<a href="/espace-parent" class="nav-item">👪 Espace Parent</a>`;
    } else if (userRole === "ELEVE") {
      navItems += `<a href="/espace-eleve" class="nav-item">👨‍🎓 Mon Dossier &amp; Badge</a>`;
    }
  } else {
    navItems += `<a href="/connexion" class="nav-item">🔑 Se Connecter</a>`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="theme-color" content="#101d3a">
<title>${h(title)} — LEKOL S&amp;H</title>
<style>
/* ==========================================
   LEKOL S&H — DESIGN PREMIUM 2026
========================================== */

:root {
  --navy: #101d3a;
  --blue: #2457e6;
  --blue-hover: #1947c7;
  --gold: #f4b942;
  --bg: #f4f7fc;
  --card: #ffffff;
  --text: #17233d;
  --muted: #64748b;
  --border: #e2e8f0;
  --success: #15803d;
  --danger: #dc2626;
  --sidebar-w: 260px;
}

body {
  background:
    radial-gradient(ellipse at top right, #e6edff 0%, transparent 40%),
    var(--bg);
  color: var(--text);
  font-family: Inter, "Segoe UI", system-ui, sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  display: flex;
  min-height: 100vh;
  margin: 0;
}

.sidebar {
  width: var(--sidebar-w);
  background: linear-gradient(180deg, #101d3a 0%, #172b52 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0; bottom: 0; left: 0;
  z-index: 1000;
  transition: transform .3s ease;
  box-shadow: 8px 0 32px rgba(15, 23, 42, 0.08);
}

.sidebar-header {
  padding: 20px 18px;
  border-bottom: 1px solid rgba(255,255,255,.10);
  display: flex; justify-content: space-between; align-items: center;
}
.close-sidebar-btn { display: none; background: none; border: none; color: #fff; font-size: 1.5rem; cursor: pointer; }

.user-sidebar-card { 
  display: flex; align-items: center; gap: 12px; 
  padding: 15px 20px; 
  border-bottom: 1px solid rgba(255,255,255,.10); 
  background: rgba(255,255,255,.055); 
}
.user-avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid var(--blue); image-rendering: -webkit-optimize-contrast; }

.sidebar-nav { padding: 15px 10px; flex: 1; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.nav-item {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 15px;
  border-radius: 12px;
  margin: 2px 0;
  color: #cbd5e1; text-decoration: none; font-weight: 600; font-size: .92rem;
  transition: background .2s ease, transform .2s ease, color .2s ease;
}
.nav-item:hover {
  background: rgba(255,255,255,.10);
  transform: translateX(3px);
  color: #fff;
}
.nav-item.active {
  background: linear-gradient(135deg, #3269f2, #2457e6);
  box-shadow: 0 6px 18px rgba(36,87,230,.25);
  color: #fff;
}

.main-wrapper { flex: 1; margin-left: var(--sidebar-w); display: flex; flex-direction: column; min-width: 0; width: 100%; }

header.topbar {
  position: sticky; top: 0; z-index: 900;
  background: rgba(255,255,255,.92);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(226,232,240,.85);
  padding: 16px 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
}
.toggle-btn { display: none; background: none; border: none; font-size: 1.6rem; cursor: pointer; color: var(--navy); }
.user-badge { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: .9rem; }

main.content { max-width: 1440px; padding: 28px; margin: 0 auto; width: 100%; min-width: 0; }

.card {
  background: rgba(255,255,255,.96);
  border: 1px solid #e7ecf5;
  border-radius: 20px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 8px 28px rgba(25,42,75,.045);
  transition: box-shadow .2s ease;
  word-wrap: break-word; overflow: hidden;
}

.card h1, .card h2, .card h3 { color: var(--navy); line-height: 1.3; }

label { display: block; font-weight: 650; font-size: .88rem; margin: 12px 0 4px; color: #334155; }
input, select, textarea {
  width: 100%; min-height: 45px;
  border: 1px solid #d9e1ee; border-radius: 11px;
  padding: 12px 14px; background: #fff; font: inherit; color: var(--text);
  transition: border-color .2s ease, box-shadow .2s ease;
}
input:focus, select:focus, textarea:focus {
  outline: none; border-color: #6d91f8; box-shadow: 0 0 0 4px rgba(36,87,230,.10);
}

.btn, button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--blue); color: #fff; border: 0;
  border-radius: 11px; padding: 12px 19px;
  font: inherit; font-weight: 750; text-decoration: none; cursor: pointer;
  box-shadow: 0 4px 10px rgba(36,87,230,.12);
  transition: transform .18s ease, background .18s ease, box-shadow .18s ease;
  text-align: center;
}
.btn:hover, button:hover {
  background: var(--blue-hover);
  transform: translateY(-1px);
  box-shadow: 0 7px 16px rgba(36,87,230,.18);
}
.btn.secondary { background: #f1f5f9; color: #334155; border: 1px solid var(--border); box-shadow: none; }
.btn.danger { background: var(--danger); padding: 5px 10px; font-size: .8rem; box-shadow: none; }
.btn.full { width: 100%; }

.tile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin: 18px 0 30px; }
.tile {
  position: relative; overflow: hidden; min-height: 165px;
  padding: 23px; border-radius: 19px; border: 1px solid #e5eaf4;
  background: linear-gradient(145deg, #fff, #f9fbff);
  text-decoration: none; color: var(--text); display: flex; flex-direction: column; gap: 10px;
  box-shadow: 0 6px 20px rgba(25,42,75,.045);
  transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
}
.tile:hover {
  transform: translateY(-5px); border-color: #b9cbff;
  box-shadow: 0 16px 32px rgba(36,87,230,.12);
}
.tile-icon {
  width: 54px; height: 54px; border-radius: 16px;
  background: linear-gradient(135deg, #e8efff, #dbe7ff);
  color: var(--blue); font-size: 1.9rem;
  display: flex; align-items: center; justify-content: center;
}
.tile-title { font-size: 1.08rem; font-weight: 800; color: var(--navy); letter-spacing: -.2px; }
.tile-desc { font-size: .9rem; color: var(--muted); line-height: 1.55; }

.excel-table-container {
  width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;
  margin-top: 10px; border-radius: 14px; border: 1px solid var(--border);
  box-shadow: 0 4px 15px rgba(15,23,42,.035);
}
.excel-table { width: 100%; border-collapse: collapse; background: #fff; font-size: .88rem; min-width: 500px; }
.excel-table th { background: #172b52; color: #fff; text-align: left; padding: 14px 12px; font-weight: 700; border: 1px solid #334155; white-space: nowrap; }
.excel-table td { padding: 13px 12px; border: 1px solid #e2e8f0; }
.excel-table tr:nth-child(even) { background: #f8fafc; }
.excel-badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: .78rem; font-weight: 700; background: #eff6ff; color: #1d4ed8; }

.devoir-card {
  background: #fff; border: 1px solid var(--border); border-left: 5px solid var(--blue);
  border-radius: 15px; padding: 20px; margin-bottom: 14px;
  box-shadow: 0 5px 16px rgba(15,23,42,.04);
  transition: box-shadow .2s ease, transform .2s ease;
}
.devoir-card:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(15,23,42,.08); }
.devoir-date-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: .78rem; font-weight: 800; background: #fef3c7; color: #92400e; margin-bottom: 8px; }
.devoir-date-badge.urgent { background: #fee2e2; color: #991b1b; }
.devoir-img { width: 100%; max-height: 350px; object-fit: contain; background: #f8fafc; border-radius: 8px; border: 1px solid var(--border); margin: 10px 0; cursor: pointer; image-rendering: -webkit-optimize-contrast; }

.student-badge-card {
  width: 100%; max-width: 360px; margin: 0 auto 20px auto;
  background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%);
  border-radius: 22px; padding: 20px; color: #fff;
  box-shadow: 0 18px 40px rgba(15,23,42,.22); border: 2px solid #3b82f6;
  position: relative; overflow: hidden;
}
.badge-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 12px; margin-bottom: 16px; }
.badge-school { font-size: .9rem; font-weight: 900; letter-spacing: 1px; color: var(--gold); }
.badge-body { display: flex; align-items: center; gap: 16px; }
.badge-photo { width: 85px; height: 85px; border-radius: 12px; object-fit: cover; border: 3px solid #fff; background: #cbd5e1; image-rendering: -webkit-optimize-contrast; }
.badge-info { flex: 1; min-width: 0; }
.badge-name { font-size: 1.1rem; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; }
.badge-code { font-family: monospace; font-size: .9rem; background: rgba(255,255,255,0.15); padding: 3px 8px; border-radius: 6px; display: inline-block; margin-top: 4px; font-weight: 700; }
.badge-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; font-size: .75rem; opacity: .85; border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 10px; }

.gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-top: 15px; }
.gallery-card {
  background: #fff; border-radius: 17px; border: 1px solid var(--border); overflow: hidden;
  box-shadow: 0 8px 22px rgba(15,23,42,.06);
  transition: transform .2s ease, box-shadow .2s ease;
}
.gallery-card:hover { transform: translateY(-4px); box-shadow: 0 14px 30px rgba(15,23,42,.12); }
.gallery-img { width: 100%; height: 180px; object-fit: cover; border-bottom: 1px solid var(--border); image-rendering: -webkit-optimize-contrast; }
.gallery-body { padding: 12px; }

.calendar-grid { 
  display: grid !important; grid-template-columns: repeat(7, 1fr) !important; 
  gap: 8px !important; margin-top: 14px !important; text-align: center !important; 
}
.calendar-day-head { font-weight: 700; font-size: .82rem; color: var(--muted); text-transform: uppercase; padding: 6px 0; }
.calendar-cell { padding: 12px 6px; border-radius: 8px; font-weight: 700; font-size: .9rem; background: #f8fafc; border: 1px solid var(--border); }
.calendar-cell.empty { background: transparent; border: none; }
.calendar-cell.present { background: #22c55e; color: #fff; border-color: #16a34a; }
.calendar-cell.absent { background: #ef4444; color: #fff; border-color: #dc2626; }
.calendar-cell.retard { background: #64748b; color: #fff; border-color: #475569; }

a { -webkit-tap-highlight-color: transparent; }
button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 3px solid #93b4ff; outline-offset: 3px;
}

@media(max-width: 900px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .main-wrapper { margin-left: 0; }
  .toggle-btn { display: block; }
  .close-sidebar-btn { display: block; }
  header.topbar { padding: 13px 15px; }
  main.content { padding: 18px 13px; }
  .card { padding: 18px; border-radius: 16px; margin-bottom: 18px; }
  .tile-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .tile { min-width: 0; min-height: 145px; padding: 15px; border-radius: 15px; }
  .tile-title { font-size: .98rem; }
  .tile-desc { font-size: .82rem; }
}

@media (max-width: 420px) {
  .tile-grid { grid-template-columns: 1fr; }
  main.content { padding: 12px 10px; }
  .card { padding: 15px; }
  header.topbar > div:first-of-type { font-size: .86rem !important; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important;
  }
}
</style>
</head>
<body>

<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    ${schoolLogoHtml}
    <button class="close-sidebar-btn" onclick="document.getElementById('sidebar').classList.remove('open')">✕</button>
  </div>
  ${isAuth ? `
  <div class="user-sidebar-card">
    <img src="${h(photo)}" class="user-avatar" alt="Avatar">
    <div style="overflow:hidden">
      <strong style="display:block;font-size:.88rem;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;color:#fff">${h(user.prenom)} ${h(user.nom)}</strong>
      <span style="font-size:.75rem;color:var(--gold);font-weight:700">${h(user.role)}</span>
    </div>
  </div>` : ''}
  <nav class="sidebar-nav">
    ${navItems}
  </nav>
</aside>

<div class="main-wrapper">
  <header class="topbar">
    <button class="toggle-btn" onclick="document.getElementById('sidebar').classList.add('open')">☰</button>
    <div style="font-weight:800;color:var(--navy);font-size:1.05rem">LEKOL S&amp;H — Portail Officiel</div>
    <div class="user-badge">
      ${isAuth ? `<a class="btn secondary" href="/deconnexion" style="padding:6px 12px;font-size:.8rem">Sortir</a>` : `<a class="btn" href="/connexion" style="padding:6px 12px;font-size:.8rem">Connexion</a>`}
    </div>
  </header>

  <main class="content">
    ${content}
  </main>
</div>

</body>
</html>`;
};

// PROTECTIONS DES ACCÈS
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!rolesAdmin.includes(req.session.user.role)) return res.redirect(getHomeByRole(req.session.user.role));
  next();
}

function requireStaff(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!rolesStaff.includes(req.session.user.role)) return res.redirect(getHomeByRole(req.session.user.role));
  next();
}

function requireStudent(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (req.session.user.role !== "ELEVE") return res.redirect(getHomeByRole(req.session.user.role));
  next();
}

function getHomeByRole(role) {
  if (rolesAdmin.includes(role)) return "/admin";
  if (rolesProf.includes(role)) return "/prof";
  if (role === "PARENT") return "/espace-parent";
  return "/espace-eleve";
}

function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}

function csrfField(req) {
  return `<input type="hidden" name="_csrf" value="${h(csrfToken(req))}">`;
}

app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const supplied = req.body?._csrf;
    const expected = req.session?.csrfToken;
    if (!supplied || !expected || supplied.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return res.status(403).send("Formulaire expiré.");
    }
  }
  next();
});

// ROUTE ACCUEIL
app.get("/", async (req, res) => {
  try {
    const todayStr = dateFr(getTodayDate());
    const isAuth = !!req.session.user;
    const role = isAuth ? req.session.user.role : null;

    const annonces = await pool.query("SELECT * FROM annonces ORDER BY id DESC LIMIT 5").catch(() => ({ rows: [] }));

    let tilesHtml = "";

    if (!isAuth) {
      tilesHtml = `
        <a href="/connexion" class="tile"><div class="tile-icon">🔑</div><div class="tile-title">Se Connecter</div><div class="tile-desc">Accéder à son espace privé</div></a>
        <a href="/devoirs" class="tile"><div class="tile-icon">📖</div><div class="tile-title">Consulter les Devoirs</div><div class="tile-desc">Connectez-vous pour voir votre classe</div></a>
        <a href="/galerie" class="tile"><div class="tile-icon">📸</div><div class="tile-title">Galerie Scolaire</div><div class="tile-desc">Événements et activités</div></a>`;
    } else if (rolesAdmin.includes(role)) {
      tilesHtml = `
        <a href="/devoirs" class="tile"><div class="tile-icon">📖</div><div class="tile-title">Publier Devoir/Leçon</div><div class="tile-desc">Gérer les devoirs avec photos</div></a>
        <a href="/admin/appel" class="tile"><div class="tile-icon">📝</div><div class="tile-title">Prise d'Appel</div><div class="tile-desc">Faire l'appel par classe</div></a>
        <a href="/horaire" class="tile"><div class="tile-icon">📅</div><div class="tile-title">Éditer les Horaires</div><div class="tile-desc">Gérer les emplois du temps</div></a>
        <a href="/admin" class="tile"><div class="tile-icon">⚙️</div><div class="tile-title">Panneau Direction</div><div class="tile-desc">Espaces de gestion spécialisés</div></a>`;
    } else if (rolesProf.includes(role)) {
      tilesHtml = `
        <a href="/devoirs" class="tile"><div class="tile-icon">📖</div><div class="tile-title">Donner un Devoir</div><div class="tile-desc">Ajouter leçon ou exercice</div></a>
        <a href="/admin/appel" class="tile"><div class="tile-icon">📝</div><div class="tile-title">Faire l'Appel</div><div class="tile-desc">Présences du jour</div></a>
        <a href="/admin/notes" class="tile"><div class="tile-icon">📊</div><div class="tile-title">Saisir les Notes</div><div class="tile-desc">Notes &amp; évaluations</div></a>`;
    } else if (role === "ELEVE") {
      tilesHtml = `
        <a href="/devoirs" class="tile"><div class="tile-icon">📖</div><div class="tile-title">Mes Devoirs &amp; Leçons</div><div class="tile-desc">Travail à faire pour ma classe</div></a>
        <a href="/espace-eleve" class="tile"><div class="tile-icon">🎓</div><div class="tile-title">Mon Dossier &amp; Badge</div><div class="tile-desc">Notes, bulletin et carte d'étudiant</div></a>
        <a href="/horaire" class="tile"><div class="tile-icon">📅</div><div class="tile-title">Mon Emploi du Temps</div><div class="tile-desc">Horaire officiel de ma classe</div></a>`;
    } else if (role === "PARENT") {
      tilesHtml = `
        <a href="/devoirs" class="tile"><div class="tile-icon">📖</div><div class="tile-title">Devoirs de l'enfant</div><div class="tile-desc">Suivi du cahier de textes</div></a>
        <a href="/espace-parent" class="tile"><div class="tile-icon">👪</div><div class="tile-title">Espace Parent</div><div class="tile-desc">Suivi global de votre enfant</div></a>`;
    }

    const annoncesHtml = annonces.rows.map(a => `
      <div style="border-left:4px solid var(--blue);padding:12px 16px;background:#f8fafc;border-radius:0 8px 8px 0;margin-bottom:12px">
        <strong style="color:var(--navy);font-size:1rem;display:block">${h(a.titre)}</strong>
        <span style="font-size:.78rem;color:var(--muted)">Publié le ${dateFr(a.date_pub)} par <b>${h(a.auteur)}</b></span>
        <p style="margin-top:6px;font-size:.9rem;color:#334155">${h(a.contenu)}</p>
      </div>
    `).join("") || "<p style='color:var(--muted)'>Aucun communiqué officiel pour le moment.</p>";

    const content = `
      <div class="card" style="background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:24px">
        <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:999px;font-size:.8rem;font-weight:700">📅 ${todayStr}</span>
        <h1 style="font-size:1.8rem;margin:10px 0 4px;color:#fff">Portail Officiel — LEKOL S&amp;H</h1>
        <p style="opacity:.9;font-size:.9rem">Plateforme de gestion scolaire officielle.</p>
      </div>

      <section class="card">
        <h2 style="margin-bottom:12px;color:var(--navy);display:flex;align-items:center;gap:8px">📢 Panneau d'Annonces &amp; Communiqués</h2>
        ${annoncesHtml}
      </section>

      <h2 style="margin-bottom:14px;color:var(--navy)">Accès Rapides</h2>
      <div class="tile-grid">${tilesHtml}</div>`;

    res.send(layout("Tableau de bord", content, req));
  } catch (e) { res.status(500).send("Erreur accueil."); }
});

// ROUTE DEVOIRS & LEÇONS
app.get("/devoirs", async (req, res) => {
  try {
    const isAuth = !!req.session.user;
    const userRole = isAuth ? req.session.user.role : null;
    const isStaff = rolesStaff.includes(userRole);
    const isEleve = userRole === "ELEVE";

    const classes = await pool.query("SELECT id, nom FROM classes ORDER BY id ASC");
    if (classes.rows.length === 0) {
      return res.send(layout("Devoirs", "<section class='card'><h2>Aucune classe</h2><p>Ajoutez des classes dans l'administration.</p></section>", req));
    }

    if (!isAuth) {
      const content = `
        <section class="card" style="text-align:center;padding:40px 20px;">
          <h2>🔒 Espace Sécurisé</h2>
          <p style="color:var(--muted);margin:10px 0 20px">Vous devez vous connecter avec votre compte pour consulter le cahier de textes et les devoirs de votre classe.</p>
          <a href="/connexion" class="btn" style="padding:12px 24px;">🔑 Se Connecter maintenant</a>
        </section>`;
      return res.send(layout("Connexion Requise", content, req));
    }

    let selectedClasseId;
    if (isEleve) {
      selectedClasseId = req.session.user.classe_id;
    } else if (isStaff && req.query.classe_id) {
      selectedClasseId = Number(req.query.classe_id);
    } else {
      selectedClasseId = req.query.classe_id ? Number(req.query.classe_id) : (req.session.user.classe_id || classes.rows[0].id);
    }

    const [selectedClasse, devoirsRes] = await Promise.all([
      pool.query("SELECT nom FROM classes WHERE id=$1", [selectedClasseId]),
      pool.query("SELECT d.*, TO_CHAR(d.date_pour, 'YYYY-MM-DD') as date_pour_fmt, TO_CHAR(COALESCE(d.date_pub, CURRENT_DATE), 'YYYY-MM-DD') as date_pub_fmt FROM devoirs d WHERE d.classe_id=$1 ORDER BY d.date_pour ASC", [selectedClasseId])
    ]);

    const classeNom = selectedClasse.rows[0]?.nom || "Ma Classe";

    let selectorHtml = "";
    if (isStaff) {
      const classOptionsHtml = classes.rows.map(c => `
        <option value="${c.id}" ${c.id === selectedClasseId ? "selected" : ""}>${h(c.nom)}</option>
      `).join("");

      selectorHtml = `
        <div style="min-width:200px">
          <label style="margin-top:0">Sélectionner une classe :</label>
          <select onchange="window.location.href='/devoirs?classe_id=' + this.value">
            ${classOptionsHtml}
          </select>
        </div>`;
    }

    const today = getTodayDate();

    const devoirsHtml = devoirsRes.rows.map(d => {
      const isUrgent = d.date_pour_fmt <= today;
      const dateLabel = d.date_pour_fmt === today ? "📌 POUR AUJOURD'HUI" : (d.date_pour_fmt < today ? "⚠️ DÉPASSÉ" : `📅 Pour le ${dateFr(d.date_pour_fmt)}`);
      const imageHtml = d.image_url ? `<a href="${h(d.image_url)}" target="_blank"><img src="${h(d.image_url)}" class="devoir-img" alt="Exercice en image"></a>` : "";

      return `
        <div class="devoir-card" style="border-left-color:${isUrgent ? '#dc2626' : '#2563eb'}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
            <div>
              <span class="devoir-date-badge ${isUrgent ? 'urgent' : ''}">${dateLabel}</span>
              <span class="excel-badge" style="margin-left:6px">${h(d.matiere)}</span>
            </div>
            <span style="font-size:.78rem;color:var(--muted)">Prof. <b>${h(d.professeur || 'Enseignant')}</b></span>
          </div>

          <h3 style="color:var(--navy);margin:8px 0 4px">${h(d.titre)}</h3>
          <p style="color:#334155;font-size:.92rem;white-space:pre-wrap;margin-bottom:10px">${h(d.description)}</p>

          ${imageHtml}

          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px dashed var(--border);padding-top:8px;font-size:.78rem;color:var(--muted)">
            <span>Publié le ${dateFr(d.date_pub_fmt)}</span>
            ${isStaff ? `
              <form method="post" action="/admin/devoir/supprimer" style="display:inline">
                ${csrfField(req)}
                <input type="hidden" name="id" value="${d.id}">
                <input type="hidden" name="classe_id" value="${selectedClasseId}">
                <button type="submit" class="btn danger" onclick="return confirm('Supprimer ce devoir ?')">🗑️ Supprimer</button>
              </form>` : ""}
          </div>
        </div>`;
    }).join("") || "<p style='color:var(--muted);padding:20px;text-align:center'>Aucun devoir ni leçon enregistrés pour cette classe.</p>";

    let formAjoutHtml = "";
    if (isStaff) {
      formAjoutHtml = `
        <section class="card" style="border:2px solid var(--blue);background:#eff6ff">
          <h2>➕ Donner un Devoir / Leçon pour : <span style="color:var(--blue)">${h(classeNom)}</span></h2>
          <form method="post" action="/admin/devoir">
            ${csrfField(req)}
            <input type="hidden" name="classe_id" value="${selectedClasseId}">

            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px">
              <div>
                <label>Matière</label>
                <input name="matiere" required placeholder="Ex. Mathématiques, Français...">
              </div>
              <div>
                <label>Pour quelle date ? (Date limite/rendu)</label>
                <input type="date" name="date_pour" value="${today}" required>
              </div>
            </div>

            <label>Titre du devoir / sujet de la leçon</label>
            <input name="titre" required placeholder="Ex. Exercices p. 42 #1 à 5 / Leçon à étudier">

            <label>Explications détaillées &amp; Consignes</label>
            <textarea name="description" rows="4" required placeholder="Écrivez clairement les consignes ou les numéros de l'exercice..."></textarea>

            <label>📷 Joindre une Photo du Livre / Exercice (Optionnel) :</label>
            <input type="file" id="devoirFileInput" accept="image/*" style="display:none">
            <input type="hidden" name="image_url" id="devoirImageBase64">
            
            <button type="button" class="btn secondary" style="width:100%;margin-top:6px" onclick="document.getElementById('devoirFileInput').click()">📁 Prenez en photo / Choisir une image</button>
            <div id="previewText" style="font-size:.8rem;color:var(--success);margin-top:6px;font-weight:bold"></div>

            <button type="submit" class="btn full" style="margin-top:14px">📢 Publier le Devoir</button>
          </form>
        </section>

        <script>
          document.getElementById('devoirFileInput').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = function(event) {
                document.getElementById('devoirImageBase64').value = event.target.result;
                document.getElementById('previewText').innerText = "✅ Photo sélectionnée (" + file.name + ")";
              };
              reader.readAsDataURL(file);
            }
          });
        </script>`;
    }

    const content = `
      <div class="card">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:15px">
          <div>
            <h2>📖 Devoirs &amp; Leçons (Cahier de Textes)</h2>
            <p style="color:var(--muted)">Devoirs et révisions de la classe : <b style="color:var(--blue)">${h(classeNom)}</b></p>
          </div>
          ${selectorHtml}
        </div>
      </div>

      ${formAjoutHtml}

      <section class="card">
        <h2 style="margin-bottom:15px">📋 Liste des Travaux &amp; Leçons</h2>
        ${devoirsHtml}
      </section>`;

    res.send(layout(`Devoirs - ${classeNom}`, content, req));
  } catch (e) {
    console.error("ERREUR DEVOIRS:", e.message);
    res.status(500).send(layout("Erreur", `<section class='card'><h2>Erreur d'affichage des devoirs</h2><p style='color:var(--danger)'>${h(e.message)}</p></section>`, req));
  }
});

app.post("/admin/devoir", requireStaff, async (req, res) => {
  const { classe_id, matiere, titre, description, date_pour, image_url } = req.body;
  const user = req.session.user;
  const profNom = `${user.prenom} ${user.nom}`;
  try {
    if (classe_id && matiere && titre && description && date_pour) {
      await pool.query(
        "INSERT INTO devoirs (classe_id, matiere, titre, description, date_pour, professeur, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [Number(classe_id), String(matiere).trim(), String(titre).trim(), String(description).trim(), date_pour, profNom, image_url || null]
      );
    }
    res.redirect(`/devoirs?classe_id=${classe_id}`);
  } catch (e) {
    res.status(500).send("Erreur publication devoir : " + e.message);
  }
});

app.post("/admin/devoir/supprimer", requireStaff, async (req, res) => {
  const { id, classe_id } = req.body;
  try {
    await pool.query("DELETE FROM devoirs WHERE id=$1", [Number(id)]);
    res.redirect(`/devoirs?classe_id=${classe_id}`);
  } catch (e) {
    res.status(500).send("Erreur suppression devoir.");
  }
});

// ROUTE PRISE D'APPEL
app.get("/admin/appel", requireStaff, async (req, res) => {
  try {
    const classes = await pool.query("SELECT id, nom FROM classes ORDER BY id ASC");
    if (classes.rows.length === 0) {
      return res.send(layout("Prise d'Appel", "<section class='card'><h2>Aucune classe</h2><p>Veuillez d'abord ajouter des classes.</p></section>", req));
    }

    const selectedClasseId = req.query.classe_id ? Number(req.query.classe_id) : classes.rows[0].id;
    const selectedDate = req.query.date || getTodayDate();

    const [students, presences] = await Promise.all([
      pool.query("SELECT id, nom, prenom, code_eleve, photo_url FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom ASC, prenom ASC", [selectedClasseId]),
      pool.query("SELECT eleve_id, statut FROM presences WHERE classe_id=$1 AND date_presence=$2", [selectedClasseId, selectedDate])
    ]);

    const presenceMap = {};
    presences.rows.forEach(p => { presenceMap[p.eleve_id] = p.statut; });

    const classOptionsHtml = classes.rows.map(c => `
      <option value="${c.id}" ${c.id === selectedClasseId ? "selected" : ""}>${h(c.nom)}</option>
    `).join("");

    const rowsHtml = students.rows.map(s => {
      const currentStatut = presenceMap[s.id] || "PRESENT";
      const photo = s.photo_url || "https://via.placeholder.com/40";
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <img src="${h(photo)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;image-rendering:-webkit-optimize-contrast;">
              <div>
                <b>${h(s.nom)} ${h(s.prenom)}</b>
                <div style="font-size:.78rem;color:var(--muted)">${h(s.code_eleve)}</div>
              </div>
            </div>
          </td>
          <td>
            <select name="statut_${s.id}" style="padding:6px 10px">
              <option value="PRESENT" ${currentStatut === "PRESENT" ? "selected" : ""}>✅ Présent</option>
              <option value="ABSENT" ${currentStatut === "ABSENT" ? "selected" : ""}>❌ Absent</option>
              <option value="RETARD" ${currentStatut === "RETARD" ? "selected" : ""}>⏳ Retard</option>
            </select>
          </td>
        </tr>`;
    }).join("") || "<tr><td colspan='2' style='text-align:center;padding:15px'>Aucun élève inscrit dans cette classe.</td></tr>";

    const content = `
      <div style="margin-bottom:15px">
        <a href="/admin" class="btn secondary" style="padding:6px 12px;font-size:.85rem">⬅️ Retour au Panneau Direction</a>
      </div>

      <section class="card">
        <h2>📝 Prise d'Appel / Fiche de Présence</h2>
        <p style="color:var(--muted);margin-bottom:15px">Sélectionnez la classe et enregistrez les présences du jour.</p>
        
        <form method="get" action="/admin/appel" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:20px;background:#f8fafc;padding:12px;border-radius:10px">
          <div style="flex:1;min-width:180px">
            <label style="margin-top:0">Classe :</label>
            <select name="classe_id" onchange="this.form.submit()">${classOptionsHtml}</select>
          </div>
          <div style="flex:1;min-width:180px">
            <label style="margin-top:0">Date :</label>
            <input type="date" name="date" value="${selectedDate}" onchange="this.form.submit()">
          </div>
        </form>

        <form method="post" action="/admin/appel">
          ${csrfField(req)}
          <input type="hidden" name="classe_id" value="${selectedClasseId}">
          <input type="hidden" name="date" value="${selectedDate}">

          <div class="excel-table-container">
            <table class="excel-table">
              <thead><tr><th>Élève</th><th>Statut de Présence</th></tr></thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>

          ${students.rows.length > 0 ? `<button type="submit" class="btn full" style="margin-top:15px">💾 Enregistrer l'Appel du ${dateFr(selectedDate)}</button>` : ""}
        </form>
      </section>`;

    res.send(layout("Prise d'Appel", content, req));
  } catch (e) { res.status(500).send("Erreur appel."); }
});

app.post("/admin/appel", requireStaff, async (req, res) => {
  const { classe_id, date } = req.body;
  try {
    const students = await pool.query("SELECT id FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1", [Number(classe_id)]);
    for (let s of students.rows) {
      const statut = req.body[`statut_${s.id}`] || "PRESENT";
      await pool.query(`
        INSERT INTO presences (eleve_id, classe_id, date_presence, statut)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (eleve_id, date_presence) DO UPDATE SET statut = EXCLUDED.statut
      `, [s.id, Number(classe_id), date, statut]);
    }
    res.redirect(`/admin/appel?classe_id=${classe_id}&date=${date}`);
  } catch (e) {
    console.error("ERREUR APPEL DETAIL:", e.message);
    res.status(500).send("Erreur enregistrement appel : " + e.message);
  }
});

// PANNEAU DIRECTION
app.get("/admin", requireAdmin, async (req, res) => {
  const content = `
    <div class="card">
      <h2>⚙️ Panneau de Direction — LEKOL S&amp;H</h2>
      <p style="color:var(--muted)">Sélectionnez la sous-page administrative de votre choix :</p>
    </div>

    <div class="tile-grid">
      <a href="/devoirs" class="tile">
        <div class="tile-icon">📖</div>
        <div class="tile-title">Devoirs &amp; Leçons</div>
        <div class="tile-desc">Cahier de textes global</div>
      </a>

      <a href="/admin/classes" class="tile">
        <div class="tile-icon">🏫</div>
        <div class="tile-title">Gestion des Classes</div>
        <div class="tile-desc">Ajouter, voir ou supprimer des classes</div>
      </a>

      <a href="/admin/eleves" class="tile">
        <div class="tile-icon">🎓</div>
        <div class="tile-title">Inscriptions &amp; Élèves</div>
        <div class="tile-desc">Inscrire et filtrer les élèves par classe</div>
      </a>

      <a href="/admin/staff" class="tile">
        <div class="tile-icon">👥</div>
        <div class="tile-title">Gestion du Staff</div>
        <div class="tile-desc">Comptes Direction, Professeurs et Parents</div>
      </a>

      <a href="/admin/annonces" class="tile">
        <div class="tile-icon">📢</div>
        <div class="tile-title">Annonces &amp; Communiqués</div>
        <div class="tile-desc">Publier des annonces officielles</div>
      </a>

      <a href="/admin/notes" class="tile">
        <div class="tile-icon">📊</div>
        <div class="tile-title">Saisie des Notes</div>
        <div class="tile-desc">Enregistrer les notes et devoirs</div>
      </a>

      <a href="/admin/appel" class="tile">
        <div class="tile-icon">📝</div>
        <div class="tile-title">Prise d'Appel</div>
        <div class="tile-desc">Fiche de présence par classe</div>
      </a>
    </div>`;

  res.send(layout("Panneau Direction", content, req));
});

// 1. GESTION DES CLASSES
app.get("/admin/classes", requireAdmin, async (req, res) => {
  try {
    const classesWithCount = await pool.query("SELECT c.id, c.nom, c.niveau, COUNT(u.id) AS total_eleves FROM classes c LEFT JOIN utilisateurs u ON u.classe_id=c.id AND u.role='ELEVE' GROUP BY c.id ORDER BY c.nom ASC").catch(() => ({ rows: [] }));

    const classRows = classesWithCount.rows.map(c => `
      <tr>
        <td><b>${h(c.nom)}</b></td>
        <td><span class="excel-badge">${h(c.niveau)}</span></td>
        <td><strong>${c.total_eleves}</strong> élève(s)</td>
        <td>
          <form method="post" action="/admin/classe/supprimer" style="display:inline">
            ${csrfField(req)}
            <input type="hidden" name="id" value="${c.id}">
            <button class="btn danger" onclick="return confirm('Supprimer cette classe ?')">🗑️ Supprimer</button>
          </form>
        </td>
      </tr>
    `).join("") || "<tr><td colspan='4' style='text-align:center;padding:15px'>Aucune classe créée.</td></tr>";

    const content = `
      <div style="margin-bottom:15px">
        <a href="/admin" class="btn secondary" style="padding:6px 12px;font-size:.85rem">⬅️ Retour au Panneau Direction</a>
      </div>

      <section class="card" style="border:2px solid var(--blue);background:#eff6ff">
        <h2>🏫 Ajouter une Nouvelle Classe</h2>
        <form method="post" action="/admin/classe">${csrfField(req)}
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px">
            <div>
              <label>Nom de la classe</label>
              <input name="nom" required placeholder="Ex. 1ère Année A, NS II...">
            </div>
            <div>
              <label>Niveau scolaire</label>
              <select name="niveau">
                <option value="Maternelle">Maternelle / Kindergarten</option>
                <option value="Fondamental" selected>Fondamental</option>
                <option value="Nouveau Secondaire">Nouveau Secondaire</option>
              </select>
            </div>
          </div>
          <button style="margin-top:12px" class="btn" type="submit">➕ Créer la Classe</button>
        </form>
      </section>

      <section class="card">
        <h2>📋 Classes Officiellement Ouvertes (${classesWithCount.rows.length})</h2>
        <div class="excel-table-container">
          <table class="excel-table">
            <thead><tr><th>Nom de la Classe</th><th>Niveau</th><th>Total Élèves</th><th>Action</th></tr></thead>
            <tbody>${classRows}</tbody>
          </table>
        </div>
      </section>`;

    res.send(layout("Gestion des Classes", content, req));
  } catch (e) { res.status(500).send("Erreur sous-page classes."); }
});

// 2. ÉLÈVES & INSCRIPTIONS
app.get("/admin/eleves", requireAdmin, async (req, res) => {
  try {
    const selectedClasseFilter = req.query.filter_classe_id ? Number(req.query.filter_classe_id) : null;

    let studentQuery = "SELECT u.id, u.nom, u.prenom, u.code_eleve, u.photo_url, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE'";
    const studentParams = [];

    if (selectedClasseFilter) {
      studentQuery += " AND u.classe_id=$1";
      studentParams.push(selectedClasseFilter);
    }
    studentQuery += " ORDER BY c.nom ASC, u.nom ASC, u.prenom ASC";

    const [classes, students] = await Promise.all([
      pool.query("SELECT id, nom FROM classes ORDER BY nom ASC").catch(() => ({ rows: [] })),
      pool.query(studentQuery, studentParams).catch(() => ({ rows: [] }))
    ]);

    const classOpts = classes.rows.map(c => `<option value="${c.id}">${h(c.nom)}</option>`).join("");
    const filterClassOpts = `<option value="">Toutes les classes</option>` + classes.rows.map(c => `
      <option value="${c.id}" ${c.id === selectedClasseFilter ? "selected" : ""}>${h(c.nom)}</option>
    `).join("");

    const studentRows = students.rows.map(s => {
      const photo = s.photo_url || "https://via.placeholder.com/36";
      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:10px">
              <img src="${h(photo)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;image-rendering:-webkit-optimize-contrast;">
              <b>${h(s.nom)} ${h(s.prenom)}</b>
            </div>
          </td>
          <td><b>${h(s.nom_classe || "Non assignée")}</b></td>
          <td><span class="excel-badge" style="font-family:monospace;font-size:.85rem">${h(s.code_eleve)}</span></td>
          <td>
            <form method="post" action="/admin/eleve/supprimer" style="display:inline">
              ${csrfField(req)}
              <input type="hidden" name="id" value="${s.id}">
              <button class="btn danger" onclick="return confirm('Supprimer cet élève ?')">🗑️ Supprimer</button>
            </form>
          </td>
        </tr>`;
    }).join("") || "<tr><td colspan='4' style='text-align:center;padding:15px'>Aucun élève trouvé.</td></tr>";

    const content = `
      <div style="margin-bottom:15px">
        <a href="/admin" class="btn secondary" style="padding:6px 12px;font-size:.85rem">⬅️ Retour au Panneau Direction</a>
      </div>

      <section class="card">
        <h2>➕ Inscrire un Nouvel Élève</h2>
        <form method="post" action="/admin/eleve">${csrfField(req)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label>Nom</label><input name="nom" required placeholder="Nom"></div>
            <div><label>Prénom</label><input name="prenom" required placeholder="Prénom"></div>
          </div>
          <label>Classe</label><select name="classe_id" required><option value="">Choisir la classe</option>${classOpts}</select>
          <label>Mot de passe</label><input type="password" name="password" value="ecole2026" required>
          <button style="margin-top:14px" class="btn full" type="submit">Créer le Compte Élève</button>
        </form>
      </section>

      <section class="card">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:15px;margin-bottom:15px">
          <div><h2 style="margin:0">🎓 Liste des Élèves Inscrits (${students.rows.length})</h2></div>
          <div style="min-width:200px">
            <select style="padding:8px 12px;font-weight:bold" onchange="window.location.href='/admin/eleves?filter_classe_id=' + this.value">
              ${filterClassOpts}
            </select>
          </div>
        </div>

        <div class="excel-table-container">
          <table class="excel-table">
            <thead><tr><th>Élève</th><th>Classe</th><th>Code Élève Unique</th><th>Action</th></tr></thead>
            <tbody>${studentRows}</tbody>
          </table>
        </div>
      </section>`;

    res.send(layout("Gestion des Élèves", content, req));
  } catch (e) { res.status(500).send("Erreur sous-page élèves."); }
});

// 3. GESTION DU STAFF
app.get("/admin/staff", requireAdmin, async (req, res) => {
  try {
    const users = await pool.query("SELECT u.id, u.nom, u.prenom, u.role, u.email FROM utilisateurs u WHERE u.role != 'ELEVE' ORDER BY u.id DESC").catch(() => ({ rows: [] }));

    const staffRows = users.rows.map(u => `
      <tr>
        <td><b>${h(u.nom)} ${h(u.prenom)}</b></td>
        <td><span class="excel-badge">${h(u.role)}</span></td>
        <td>${h(u.email || "Non renseigné")}</td>
      </tr>
    `).join("") || "<tr><td colspan='3' style='text-align:center'>Aucun membre créé.</td></tr>";

    const content = `
      <div style="margin-bottom:15px">
        <a href="/admin" class="btn secondary" style="padding:6px 12px;font-size:.85rem">⬅️ Retour au Panneau Direction</a>
      </div>

      <section class="card" style="border:2px solid var(--blue)">
        <h2>👑 Créer un Compte Staff / Admin / Prof</h2>
        <form method="post" action="/admin/utilisateur">${csrfField(req)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label>Nom</label><input name="nom" required placeholder="Nom"></div>
            <div><label>Prénom</label><input name="prenom" required placeholder="Prénom"></div>
          </div>
          <label>Rôle du Compte</label>
          <select name="role" required>
            <option value="ADMIN">Administrateur (Direction)</option>
            <option value="PROF">Professeur / Enseignant</option>
            <option value="TITULAIRE">Professeur Titulaire</option>
            <option value="PARENT">Parent d'Élève</option>
          </select>
          <label>E-mail ou Identifiant de connexion</label>
          <input name="email" required placeholder="Ex. direction@lekol.com">
          <label>Mot de passe</label>
          <input type="password" name="password" required placeholder="••••••••">
          <button style="margin-top:14px" class="btn full" type="submit">Créer le Compte Staff</button>
        </form>
      </section>

      <section class="card">
        <h2>👥 Équipe Administrative &amp; Enseignants (${users.rows.length})</h2>
        <div class="excel-table-container">
          <table class="excel-table">
            <thead><tr><th>Nom &amp; Prénom</th><th>Rôle</th><th>Identifiant / E-mail</th></tr></thead>
            <tbody>${staffRows}</tbody>
          </table>
        </div>
      </section>`;

    res.send(layout("Gestion du Staff", content, req));
  } catch (e) { res.status(500).send("Erreur sous-page staff."); }
});

// 4. ANNONCES
app.get("/admin/annonces", requireAdmin, async (req, res) => {
  try {
    const annonces = await pool.query("SELECT * FROM annonces ORDER BY id DESC").catch(() => ({ rows: [] }));

    const annoncesHtml = annonces.rows.map(a => `
      <div style="border-left:4px solid var(--blue);padding:12px 16px;background:#f8fafc;border-radius:0 8px 8px 0;margin-bottom:12px">
        <strong style="color:var(--navy);font-size:1rem;display:block">${h(a.titre)}</strong>
        <span style="font-size:.78rem;color:var(--muted)">Publié le ${dateFr(a.date_pub)} par <b>${h(a.auteur)}</b></span>
        <p style="margin-top:6px;font-size:.9rem;color:#334155">${h(a.contenu)}</p>
      </div>
    `).join("") || "<p style='color:var(--muted)'>Aucune annonce publiée.</p>";

    const content = `
      <div style="margin-bottom:15px">
        <a href="/admin" class="btn secondary" style="padding:6px 12px;font-size:.85rem">⬅️ Retour au Panneau Direction</a>
      </div>

      <section class="card">
        <h2>📢 Publier une Annonce Officielle</h2>
        <form method="post" action="/admin/annonce">${csrfField(req)}
          <label>Titre du Communiqué</label>
          <input name="titre" required placeholder="Ex. Réunion des parents d'élèves">
          <label>Contenu du Message</label>
          <textarea name="contenu" rows="4" required placeholder="Détails du message..."></textarea>
          <button style="margin-top:12px" class="btn full" type="submit">Publier l'Annonce</button>
        </form>
      </section>

      <section class="card">
        <h2>📋 Historique des Communiqués</h2>
        ${annoncesHtml}
      </section>`;

    res.send(layout("Gestion des Annonces", content, req));
  } catch (e) { res.status(500).send("Erreur sous-page annonces."); }
});

// 5. SAISIE DES NOTES
app.get("/admin/notes", requireStaff, async (req, res) => {
  try {
    const students = await pool.query("SELECT u.id, u.nom, u.prenom, u.code_eleve, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE' ORDER BY c.nom ASC, u.nom ASC").catch(() => ({ rows: [] }));
    const studentOpts = students.rows.map(s => `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} (${h(s.nom_classe || "Sans classe")})</option>`).join("");

    const content = `
      <div style="margin-bottom:15px">
        <a href="/admin" class="btn secondary" style="padding:6px 12px;font-size:.85rem">⬅️ Retour au Panneau Direction</a>
      </div>

      <section class="card">
        <h2>📊 Saisir Note / Devoir</h2>
        <form method="post" action="/admin/note">${csrfField(req)}
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px">
            <div><label>Élève</label><select name="eleve_id" required><option value="">Choisir un élève</option>${studentOpts}</select></div>
            <div>
              <label>Type d'Évaluation</label>
              <select name="type_eval" required>
                <option value="Devoir Maison">Devoir Maison</option>
                <option value="Exercice en Classe">Exercice en Classe</option>
                <option value="Contrôle">Contrôle</option>
                <option value="Examen">Examen</option>
              </select>
            </div>
            <div><label>Matière</label><input name="matiere" required placeholder="Ex. Mathématiques"></div>
            <div><label>Note obtenue</label><input type="number" step="0.5" name="note" required placeholder="8.5"></div>
            <div><label>Sur combien ?</label><input type="number" name="total_max" value="100" required placeholder="100 ou 10"></div>
            <div><label>Période</label><input name="periode" required placeholder="Ex. 1er Contrôle"></div>
          </div>
          <button style="margin-top:14px" class="btn full" type="submit">Enregistrer la Note</button>
        </form>
      </section>`;

    res.send(layout("Saisie des Notes", content, req));
  } catch (e) { res.status(500).send("Erreur sous-page notes."); }
});

app.post("/admin/classe", requireAdmin, async (req, res) => {
  const { nom, niveau } = req.body;
  try {
    if (nom) {
      await pool.query("INSERT INTO classes (nom, niveau) VALUES ($1, $2)", [String(nom).trim(), String(niveau || "Fondamental")]);
    }
    res.redirect("/admin/classes");
  } catch (e) { res.status(500).send("Erreur ajout classe."); }
});

app.post("/admin/classe/supprimer", requireAdmin, async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query("DELETE FROM classes WHERE id=$1", [Number(id)]);
    res.redirect("/admin/classes");
  } catch (e) { res.status(500).send("Erreur suppression classe."); }
});

app.post("/admin/utilisateur", requireAdmin, async (req, res) => {
  const { nom, prenom, role, email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      "INSERT INTO utilisateurs (nom, prenom, role, email, mot_de_passe) VALUES ($1, $2, $3, $4, $5)",
      [String(nom).trim(), String(prenom).trim(), String(role), String(email).trim(), hash]
    );
    res.redirect("/admin/staff");
  } catch (e) { res.status(500).send("Erreur création utilisateur."); }
});

app.post("/admin/annonce", requireAdmin, async (req, res) => {
  const { titre, contenu } = req.body;
  try {
    await pool.query("INSERT INTO annonces (titre, contenu, auteur) VALUES ($1, $2, $3)", [String(titre).trim(), String(contenu).trim(), "Direction"]);
    res.redirect("/admin/annonces");
  } catch (e) { res.status(500).send("Erreur annonce."); }
});

app.post("/admin/eleve", requireAdmin, async (req, res) => {
  const { nom, prenom, password, classe_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const code = "S&H-" + crypto.randomInt(1000, 10000);
    await pool.query("INSERT INTO utilisateurs (nom, prenom, code_eleve, mot_de_passe, role, classe_id) VALUES ($1,$2,$3,$4,'ELEVE',$5)", [String(nom).trim(), String(prenom).trim(), code, hash, Number(classe_id)]);
    res.redirect("/admin/eleves");
  } catch (e) { res.status(500).send("Erreur élève."); }
});

app.post("/admin/eleve/supprimer", requireAdmin, async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query("DELETE FROM utilisateurs WHERE id=$1 AND role='ELEVE'", [Number(id)]);
    res.redirect("/admin/eleves");
  } catch (e) { res.status(500).send("Erreur suppression élève."); }
});

app.post("/admin/note", requireStaff, async (req, res) => {
  const { eleve_id, matiere, note, total_max, type_eval, periode } = req.body;
  try {
    await pool.query("INSERT INTO notes (eleve_id, matiere, note, total_max, type_eval, periode) VALUES ($1,$2,$3,$4,$5,$6)", [Number(eleve_id), String(matiere).trim(), Number(note), Number(total_max) || 100, String(type_eval), String(periode).trim()]);
    res.redirect(req.session.user.role === "PROF" ? "/prof" : "/admin/notes");
  } catch (e) { res.status(500).send("Erreur note."); }
});

// ROUTE GALERIE SCOLAIRE
app.get("/galerie", async (req, res) => {
  try {
    const photos = await pool.query("SELECT id, titre, photo_base64, TO_CHAR(date_ajout, 'YYYY-MM-DD') as date_fmt FROM galerie ORDER BY id DESC").catch(() => ({ rows: [] }));
    const isAdmin = req.session.user && rolesAdmin.includes(req.session.user.role);

    const photosHtml = photos.rows.map(p => `
      <div class="gallery-card">
        <img src="${h(p.photo_base64)}" class="gallery-img" alt="${h(p.titre)}" onerror="this.src='https://via.placeholder.com/300?text=Image+Indisponible'">
        <div class="gallery-body">
          <strong style="color:var(--navy);display:block">${h(p.titre)}</strong>
          <span style="font-size:.75rem;color:var(--muted)">Publié le ${dateFr(p.date_fmt)}</span>
          ${isAdmin ? `
            <form method="post" action="/admin/galerie/supprimer" style="margin-top:8px">
              ${csrfField(req)}
              <input type="hidden" name="id" value="${p.id}">
              <button class="btn danger" onclick="return confirm('Supprimer cette photo ?')">🗑️ Supprimer</button>
            </form>` : ''}
        </div>
      </div>
    `).join("") || "<p style='color:var(--muted);grid-column:1/-1;text-align:center;padding:20px'>Aucune photo dans la galerie pour le moment.</p>";

    let uploadFormHtml = "";
    if (isAdmin) {
      uploadFormHtml = `
        <section class="card" style="border:2px dashed var(--blue);background:#eff6ff;margin-bottom:20px">
          <h2 style="margin-bottom:10px">📸 Ajouter une Photo à la Galerie</h2>
          <form method="post" action="/admin/galerie">
            ${csrfField(req)}
            <label>Titre de l'événement / photo</label>
            <input name="titre" required placeholder="Ex. Fête du Drapeau 2026">
            
            <label>Sélectionner la photo :</label>
            <input type="file" id="galerieInput" accept="image/*" style="display:none">
            <input type="hidden" name="photo_base64" id="galerieBase64">
            
            <button type="button" class="btn secondary" style="width:100%;margin-top:8px" onclick="document.getElementById('galerieInput').click()">📁 Choisir une image</button>
            <button type="submit" id="saveGalerieBtn" class="btn full" style="margin-top:10px;display:none;background:#22c55e">✅ Publier dans la Galerie</button>
          </form>
        </section>

        <script>
          document.getElementById('galerieInput').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
              const reader = new FileReader();
              reader.onload = function(event) {
                document.getElementById('galerieBase64').value = event.target.result;
                document.getElementById('saveGalerieBtn').style.display = 'block';
              };
              reader.readAsDataURL(file);
            }
          });
        </script>`;
    }

    const content = `
      <div class="card">
        <h2>📸 Galerie Scolaire — LEKOL S&amp;H</h2>
        <p style="color:var(--muted)">Retrouvez en images les événements et activités de l'établissement.</p>
      </div>
      
      ${uploadFormHtml}

      <div class="gallery-grid">
        ${photosHtml}
      </div>`;

    res.send(layout("Galerie Scolaire", content, req));
  } catch (e) { res.status(500).send("Erreur galerie."); }
});

app.post("/admin/galerie", requireAdmin, async (req, res) => {
  const { titre, photo_base64 } = req.body;
  try {
    if (photo_base64) {
      await pool.query("INSERT INTO galerie (titre, photo_base64) VALUES ($1, $2)", [String(titre).trim(), photo_base64]);
    }
    res.redirect("/galerie");
  } catch (e) { res.status(500).send("Erreur publication photo."); }
});

app.post("/admin/galerie/supprimer", requireAdmin, async (req, res) => {
  const { id } = req.body;
  try {
    await pool.query("DELETE FROM galerie WHERE id=$1", [Number(id)]);
    res.redirect("/galerie");
  } catch (e) { res.status(500).send("Erreur suppression photo."); }
});

// DOSSIER ÉLÈVE
app.get("/espace-eleve", requireStudent, async (req, res) => {
  const id = req.session.user.id;
  try {
    const student = (await pool.query("SELECT u.*, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.id=$1", [id])).rows[0];
    const notes = await pool.query("SELECT matiere, note, COALESCE(total_max, 100) as total_max, COALESCE(type_eval, 'Contrôle') as type_eval, periode FROM notes WHERE eleve_id=$1 ORDER BY date_saisie DESC", [id]).catch(() => ({ rows: [] }));
    const presences = await pool.query("SELECT statut FROM presences WHERE eleve_id=$1", [id]).catch(() => ({ rows: [] }));

    const absCount = presences.rows.filter(p => p.statut === "ABSENT").length;
    const retCount = presences.rows.filter(p => p.statut === "RETARD").length;
    const photoUrl = student.photo_url || "https://via.placeholder.com/100";

    const content = `
      <div class="student-badge-card">
        <div class="badge-header">
          <div class="badge-school">🎓 LEKOL S&amp;H</div>
          <span style="font-size:.7rem;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:4px;font-weight:700">CARTE ÉLÈVE</span>
        </div>
        <div class="badge-body">
          <img src="${h(photoUrl)}" class="badge-photo" alt="Photo de profil">
          <div class="badge-info">
            <div class="badge-name">${h(student.prenom)} ${h(student.nom)}</div>
            <div style="font-size:.82rem;opacity:.9;margin-top:2px">Classe : <b>${h(student.nom_classe || "Non assignée")}</b></div>
            <div class="badge-code">${h(student.code_eleve)}</div>
          </div>
        </div>
        <div class="badge-footer">
          <span>Année Académique 2026-2027</span>
          <span style="font-weight:800;color:var(--gold)">VALIDÉ ✓</span>
        </div>
      </div>

      <section class="card" style="text-align:center">
        <form method="post" action="/espace-eleve/photo">
          ${csrfField(req)}
          <label style="margin-top:0;font-size:.9rem">📷 Changer la Photo d'Identité du Badge :</label>
          <input type="file" id="photoInput" accept="image/*" style="display:none">
          <input type="hidden" name="photo_base64" id="photoBase64">
          <div style="display:flex;gap:10px;margin-top:10px;justify-content:center">
            <button type="button" class="btn secondary" onclick="document.getElementById('photoInput').click()">📸 Prendre Photo / Galerie</button>
            <button type="submit" id="savePhotoBtn" class="btn" style="display:none;background:#22c55e">✅ Enregistrer</button>
          </div>
        </form>
      </section>

      <script>
        document.getElementById('photoInput').addEventListener('change', function(e) {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
              document.getElementById('photoBase64').value = event.target.result;
              document.getElementById('savePhotoBtn').style.display = 'inline-flex';
            };
            reader.readAsDataURL(file);
          }
        });
      </script>

      <div class="tile-grid">
        <div class="stat-box"><div class="stat-value" style="color:var(--danger)">${absCount}</div><div class="stat-label">Absences</div></div>
        <div class="stat-box"><div class="stat-value" style="color:var(--gold)">${retCount}</div><div class="stat-label">Retards</div></div>
        <div class="stat-box"><div class="stat-value">${notes.rows.length}</div><div class="stat-label">Devoirs &amp; Notes</div></div>
      </div>

      <section class="card">
        <h2>📊 Notes &amp; Évaluations</h2>
        <div class="excel-table-container">
          <table class="excel-table">
            <thead>
              <tr><th>Matière</th><th>Type</th><th>Note Obtenue</th><th>Période</th></tr>
            </thead>
            <tbody>
              ${notes.rows.map(n => `
                <tr>
                  <td><b>${h(n.matiere)}</b></td>
                  <td><span class="excel-badge">${h(n.type_eval)}</span></td>
                  <td><strong style="color:var(--blue)">${h(n.note)}</strong> / ${h(n.total_max)}</td>
                  <td>${h(n.periode)}</td>
                </tr>
              `).join("") || "<tr><td colspan='4' style='text-align:center;padding:15px'>Aucune note disponible.</td></tr>"}
            </tbody>
          </table>
        </div>
      </section>`;

    res.send(layout("Dossier Élève", content, req));
  } catch (e) { res.status(500).send("Erreur espace élève."); }
});

app.post("/espace-eleve/photo", requireStudent, async (req, res) => {
  const { photo_base64 } = req.body;
  const id = req.session.user.id;
  try {
    if (photo_base64) {
      await pool.query("UPDATE utilisateurs SET photo_url=$1 WHERE id=$2", [photo_base64, id]);
      req.session.user.photo_url = photo_base64;
    }
    res.redirect("/espace-eleve");
  } catch (e) { res.status(500).send("Erreur mise à jour photo."); }
});

// HORAIRE ET EMPLOI DU TEMPS
app.get("/horaire", async (req, res) => {
  try {
    const isAuth = !!req.session.user;
    const userRole = isAuth ? req.session.user.role : null;
    const isAdmin = rolesAdmin.includes(userRole);
    const isEleve = userRole === "ELEVE";

    if (!isAuth) {
      const content = `
        <section class="card" style="text-align:center;padding:40px 20px;">
          <h2>🔒 Espace Sécurisé</h2>
          <p style="color:var(--muted);margin:10px 0 20px">Veuillez vous connecter pour consulter l'emploi du temps des classes.</p>
          <a href="/connexion" class="btn" style="padding:12px 24px;">🔑 Se Connecter</a>
        </section>`;
      return res.send(layout("Connexion Requise", content, req));
    }

    const classes = await pool.query("SELECT id, nom FROM classes ORDER BY id ASC");
    if (classes.rows.length === 0) {
      return res.send(layout("Horaire", "<section class='card'><h2>Aucune classe configurée</h2><p>Veuillez d'abord créer des classes dans l'administration.</p></section>", req));
    }

    let selectedClasseId;
    if (isEleve) {
      selectedClasseId = req.session.user.classe_id;
    } else if (isAdmin && req.query.classe_id) {
      selectedClasseId = Number(req.query.classe_id);
    } else {
      selectedClasseId = req.query.classe_id ? Number(req.query.classe_id) : (req.session.user.classe_id || classes.rows[0].id);
    }

    const [selectedClasse, horaires] = await Promise.all([
      pool.query("SELECT nom FROM classes WHERE id=$1", [selectedClasseId]),
      pool.query("SELECT * FROM horaires WHERE classe_id=$1 ORDER BY id ASC", [selectedClasseId])
    ]);

    const classeNom = selectedClasse.rows[0]?.nom || "Classe";

    let classSelectHtml = "";
    if (isAdmin) {
      const classOptionsHtml = classes.rows.map(c => `
        <option value="${c.id}" ${c.id === selectedClasseId ? "selected" : ""}>${h(c.nom)}</option>
      `).join("");

      classSelectHtml = `
        <div style="min-width:200px">
          <label style="margin-top:0">Changer de classe :</label>
          <select onchange="window.location.href='/horaire?classe_id=' + this.value">
            ${classOptionsHtml}
          </select>
        </div>`;
    }

    const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
    let joursHtml = jours.map(j => {
      const coursJour = horaires.rows.filter(h => h.jour.toLowerCase() === j.toLowerCase());
      return `
        <div style="margin-bottom:20px">
          <div style="background:var(--blue);color:#fff;padding:8px 14px;border-radius:8px 8px 0 0;font-weight:800;display:flex;justify-content:space-between;align-items:center">
            <span>${j}</span>
            <span style="font-size:.8rem;font-weight:600;opacity:.9">${coursJour.length} cours</span>
          </div>
          <div class="excel-table-container">
            <table class="excel-table" style="margin-top:0">
              <thead>
                <tr>
                  <th>Heure</th>
                  <th>Matière</th>
                  <th>Professeur</th>
                  <th>Coeff</th>
                  ${isAdmin ? "<th>Action</th>" : ""}
                </tr>
              </thead>
              <tbody>
                ${coursJour.map(c => `
                  <tr>
                    <td><b>${h(c.heure_debut)} – ${h(c.heure_fin)}</b></td>
                    <td><b>${h(c.matiere)}</b></td>
                    <td>${h(c.professeur)}</td>
                    <td><span class="excel-badge">Coeff. ${h(c.coeff)}</span></td>
                    ${isAdmin ? `
                      <td>
                        <form method="post" action="/admin/horaire/supprimer" style="display:inline">
                          ${csrfField(req)}
                          <input type="hidden" name="id" value="${c.id}">
                          <input type="hidden" name="classe_id" value="${selectedClasseId}">
                          <button type="submit" class="btn danger" onclick="return confirm('Supprimer ce créneau ?')">🗑️ Supprimer</button>
                        </form>
                      </td>` : ""}
                  </tr>
                `).join("") || "<tr><td colspan='" + (isAdmin ? "5" : "4") + "' style='text-align:center;color:var(--muted);padding:15px'>Pas de cours planifié pour le " + j + ".</td></tr>"}
              </tbody>
            </table>
          </div>
        </div>`;
    }).join("");

    let adminFormHtml = "";
    if (isAdmin) {
      adminFormHtml = `
        <section class="card" style="border:2px dashed var(--blue);background:#eff6ff">
          <h3 style="color:var(--navy);margin-bottom:10px">➕ Ajouter un créneau d'horaire pour : <span style="color:var(--blue)">${h(classeNom)}</span></h3>
          <form method="post" action="/admin/horaire/ajouter">${csrfField(req)}
            <input type="hidden" name="classe_id" value="${selectedClasseId}">
            
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));gap:10px">
              <div>
                <label>Jour</label>
                <select name="jour" required>
                  <option value="Lundi">Lundi</option>
                  <option value="Mardi">Mardi</option>
                  <option value="Mercredi">Mercredi</option>
                  <option value="Jeudi">Jeudi</option>
                  <option value="Vendredi">Vendredi</option>
                </select>
              </div>
              <div><label>Heure Début</label><input name="heure_debut" required placeholder="08:00"></div>
              <div><label>Heure Fin</label><input name="heure_fin" required placeholder="09:00"></div>
              <div><label>Matière</label><input name="matiere" required placeholder="Français, Math..."></div>
              <div><label>Professeur</label><input name="professeur" required placeholder="M. Béliard"></div>
              <div><label>Coefficient</label><input type="number" name="coeff" value="1" min="1" required></div>
            </div>

            <button type="submit" class="btn full" style="margin-top:15px">✅ Enregistrer ce créneau</button>
          </form>
        </section>`;
    }

    const content = `
      <section class="card">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:15px;margin-bottom:15px">
          <div>
            <h2>📅 Horaire &amp; Emploi du Temps</h2>
            <p style="color:var(--muted)">Emploi du temps officiel : <b style="color:var(--blue)">${h(classeNom)}</b></p>
          </div>
          ${classSelectHtml}
        </div>

        ${adminFormHtml}

        <div style="margin-top:20px">
          ${joursHtml}
        </div>
      </section>`;

    res.send(layout(`Horaire - ${classeNom}`, content, req));
  } catch (e) { res.status(500).send("Erreur horaire."); }
});

app.post("/admin/horaire/ajouter", requireAdmin, async (req, res) => {
  const { classe_id, jour, heure_debut, heure_fin, matiere, professeur, coeff } = req.body;
  try {
    await pool.query(
      "INSERT INTO horaires (classe_id, jour, heure_debut, heure_fin, matiere, professeur, coeff) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [Number(classe_id), String(jour).trim(), String(heure_debut).trim(), String(heure_fin).trim(), String(matiere).trim(), String(professeur).trim(), Number(coeff) || 1]
    );
    res.redirect(`/horaire?classe_id=${classe_id}`);
  } catch (e) { res.status(500).send("Erreur ajout horaire."); }
});

app.post("/admin/horaire/supprimer", requireAdmin, async (req, res) => {
  const { id, classe_id } = req.body;
  try {
    await pool.query("DELETE FROM horaires WHERE id=$1", [Number(id)]);
    res.redirect(`/horaire?classe_id=${classe_id}`);
  } catch (e) { res.status(500).send("Erreur suppression horaire."); }
});

// CONNEXION
app.get("/connexion", (req, res) => {
  if (req.session.user) return res.redirect(getHomeByRole(req.session.user.role));
  const content = `
    <section class="card" style="max-width:380px;margin:20px auto">
      <h2>🔑 Connexion</h2>
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:15px">Entrez votre code (ex: S&amp;H-XXXX), e-mail ou identifiant.</p>
      <form method="post" action="/connexion">${csrfField(req)}
        <label>Identifiant / Code / E-mail</label>
        <input name="identifiant" required placeholder="Ex. S&amp;H-1234 ou admin">
        <label>Mot de passe</label>
        <input type="password" name="password" required placeholder="••••••••">
        <button class="btn full" style="margin-top:15px">Se connecter</button>
      </form>
    </section>`;
  res.send(layout("Connexion", content, req));
});

app.post("/connexion", loginLimiter, async (req, res) => {
  const { identifiant, password } = req.body;
  try {
    const identClean = String(identifiant || "").trim();
    const queryText = `
      SELECT * FROM utilisateurs 
      WHERE lower(email) = lower($1) 
         OR code_eleve = $1 
         OR lower(nom) = lower($1)
      LIMIT 1
    `;
    const { rows } = await pool.query(queryText, [identClean]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.mot_de_passe).catch(() => user.mot_de_passe === password))) {
      return res.status(401).send(layout("Erreur", "<section class='card'><h2>Identifiants incorrects</h2><p style='color:var(--muted);margin:10px 0'>Vérifiez vos accès.</p><a class='btn' href='/connexion'>Réessayer</a></section>", req));
    }

    req.session.user = { id: user.id, nom: user.nom, prenom: user.prenom, role: user.role, classe_id: user.classe_id, photo_url: user.photo_url };
    res.redirect(getHomeByRole(user.role));
  } catch (e) { res.status(500).send("Erreur connexion."); }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => { res.clearCookie("lekolsid"); res.redirect("/"); });
});

// CALENDRIER AVEC PROGRAMME ANNUEL 2026-2027 & NAVIGATION LIBRE
app.get("/calendrier", async (req, res) => {
  try {
    const isAuth = !!req.session.user;
    const id = isAuth ? req.session.user.id : null;

    let presenceMap = {};
    if (id) {
      const presences = await pool.query("SELECT date_presence::text, statut FROM presences WHERE eleve_id=$1", [id]).catch(() => ({ rows: [] }));
      presences.rows.forEach(p => { presenceMap[p.date_presence.split("T")[0]] = p.statut; });
    }

    const todayHaitiStr = getTodayDate();
    const todayParts = todayHaitiStr.split("-");
    
    let year = req.query.year ? parseInt(req.query.year) : parseInt(todayParts[0]);
    let month = req.query.month !== undefined ? parseInt(req.query.month) : (parseInt(todayParts[1]) - 1);

    const targetDate = new Date(year, month, 1);
    const monthName = targetDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

    const firstDayIndex = targetDate.getDay();
    const startOffset = (firstDayIndex === 0 ? 6 : firstDayIndex - 1); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let calendarCellsHtml = "";
    for (let i = 0; i < startOffset; i++) { 
      calendarCellsHtml += `<div class="calendar-cell empty"></div>`; 
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayFormatted = String(day).padStart(2, '0');
      const monthFormatted = String(month + 1).padStart(2, '0');
      const fullDateStr = `${year}-${monthFormatted}-${dayFormatted}`;
      const statut = presenceMap[fullDateStr];
      let cellClass = "";
      if (statut === "PRESENT") cellClass = "present";
      else if (statut === "ABSENT") cellClass = "absent";
      else if (statut === "RETARD") cellClass = "retard";

      calendarCellsHtml += `<div class="calendar-cell ${cellClass}">${day}</div>`;
    }

    const keyMonth = `${year}-${String(month + 1).padStart(2, '0')}`;
    const activitesMois = planScolaire2026[keyMonth] || [];

    let eventsHtml = activitesMois.map(act => `
      <div style="border-left:4px solid var(--gold);padding:10px 14px;background:#fff8e6;border-radius:0 8px 8px 0;margin-bottom:10px">
        <strong style="color:var(--navy);font-size:.95rem;display:block">📌 ${h(act.titre)}</strong>
        <p style="font-size:.85rem;color:#475569;margin-top:2px">${h(act.desc)}</p>
      </div>
    `).join("") || "<p style='color:var(--muted);font-size:.88rem'>Aucun événement particulier planifié pour ce mois.</p>";

    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;

    const content = `
      <section class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:15px">
          <h2>🗓️ Calendrier &amp; Programme Scolaire — <span style="text-transform:capitalize;color:var(--blue)">${monthName}</span></h2>
          <div style="display:flex;gap:8px">
            <a href="/calendrier?year=${prevYear}&month=${prevMonth}" class="btn secondary" style="padding:6px 12px;font-size:.85rem">◀ Mois Précédent</a>
            <a href="/calendrier?year=${nextYear}&month=${nextMonth}" class="btn secondary" style="padding:6px 12px;font-size:.85rem">Mois Suivant ▶</a>
          </div>
        </div>

        <div class="calendar-grid">
          <div class="calendar-day-head">Lun</div>
          <div class="calendar-day-head">Mar</div>
          <div class="calendar-day-head">Mer</div>
          <div class="calendar-day-head">Jeu</div>
          <div class="calendar-day-head">Ven</div>
          <div class="calendar-day-head">Sam</div>
          <div class="calendar-day-head">Dim</div>
          ${calendarCellsHtml}
        </div>

        <div class="legend-box" style="margin-top:20px;display:flex;gap:15px;flex-wrap:wrap;border-bottom:1px solid var(--border);padding-bottom:15px">
          <div class="legend-item"><span class="legend-dot" style="background:#22c55e;width:12px;height:12px;display:inline-block;border-radius:3px"></span> <b>Vert</b> = Présent</div>
          <div class="legend-item"><span class="legend-dot" style="background:#ef4444;width:12px;height:12px;display:inline-block;border-radius:3px"></span> <b>Rouge</b> = Absent</div>
          <div class="legend-item"><span class="legend-dot" style="background:#64748b;width:12px;height:12px;display:inline-block;border-radius:3px"></span> <b>Gris</b> = Retard</div>
        </div>

        <div style="margin-top:20px">
          <h3 style="color:var(--navy);margin-bottom:12px">📅 Activités &amp; Jalons du Mois (${monthName})</h3>
          ${eventsHtml}
        </div>
      </section>`;

    res.send(layout("Calendrier de Présence", content, req));
  } catch (e) { res.status(500).send("Erreur calendrier."); }
});

app.use((req, res) => res.status(404).send("Page introuvable."));

async function start() {
  try {
    await pool.query("SELECT 1");
    app.listen(port, () => console.log(`🚀 LEKOL S&H prêt sur le port ${port}`));
  } catch (e) {
    console.error("❌ Erreur PG:", e.message);
    process.exit(1);
  }
}

start();
