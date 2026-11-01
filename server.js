const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === "production";

const rolesAdmin = ["ADMIN", "TITULAIRE"];
const rolesProf = ["PROF"];
const rolesStaff = ["ADMIN", "TITULAIRE", "PROF"];

if (isProduction && (!process.env.DATABASE_URL || !process.env.SESSION_SECRET)) {
  throw new Error("DATABASE_URL et SESSION_SECRET sont obligatoires en production.");
}
if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  console.warn("Configure DATABASE_URL et SESSION_SECRET pour utiliser toutes les fonctions.");
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

// Servir uniquement le logo public
app.get("/logo.jpeg", (req, res) => {
  res.sendFile(path.join(__dirname, "logo.jpeg"), err => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

app.use(session({
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  name: "lekolsid",
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex"),
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

const getTodayDate = () => {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Port-au-Prince" });
};

// LISTES OFFICIELLES EXACTES (25 ÉLÈVES PAR CLASSE)
const eleves2eA = [
  { nom: "CELIMAR", prenom: "Gamaliel Gerardo", code: "S&H-2A01" },
  { nom: "CESAR", prenom: "Esther", code: "S&H-2A02" },
  { nom: "CHERENFANT", prenom: "Andy E.", code: "S&H-2A03" },
  { nom: "CLERPHE", prenom: "Rod-Hansley", code: "S&H-2A04" },
  { nom: "ELIANE", prenom: "Joyce Polo Sandrina", code: "S&H-2A05" },
  { nom: "ETIENNE", prenom: "Djouvensa Mayard", code: "S&H-2A06" },
  { nom: "FELIX", prenom: "Anders Franderly", code: "S&H-2A07" },
  { nom: "FUCIEN", prenom: "Jamescar", code: "S&H-2A08" },
  { nom: "JEAN", prenom: "Ange Thamar Kendaëlle", code: "S&H-2A09" },
  { nom: "JEAN", prenom: "Montimer Valery", code: "S&H-2A10" },
  { nom: "JEAN", prenom: "Ted Ashley Matéo", code: "S&H-2A11" },
  { nom: "JOSEPH", prenom: "Joe Jacky", code: "S&H-2A12" },
  { nom: "LAURORE", prenom: "Ruth Shama", code: "S&H-2A13" },
  { nom: "LOUIS", prenom: "Dabentz", code: "S&H-2A14" },
  { nom: "LOUIS", prenom: "Dardy Ezéchiel", code: "S&H-2A15" },
  { nom: "LOUIS", prenom: "Georges Gabriella", code: "S&H-2A16" },
  { nom: "LUCIEN", prenom: "Frantz Shynayder", code: "S&H-2A17" },
  { nom: "ORELUS", prenom: "Aslin", code: "S&H-2A18" },
  { nom: "PIERRE", prenom: "Jessy Hansa", code: "S&H-2A19" },
  { nom: "PIVERGER", prenom: "Lynn Prisca", code: "S&H-2A20" },
  { nom: "PRÉDESTIN", prenom: "Youmica", code: "S&H-2A21" },
  { nom: "PRÉSUME", prenom: "Marckly Joe Zach", code: "S&H-2A22" },
  { nom: "SAINT-FORT", prenom: "JacqueCevens", code: "S&H-2A23" },
  { nom: "THIMOLÉON", prenom: "Steph", code: "S&H-2A24" },
  { nom: "THIMOTHEE", prenom: "Kerry Ervin", code: "S&H-2A25" }
];

const eleves2eB = [
  { nom: "ANTOINE", prenom: "Marx Dony H.", code: "S&H-2B01" },
  { nom: "ARMAND", prenom: "Leyscha", code: "S&H-2B02" },
  { nom: "BELAMOUR", prenom: "Lentz-Malaika", code: "S&H-2B03" },
  { nom: "BIEN-AIMÉ", prenom: "Marck Jhon Kelly", code: "S&H-2B04" },
  { nom: "BRUTUS", prenom: "Ella Amara", code: "S&H-2B05" },
  { nom: "CALIXTE", prenom: "Ashley-Cole", code: "S&H-2B06" },
  { nom: "CHARLES", prenom: "Ruthdjirsie", code: "S&H-2B07" },
  { nom: "CINA", prenom: "Daphnaëlle", code: "S&H-2B08" },
  { nom: "ELIANÉ", prenom: "Greyce Polosand", code: "S&H-2B09" },
  { nom: "ESTIMABLE", prenom: "Hans Ashley", code: "S&H-2B10" },
  { nom: "EUGÈNE", prenom: "Prince Weddersone", code: "S&H-2B11" },
  { nom: "GEORGES", prenom: "Yaelle Carlidjourie C.", code: "S&H-2B12" },
  { nom: "GERVAIS", prenom: "Vitanae", code: "S&H-2B13" },
  { nom: "JEAN JACQUES", prenom: "Sanderline", code: "S&H-2B14" },
  { nom: "JEAN LOUIS", prenom: "Serge Darly", code: "S&H-2B15" },
  { nom: "JOSEPH", prenom: "Ezéchiel", code: "S&H-2B16" },
  { nom: "LAMOUR", prenom: "Christy Laurendie", code: "S&H-2B17" },
  { nom: "MATHURIN", prenom: "Louinie Marah St J.", code: "S&H-2B18" },
  { nom: "MÉNARD", prenom: "Maelle Esther Lourdes", code: "S&H-2B19" },
  { nom: "MUSCADIN", prenom: "Nathanaëlle", code: "S&H-2B20" },
  { nom: "RENÉ", prenom: "Sephora", code: "S&H-2B21" },
  { nom: "RÉNÉLUS", prenom: "Emmashirah", code: "S&H-2B22" },
  { nom: "SABIN", prenom: "Bendinho Chrismaëll", code: "S&H-2B23" },
  { nom: "SAINT PHAT", prenom: "Judney Valéry", code: "S&H-2B24" },
  { nom: "SAINTEA", prenom: "Wedzer Junior", code: "S&H-2B25" }
];

// MIGRATIONS AUTOMATIQUES & INSERTION PROPRE DES CLASSES 2E A ET 2E B
async function initTables() {
  try {
    await pool.query(`
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS photo_url TEXT;
      ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS email VARCHAR(150);

      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL UNIQUE,
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

      DO $$ 
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'presences_eleve_id_date_presence_key') THEN
          ALTER TABLE presences ADD CONSTRAINT presences_eleve_id_date_presence_key UNIQUE (eleve_id, date_presence);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'utilisateurs_code_eleve_key') THEN
          ALTER TABLE utilisateurs ADD CONSTRAINT utilisateurs_code_eleve_key UNIQUE (code_eleve);
        END IF;
      END $$;

      ALTER TABLE notes ADD COLUMN IF NOT EXISTS total_max INT DEFAULT 100;
      ALTER TABLE notes ADD COLUMN IF NOT EXISTS type_eval VARCHAR(50) DEFAULT 'Contrôle';

      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        receiver_id INT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
        sujet VARCHAR(180) NOT NULL,
        contenu TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        lu_at TIMESTAMPTZ
      );
    `);

    // S'assurer que les classes existent
    await pool.query(`
      INSERT INTO classes (nom, niveau) 
      VALUES ('2ème Année A', 'Fondamental'), ('2ème Année B', 'Fondamental')
      ON CONFLICT (nom) DO NOTHING
    `);

    const defaultHash = await bcrypt.hash("ecole2026", 12);

    // NETTOYAGE ET INSERTION PROPRE DE LA CLASSE 2ÈME ANNÉE A (25 ÉLÈVES)
    const resClass2A = await pool.query("SELECT id FROM classes WHERE nom = '2ème Année A' LIMIT 1");
    if (resClass2A.rows.length > 0) {
      const id2A = resClass2A.rows[0].id;
      await pool.query("DELETE FROM utilisateurs WHERE classe_id = $1 AND role = 'ELEVE'", [id2A]);
      
      for (const e of eleves2eA) {
        await pool.query(`
          INSERT INTO utilisateurs (nom, prenom, code_eleve, mot_de_passe, role, classe_id)
          VALUES ($1, $2, $3, $4, 'ELEVE', $5)
          ON CONFLICT (code_eleve) DO UPDATE SET nom = EXCLUDED.nom, prenom = EXCLUDED.prenom, classe_id = EXCLUDED.classe_id
        `, [e.nom, e.prenom, e.code, defaultHash, id2A]);
      }
      console.log("✅ Classe 2ème Année A synchronisée (exactement 25 élèves).");
    }

    // NETTOYAGE ET INSERTION PROPRE DE LA CLASSE 2ÈME ANNÉE B (25 ÉLÈVES)
    const resClass2B = await pool.query("SELECT id FROM classes WHERE nom = '2ème Année B' LIMIT 1");
    if (resClass2B.rows.length > 0) {
      const id2B = resClass2B.rows[0].id;
      await pool.query("DELETE FROM utilisateurs WHERE classe_id = $1 AND role = 'ELEVE'", [id2B]);

      for (const e of eleves2eB) {
        await pool.query(`
          INSERT INTO utilisateurs (nom, prenom, code_eleve, mot_de_passe, role, classe_id)
          VALUES ($1, $2, $3, $4, 'ELEVE', $5)
          ON CONFLICT (code_eleve) DO UPDATE SET nom = EXCLUDED.nom, prenom = EXCLUDED.prenom, classe_id = EXCLUDED.classe_id
        `, [e.nom, e.prenom, e.code, defaultHash, id2B]);
      }
      console.log("✅ Classe 2ème Année B synchronisée (exactement 25 élèves).");
    }

  } catch(err) {
    console.log("Info DB init:", err.message);
  }
}

// LAYOUT RESPONSIVE & STYLE GLOBAL
const layout = (title, content, req) => {
  const isAuth = !!req.session.user;
  const user = isAuth ? req.session.user : null;
  const userRole = user ? user.role : null;
  const photo = user && user.photo_url ? user.photo_url : "https://via.placeholder.com/40";

  const schoolLogoHtml = `<a href="/" style="display:flex;align-items:center;gap:10px;text-decoration:none;">
    <img src="/logo.jpeg" alt="LEKOL S&H" style="width:42px;height:42px;object-fit:contain;border-radius:12px;background:#ffffff;padding:2px;image-rendering:-webkit-optimize-contrast;">
    <span style="font-size:1.2rem;font-weight:900;color:#fff;letter-spacing:0.5px">LEKOL <span style="color:var(--lk-gold)">S&amp;H</span></span>
  </a>`;

  let navItems = `<a href="/" class="nav-item">🏠 Tableau de Bord</a>
                  <a href="/devoirs" class="nav-item">📖 Devoirs &amp; Leçons</a>
                  <a href="/horaire" class="nav-item">📅 Horaire des Cours</a>
                  <a href="/calendrier" class="nav-item">🗓️ Calendrier &amp; Présence</a>
                  <a href="/galerie" class="nav-item">📸 Galerie Scolaire</a>`;

  if (isAuth) {
    navItems += `<a href="/messages" class="nav-item">✉️ Messagerie</a>`;
    if (rolesAdmin.includes(userRole)) {
      navItems += `<a href="/admin/appel" class="nav-item">📝 Prise d'Appel</a>
                   <a href="/admin" class="nav-item">⚙️ Panneau Direction</a>`;
    } else if (rolesProf.includes(userRole)) {
      navItems += `<a href="/admin/appel" class="nav-item">📝 Prise d'Appel</a>
                   <a href="/prof" class="nav-item">👨‍🏫 Espace Professeur</a>`;
    } else if (userRole === "PARENT") {
      navItems += `<a href="/espace-parent" class="nav-item">👪 Espace Parent</a>`;
    } else if (userRole === "ELEVE") {
      navItems += `<a href="/espace-eleve" class="nav-item">👨‍🎓 Mon Dossier &amp; Badge</a>
                   <a href="/bulletin" class="nav-item">📊 Mon Bulletin</a>`;
    }
  } else {
    navItems += `<a href="/connexion" class="nav-item">🔑 Se Connecter</a>`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="theme-color" content="#0b1630">
<title>${h(title)} — LEKOL S&amp;H</title>
<style>
:root {
  --lk-navy: #0b1630;
  --lk-navy-2: #142749;
  --lk-blue: #285bea;
  --lk-blue-light: #eaf0ff;
  --lk-gold: #e5b75b;
  --lk-white: #ffffff;
  --lk-bg: #f3f6fc;
  --lk-text: #182641;
  --lk-muted: #708099;
  --lk-line: #e5eaf3;
  --lk-radius: 20px;
  --lk-shadow: 0 12px 35px rgba(17, 36, 72, .065);
  --sidebar-w: 260px;
}
* { box-sizing: border-box; }
img { max-width: 100%; height: auto; }
html { scroll-behavior: smooth; }
body {
  background-color: var(--lk-bg);
  background-image: radial-gradient(ellipse at 85% 0%, rgba(40,91,234,.075), transparent 36%);
  color: var(--lk-text);
  font-family: "Inter", "Segoe UI", Arial, sans-serif;
  letter-spacing: -.12px;
  display: flex;
  min-height: 100vh;
  margin: 0;
  overflow-wrap: anywhere;
  -webkit-text-size-adjust: 100%;
}
.sidebar {
  width: var(--sidebar-w);
  background: radial-gradient(ellipse at 0% 0%, rgba(53,103,221,.24), transparent 45%), linear-gradient(165deg, #0b1630, #122647 65%, #101c37);
  border-right: 1px solid rgba(255,255,255,.07);
  box-shadow: 8px 0 35px rgba(11,22,48,.08);
  color: #fff;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0; bottom: 0; left: 0;
  z-index: 1000;
  transition: transform .3s ease;
}
.sidebar-header {
  padding: 23px 20px;
  border-bottom: 1px solid rgba(255,255,255,.09);
  display: flex; justify-content: space-between; align-items: center;
}
.close-sidebar-btn { display: none; background: none; border: none; color: #fff; font-size: 1.5rem; cursor: pointer; }
.user-sidebar-card {
  margin: 14px;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 16px;
  background: rgba(255,255,255,.045);
  padding: 12px 15px;
  display: flex; align-items: center; gap: 12px;
}
.user-avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid var(--lk-blue); }
.sidebar-nav { padding: 10px 0; flex: 1; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
.nav-item {
  margin: 4px 10px;
  width: calc(100% - 20px);
  border-radius: 12px;
  padding: 13px 15px;
  color: #d5deef;
  font-weight: 600;
  font-size: .92rem;
  text-decoration: none;
  display: flex; align-items: center; gap: 12px;
  transition: background .2s ease, color .2s ease;
}
.nav-item:hover { background: rgba(255,255,255,.09); color: #fff; }
.nav-item.active {
  background: linear-gradient(115deg, #356cf2, #2853ce);
  color: #fff;
  box-shadow: 0 6px 20px rgba(40,91,234,.26);
}
.main-wrapper { flex: 1; margin-left: var(--sidebar-w); display: flex; flex-direction: column; min-width: 0; width: 100%; }
header.topbar {
  min-height: 68px;
  border-bottom: 1px solid rgba(225,232,243,.9);
  box-shadow: 0 5px 22px rgba(17,36,72,.035);
  background: rgba(255,255,255,.94);
  backdrop-filter: blur(18px);
  padding: 12px 24px;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  position: sticky; top: 0; z-index: 900;
}
.toggle-btn { display: none; background: none; border: none; font-size: 1.6rem; cursor: pointer; color: var(--lk-navy); }
.user-badge { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: .9rem; }
main.content { max-width: 1500px; padding: 32px; margin: 0 auto; width: 100%; min-width: 0; }
.card {
  position: relative;
  background: var(--lk-white);
  border: 1px solid rgba(224,231,242,.92);
  border-radius: var(--lk-radius);
  padding: 26px;
  box-shadow: var(--lk-shadow);
  margin-bottom: 25px;
  word-wrap: break-word; overflow: hidden;
}
.tile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin: 18px 0 30px; }
.tile {
  border: 1px solid #e5eaf4;
  border-radius: 20px;
  padding: 25px;
  background: linear-gradient(145deg, #fff 40%, #f7f9ff);
  box-shadow: 0 8px 24px rgba(17,36,72,.045);
  text-decoration: none; color: var(--lk-text);
  display: flex; flex-direction: column; gap: 10px;
  transition: transform .22s ease, box-shadow .22s ease;
}
.tile:hover { transform: translateY(-4px); border-color: #bdceff; box-shadow: 0 18px 38px rgba(40,91,234,.11); }
.tile-icon {
  width: 54px; height: 54px;
  border-radius: 17px;
  background: linear-gradient(145deg, #edf2ff, #dce7ff);
  color: var(--lk-blue);
  font-size: 1.9rem;
  display: flex; align-items: center; justify-content: center;
}
.btn, button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  background: var(--lk-blue); color: #fff; border: 0;
  border-radius: 12px; padding: 12px 19px;
  font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; text-align: center;
  min-height: 44px; box-shadow: 0 5px 14px rgba(40,91,234,.13);
}
.btn.secondary { background: #f1f5f9; color: #35435c; border: 1px solid var(--lk-line); box-shadow: none; }
.btn.danger { background: #dc2626; padding: 5px 10px; font-size: .8rem; box-shadow: none; }
.btn.full { width: 100%; }
label { display: block; font-weight: 650; font-size: .88rem; margin: 12px 0 4px; color: #334155; }
input, select, textarea {
  width: 100%; min-height: 44px; background-color: #fff; color: var(--lk-text);
  border: 1px solid #dce3ef; border-radius: 12px; padding: 12px 15px; font: inherit;
}
.excel-table-container {
  overflow-x: auto; border: 1px solid var(--lk-line); border-radius: 16px; background: #fff; margin-top: 10px;
}
.excel-table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: .88rem; min-width: 500px; }
.excel-table th { background: #142749; color: #fff; font-size: .82rem; font-weight: 700; padding: 16px; border: 1px solid #23385e; }
.excel-table td { padding: 14px 16px; border-bottom: 1px solid #edf0f6; border-right: 1px solid #f1f5f9; color: #35435c; }
.excel-badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: .78rem; font-weight: 700; background: #eff6ff; color: #1d4ed8; }
.devoir-card, .gallery-card {
  background: #fff; border-radius: 18px; border: 1px solid var(--lk-line);
  box-shadow: 0 7px 22px rgba(17,36,72,.05); padding: 20px; margin-bottom: 14px;
}
.devoir-date-badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: .78rem; font-weight: 800; background: #fef3c7; color: #92400e; margin-bottom: 8px; }
@media (max-width: 768px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .main-wrapper { margin-left: 0; }
  .toggle-btn, .close-sidebar-btn { display: block; }
  main.content { padding: 14px 11px; }
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
      <span style="font-size:.75rem;color:var(--lk-gold);font-weight:700">${h(user.role)}</span>
    </div>
  </div>` : ''}
  <nav class="sidebar-nav">
    ${navItems}
  </nav>
</aside>

<div class="main-wrapper">
  <header class="topbar">
    <button class="toggle-btn" onclick="document.getElementById('sidebar').classList.add('open')">☰</button>
    <div style="font-weight:800;color:var(--lk-navy);font-size:1.05rem">LEKOL S&amp;H — Portail Officiel</div>
    <div class="user-badge">
      ${isAuth ? `<a class="btn secondary" href="/deconnexion" style="padding:6px 12px;font-size:.8rem">Sortir</a>` : `<a class="btn" href="/connexion" style="padding:6px 12px;font-size:.8rem">Connexion</a>`}
    </div>
  </header>
  <main class="content">${content}</main>
</div>

</body>
</html>`;
};

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
      <div style="border-left:4px solid var(--lk-blue);padding:12px 16px;background:#f8fafc;border-radius:0 8px 8px 0;margin-bottom:12px">
        <strong style="color:var(--lk-navy);font-size:1rem;display:block">${h(a.titre)}</strong>
        <span style="font-size:.78rem;color:var(--lk-muted)">Publié le ${dateFr(a.date_pub)} par <b>${h(a.auteur)}</b></span>
        <p style="margin-top:6px;font-size:.9rem;color:#334155">${h(a.contenu)}</p>
      </div>
    `).join("") || "<p style='color:var(--lk-muted)'>Aucun communiqué officiel pour le moment.</p>";

    const content = `
      <div class="card" style="background:linear-gradient(135deg,#0b1630,#1e3a8a);color:#fff;padding:24px">
        <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:999px;font-size:.8rem;font-weight:700">📅 ${todayStr}</span>
        <h1 style="font-size:1.8rem;margin:10px 0 4px;color:#fff">Portail Officiel — LEKOL S&amp;H</h1>
        <p style="opacity:.9;font-size:.9rem">Plateforme de gestion scolaire officielle.</p>
      </div>
      <section class="card">
        <h2 style="margin-bottom:12px;color:var(--lk-navy)">📢 Panneau d'Annonces &amp; Communiqués</h2>
        ${annoncesHtml}
      </section>
      <h2 style="margin-bottom:14px;color:var(--lk-navy)">Accès Rapides</h2>
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
      return res.send(layout("Connexion Requise", `<section class="card" style="text-align:center;padding:40px 20px;"><h2>🔒 Espace Sécurisé</h2><p style="color:var(--lk-muted);margin:10px 0 20px">Vous devez vous connecter pour consulter les devoirs.</p><a href="/connexion" class="btn">🔑 Se Connecter</a></section>`, req));
    }

    let selectedClasseId = isEleve ? req.session.user.classe_id : (req.query.classe_id ? Number(req.query.classe_id) : (req.session.user.classe_id || classes.rows[0].id));

    const [selectedClasse, devoirsRes] = await Promise.all([
      pool.query("SELECT nom FROM classes WHERE id=$1", [selectedClasseId]),
      pool.query("SELECT d.*, TO_CHAR(d.date_pour, 'YYYY-MM-DD') as date_pour_fmt, TO_CHAR(COALESCE(d.date_pub, CURRENT_DATE), 'YYYY-MM-DD') as date_pub_fmt FROM devoirs d WHERE d.classe_id=$1 ORDER BY d.date_pour ASC", [selectedClasseId])
    ]);

    const classeNom = selectedClasse.rows[0]?.nom || "Ma Classe";
    let selectorHtml = isStaff ? `<div style="min-width:200px"><label style="margin-top:0">Sélectionner une classe :</label><select onchange="window.location.href='/devoirs?classe_id=' + this.value">${classes.rows.map(c => `<option value="${c.id}" ${c.id === selectedClasseId ? "selected" : ""}>${h(c.nom)}</option>`).join("")}</select></div>` : "";

    const today = getTodayDate();
    const devoirsHtml = devoirsRes.rows.map(d => {
      const isUrgent = d.date_pour_fmt <= today;
      const dateLabel = d.date_pour_fmt === today ? "📌 POUR AUJOURD'HUI" : (d.date_pour_fmt < today ? "⚠️ DÉPASSÉ" : `📅 Pour le ${dateFr(d.date_pour_fmt)}`);
      return `
        <div class="devoir-card" style="border-left-color:${isUrgent ? '#dc2626' : '#285bea'}">
          <span class="devoir-date-badge ${isUrgent ? 'urgent' : ''}">${dateLabel}</span>
          <span class="excel-badge" style="margin-left:6px">${h(d.matiere)}</span>
          <h3 style="color:var(--lk-navy);margin:8px 0 4px">${h(d.titre)}</h3>
          <p style="color:#334155;font-size:.92rem;white-space:pre-wrap">${h(d.description)}</p>
        </div>`;
    }).join("") || "<p style='color:var(--lk-muted);padding:20px;text-align:center'>Aucun devoir enregistré.</p>";

    const content = `
      <div class="card">
        <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:15px">
          <div><h2>📖 Devoirs &amp; Leçons</h2><p style="color:var(--lk-muted)">Classe : <b style="color:var(--lk-blue)">${h(classeNom)}</b></p></div>
          ${selectorHtml}
        </div>
      </div>
      <section class="card"><h2 style="margin-bottom:15px">📋 Liste des Travaux</h2>${devoirsHtml}</section>`;

    res.send(layout(`Devoirs - ${classeNom}`, content, req));
  } catch (e) { res.status(500).send("Erreur devoirs."); }
});

// ROUTE PRISE D'APPEL
app.get("/admin/appel", requireStaff, async (req, res) => {
  try {
    const classes = await pool.query("SELECT id, nom FROM classes ORDER BY id ASC");
    if (classes.rows.length === 0) return res.send(layout("Prise d'Appel", "<section class='card'><h2>Aucune classe</h2></section>", req));

    const selectedClasseId = req.query.classe_id ? Number(req.query.classe_id) : classes.rows[0].id;
    const selectedDate = req.query.date || getTodayDate();

    const [students, presences] = await Promise.all([
      pool.query("SELECT id, nom, prenom, code_eleve, photo_url FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom ASC, prenom ASC", [selectedClasseId]),
      pool.query("SELECT eleve_id, statut FROM presences WHERE classe_id=$1 AND date_presence=$2", [selectedClasseId, selectedDate])
    ]);

    const presenceMap = {};
    presences.rows.forEach(p => { presenceMap[p.eleve_id] = p.statut; });

    const rowsHtml = students.rows.map(s => {
      const currentStatut = presenceMap[s.id] || "PRESENT";
      return `
        <tr>
          <td><b>${h(s.nom)} ${h(s.prenom)}</b> <span style="font-size:.78rem;color:var(--lk-muted)">(${h(s.code_eleve)})</span></td>
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
      <div style="margin-bottom:15px"><a href="/admin" class="btn secondary">⬅️ Retour Panneau Direction</a></div>
      <section class="card">
        <h2>📝 Prise d'Appel / Fiche de Présence</h2>
        <form method="get" action="/admin/appel" style="display:flex;gap:12px;margin-bottom:20px">
          <select name="classe_id" onchange="this.form.submit()">${classes.rows.map(c => `<option value="${c.id}" ${c.id === selectedClasseId ? "selected" : ""}>${h(c.nom)}</option>`).join("")}</select>
          <input type="date" name="date" value="${selectedDate}" onchange="this.form.submit()">
        </form>
        <form method="post" action="/admin/appel">
          ${csrfField(req)}
          <input type="hidden" name="classe_id" value="${selectedClasseId}">
          <input type="hidden" name="date" value="${selectedDate}">
          <div class="excel-table-container"><table class="excel-table"><thead><tr><th>Élève</th><th>Statut</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
          ${students.rows.length > 0 ? `<button type="submit" class="btn full" style="margin-top:15px">💾 Enregistrer l'Appel</button>` : ""}
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
  } catch (e) { res.status(500).send("Erreur enregistrement appel."); }
});

// PANNEAU DIRECTION
app.get("/admin", requireAdmin, (req, res) => {
  const content = `
    <div class="card"><h2>⚙️ Panneau de Direction — LEKOL S&amp;H</h2></div>
    <div class="tile-grid">
      <a href="/admin/classes" class="tile"><div class="tile-icon">🏫</div><div class="tile-title">Classes</div><div class="tile-desc">Gérer les classes</div></a>
      <a href="/admin/eleves" class="tile"><div class="tile-icon">🎓</div><div class="tile-title">Élèves</div><div class="tile-desc">Inscriptions et liste des élèves</div></a>
      <a href="/admin/appel" class="tile"><div class="tile-icon">📝</div><div class="tile-title">Prise d'Appel</div><div class="tile-desc">Présences du jour</div></a>
      <a href="/galerie" class="tile"><div class="tile-icon">📸</div><div class="tile-title">Galerie</div><div class="tile-desc">Photos scolaires</div></a>
    </div>`;
  res.send(layout("Panneau Direction", content, req));
});

// GESTION DES CLASSES
app.get("/admin/classes", requireAdmin, async (req, res) => {
  try {
    const classes = await pool.query("SELECT c.id, c.nom, c.niveau, COUNT(u.id) AS total_eleves FROM classes c LEFT JOIN utilisateurs u ON u.classe_id=c.id AND u.role='ELEVE' GROUP BY c.id ORDER BY c.nom ASC");
    const classRows = classes.rows.map(c => `<tr><td><b>${h(c.nom)}</b></td><td><span class="excel-badge">${h(c.niveau)}</span></td><td><strong>${c.total_eleves}</strong> élève(s)</td></tr>`).join("");
    res.send(layout("Classes", `<div class="card"><a href="/admin" class="btn secondary">⬅️ Retour</a><h2>🏫 Classes</h2><div class="excel-table-container"><table class="excel-table"><thead><tr><th>Nom</th><th>Niveau</th><th>Total Élèves</th></tr></thead><tbody>${classRows}</tbody></table></div></div>`, req));
  } catch (e) { res.status(500).send("Erreur classes."); }
});

// GESTION DES ÉLÈVES
app.get("/admin/eleves", requireAdmin, async (req, res) => {
  try {
    const students = await pool.query("SELECT u.id, u.nom, u.prenom, u.code_eleve, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE' ORDER BY c.nom ASC, u.nom ASC");
    const studentRows = students.rows.map(s => `<tr><td><b>${h(s.nom)} ${h(s.prenom)}</b></td><td><b>${h(s.nom_classe || "Non assignée")}</b></td><td><span class="excel-badge">${h(s.code_eleve)}</span></td></tr>`).join("");
    res.send(layout("Élèves", `<div class="card"><a href="/admin" class="btn secondary">⬅️ Retour</a><h2>🎓 Élèves Inscrits (${students.rows.length})</h2><div class="excel-table-container"><table class="excel-table"><thead><tr><th>Élève</th><th>Classe</th><th>Code Unique</th></tr></thead><tbody>${studentRows}</tbody></table></div></div>`, req));
  } catch (e) { res.status(500).send("Erreur élèves."); }
});

// CONNEXION & DÉCONNEXION
app.get("/connexion", (req, res) => {
  if (req.session.user) return res.redirect(getHomeByRole(req.session.user.role));
  res.send(layout("Connexion", `<section class="card" style="max-width:380px;margin:20px auto"><h2>🔑 Connexion</h2><form method="post" action="/connexion">${csrfField(req)}<label>Identifiant / Code</label><input name="identifiant" required><label>Mot de passe</label><input type="password" name="password" required><button class="btn full" style="margin-top:15px">Se connecter</button></form></section>`, req));
});

app.post("/connexion", loginLimiter, async (req, res) => {
  const { identifiant, password } = req.body;
  try {
    const user = (await pool.query("SELECT * FROM utilisateurs WHERE lower(email) = lower($1) OR code_eleve = $1 OR lower(nom) = lower($1) LIMIT 1", [String(identifiant || "").trim()])).rows[0];
    if (!user || !(await bcrypt.compare(password, user.mot_de_passe).catch(() => user.mot_de_passe === password))) {
      return res.status(401).send(layout("Erreur", "<section class='card'><h2>Identifiants incorrects</h2><a class='btn' href='/connexion'>Réessayer</a></section>", req));
    }
    req.session.user = { id: user.id, nom: user.nom, prenom: user.prenom, role: user.role, classe_id: user.classe_id, photo_url: user.photo_url };
    res.redirect(getHomeByRole(user.role));
  } catch (e) { res.status(500).send("Erreur connexion."); }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => { res.clearCookie("lekolsid"); res.redirect("/"); });
});

// GALERIE SCOLAIRE
app.get("/galerie", async (req, res) => {
  try {
    const photos = await pool.query("SELECT id, titre, photo_base64 FROM galerie ORDER BY id DESC").catch(() => ({ rows: [] }));
    const photosHtml = photos.rows.map(p => `<div class="gallery-card"><img src="${h(p.photo_base64)}" style="width:100%;height:180px;object-fit:contain"><div style="padding:14px"><strong>${h(p.titre)}</strong></div></div>`).join("") || "<p>Aucune photo.</p>";
    res.send(layout("Galerie", `<div class="card"><h2>📸 Galerie Scolaire</h2></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px">${photosHtml}</div>`, req));
  } catch (e) { res.status(500).send("Erreur galerie."); }
});

// CALENDRIER
app.get("/calendrier", (req, res) => {
  res.send(layout("Calendrier", `<section class="card"><h2>🗓️ Calendrier &amp; Programme Scolaire</h2><p>Consultez les dates clés et événements de LEKOL S&amp;H.</p></section>`, req));
});

app.use((req, res) => res.status(404).send("Page introuvable."));

async function start() {
  try {
    await initTables();
    await pool.query("SELECT 1");
    app.listen(port, () => console.log(`🚀 LEKOL S&H prêt sur le port ${port}`));
  } catch (e) {
    console.error("❌ Erreur PG:", e.message);
    process.exit(1);
  }
}

start();
