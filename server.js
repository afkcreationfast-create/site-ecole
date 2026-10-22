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

const getTodayDate = () => new Date().toISOString().split("T")[0];

// INITIALISATION DATABASE DES MATIÈRES PAR CLASSE SI BESOIN
async function initTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matieres_classes (
      id SERIAL PRIMARY KEY,
      classe_id INT REFERENCES classes(id) ON DELETE CASCADE,
      nom_matiere VARCHAR(100) NOT NULL
    );
  `).catch(() => {});

  // On s'assure que la table notes possède la colonne total_max et type_eval
  await pool.query(`
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS total_max INT DEFAULT 100;
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS type_eval VARCHAR(50) DEFAULT 'Contrôle';
  `).catch(() => {});
}
initTables();

// LAYOUT
const layout = (title, content, req) => {
  const isAuth = !!req.session.user;
  const userRole = isAuth ? req.session.user.role : null;

  let navItems = `<a href="/" class="nav-item">🏠 Tableau de Bord</a>
                  <a href="/calendrier" class="nav-item">📅 Calendrier de Présence</a>
                  <a href="/galerie" class="nav-item">📸 Galerie Scolaire</a>`;

  if (isAuth) {
    if (rolesAdmin.includes(userRole)) {
      navItems += `<a href="/admin" class="nav-item active">⚙️ Panneau de Direction</a>`;
    } else if (rolesProf.includes(userRole)) {
      navItems += `<a href="/prof" class="nav-item active">👨‍🏫 Espace Professeur</a>`;
    } else if (userRole === "PARENT") {
      navItems += `<a href="/espace-parent" class="nav-item active">👪 Espace Parent</a>`;
    } else if (userRole === "ELEVE") {
      navItems += `<a href="/espace-eleve" class="nav-item active">👨‍🎓 Mon Espace Élève</a>`;
    }
  } else {
    navItems += `<a href="/connexion" class="nav-item">🔑 Se Connecter</a>`;
  }

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0f172a">
<title>${h(title)} — LEKOL S&amp;H</title>
<style>
:root {
  --sidebar-w: 260px;
  --navy: #0f172a;
  --blue: #2563eb;
  --blue-hover: #1d4ed8;
  --gold: #f59e0b;
  --bg: #f1f5f9;
  --card: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: #cbd5e1;
  --success: #16a34a;
  --danger: #dc2626;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); display: flex; min-height: 100vh; }

.sidebar {
  width: var(--sidebar-w);
  background: var(--navy);
  color: #fff;
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0; bottom: 0; left: 0;
  z-index: 100;
  transition: transform .3s ease;
}
.sidebar-header { padding: 24px 20px; border-bottom: 1px solid #1e293b; }
.sidebar-logo { font-size: 1.4rem; font-weight: 900; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 10px; }
.sidebar-logo span { color: var(--gold); }
.sidebar-nav { padding: 15px 10px; flex: 1; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; color: #cbd5e1; text-decoration: none; font-weight: 600; font-size: .95rem; border-radius: 8px; transition: .15s; }
.nav-item:hover, .nav-item.active { background: #1e293b; color: #fff; }
.nav-item.active { background: var(--blue); }

.main-wrapper { flex: 1; margin-left: var(--sidebar-w); display: flex; flex-direction: column; min-width: 0; }
header.topbar { background: #fff; border-bottom: 1px solid var(--border); padding: 16px 28px; display: flex; align-items: center; justify-content: space-between; }
.toggle-btn { display: none; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--navy); }
.user-badge { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: .9rem; }

main.content { padding: 28px; max-width: 1200px; margin: 0 auto; width: 100%; }

.tile-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-bottom: 24px; }
.tile { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 22px; text-decoration: none; color: var(--text); display: flex; flex-direction: column; gap: 12px; transition: transform .2s, box-shadow .2s; box-shadow: 0 4px 6px -1px #00000010; }
.tile:hover { transform: translateY(-4px); box-shadow: 0 10px 15px -3px #0000001a; border-color: var(--blue); }
.tile-icon { font-size: 2rem; width: 50px; height: 50px; border-radius: 12px; background: #eff6ff; display: flex; align-items: center; justify-content: center; color: var(--blue); }
.tile-title { font-size: 1.1rem; font-weight: 800; color: var(--navy); }
.tile-desc { font-size: .85rem; color: var(--muted); }

.card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 24px; margin-bottom: 24px; box-shadow: 0 2px 4px #00000008; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }

label { display: block; font-weight: 650; font-size: .88rem; margin: 12px 0 4px; color: #334155; }
input, select, textarea { width: 100%; padding: 11px 14px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; font: inherit; color: var(--text); }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px #2563eb22; }
.btn, button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--blue); color: #fff; border: 0; border-radius: 8px; padding: 11px 18px; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; transition: .15s; }
.btn:hover, button:hover { background: var(--blue-hover); }
.btn.secondary { background: #f1f5f9; color: #334155; border: 1px solid var(--border); }
.btn.danger { background: var(--danger); }
.btn.full { width: 100%; }

/* TABLEUR TYPE EXCEL DES NOTES */
.excel-table { width: 100%; border-collapse: collapse; margin-top: 10px; background: #fff; border: 2px solid #cbd5e1; font-size: .9rem; }
.excel-table th { background: #0f172a; color: #fff; text-align: left; padding: 10px 14px; font-weight: 700; border: 1px solid #334155; }
.excel-table td { padding: 10px 14px; border: 1px solid #e2e8f0; }
.excel-table tr:nth-child(even) { background: #f8fafc; }
.excel-badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: .78rem; font-weight: 700; background: #eff6ff; color: #1d4ed8; }

.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-top: 14px; text-align: center; }
.calendar-day-head { font-weight: 700; font-size: .82rem; color: var(--muted); text-transform: uppercase; padding: 6px 0; }
.calendar-cell { padding: 12px 6px; border-radius: 8px; font-weight: 700; font-size: .9rem; background: #f8fafc; border: 1px solid var(--border); }
.calendar-cell.empty { background: transparent; border: none; }
.calendar-cell.present { background: #22c55e; color: #fff; border-color: #16a34a; }
.calendar-cell.absent { background: #ef4444; color: #fff; border-color: #dc2626; }
.calendar-cell.retard { background: #64748b; color: #fff; border-color: #475569; }

.legend-box { display: flex; flex-wrap: wrap; gap: 16px; margin-top: 18px; padding: 12px; background: #f8fafc; border-radius: 8px; font-size: .88rem; font-weight: 600; }
.legend-item { display: flex; align-items: center; gap: 8px; }
.legend-dot { width: 14px; height: 14px; border-radius: 4px; display: inline-block; }

@media(max-width: 900px) {
  .sidebar { transform: translateX(-100%); }
  .sidebar.open { transform: translateX(0); }
  .main-wrapper { margin-left: 0; }
  .toggle-btn { display: block; }
}
</style>
</head>
<body>

<aside class="sidebar" id="sidebar">
  <div class="sidebar-header">
    <a href="/" class="sidebar-logo">🎓 LEKOL <span>S&amp;H</span></a>
  </div>
  <nav class="sidebar-nav">
    ${navItems}
  </nav>
</aside>

<div class="main-wrapper">
  <header class="topbar">
    <button class="toggle-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
    <div style="font-weight:800;color:var(--navy);font-size:1.1rem">LEKOL S&amp;H</div>
    <div class="user-badge">
      ${isAuth ? `<span>${h(req.session.user.prenom)} (${h(req.session.user.role)})</span> <a class="btn secondary" href="/deconnexion" style="padding:6px 12px;font-size:.8rem">Sortir</a>` : `<a class="btn" href="/connexion">Connexion</a>`}
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

function requireParent(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (req.session.user.role !== "PARENT") return res.redirect(getHomeByRole(req.session.user.role));
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

    let tilesHtml = "";

    if (!isAuth) {
      tilesHtml = `
        <a href="/connexion" class="tile">
          <div class="tile-icon">🔑</div>
          <div class="tile-title">Se Connecter</div>
          <div class="tile-desc">Accéder à son espace (Élève, Parent, Professeur, Admin)</div>
        </a>
        <a href="/calendrier" class="tile">
          <div class="tile-icon">📅</div>
          <div class="tile-title">Calendrier de Présence</div>
          <div class="tile-desc">Consulter le calendrier des présences</div>
        </a>
        <a href="/galerie" class="tile">
          <div class="tile-icon">📸</div>
          <div class="tile-title">Galerie Photos</div>
          <div class="tile-desc">Photos des activités de l'école</div>
        </a>`;
    } else if (rolesAdmin.includes(role)) {
      tilesHtml = `
        <a href="/admin/appel" class="tile">
          <div class="tile-icon">📝</div>
          <div class="tile-title">Prise d'Appel</div>
          <div class="tile-desc">Faire l'appel par classe</div>
        </a>
        <a href="/admin/classes" class="tile">
          <div class="tile-icon">🏫</div>
          <div class="tile-title">Gestion des Classes &amp; Matières</div>
          <div class="tile-desc">Configurer matières et voir listes</div>
        </a>
        <a href="/admin" class="tile">
          <div class="tile-icon">⚙️</div>
          <div class="tile-title">Panneau Direction</div>
          <div class="tile-desc">Gestion des comptes et saisie des notes</div>
        </a>`;
    } else if (rolesProf.includes(role)) {
      tilesHtml = `
        <a href="/admin/appel" class="tile">
          <div class="tile-icon">📝</div>
          <div class="tile-title">Faire l'Appel</div>
          <div class="tile-desc">Noter les présences du jour</div>
        </a>
        <a href="/prof" class="tile">
          <div class="tile-icon">📊</div>
          <div class="tile-title">Saisie Devoirs &amp; Notes</div>
          <div class="tile-desc">Enregistrer devoirs, exercices ou examens</div>
        </a>`;
    } else if (role === "ELEVE") {
      tilesHtml = `
        <a href="/espace-eleve" class="tile">
          <div class="tile-icon">👨‍🎓</div>
          <div class="tile-title">Mon Espace Élève</div>
          <div class="tile-desc">Consulter mes notes et devoirs en tableur</div>
        </a>
        <a href="/calendrier" class="tile">
          <div class="tile-icon">📅</div>
          <div class="tile-title">Calendrier de Présence</div>
          <div class="tile-desc">Aperçu quotidien de mes présences</div>
        </a>`;
    } else if (role === "PARENT") {
      tilesHtml = `
        <a href="/espace-parent" class="tile">
          <div class="tile-icon">👪</div>
          <div class="tile-title">Espace Parent</div>
          <div class="tile-desc">Suivi de présence et bulletin</div>
        </a>`;
    }

    const content = `
      <div class="card" style="background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:32px">
        <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:99px;font-size:.85rem;font-weight:700">📅 Date du jour : ${todayStr}</span>
        <h1 style="font-size:2rem;margin:12px 0 6px">Portail Officiel — LEKOL S&amp;H</h1>
        <p style="opacity:.9">Plateforme de gestion scolaire officielle.</p>
      </div>

      <h2 style="margin-bottom:16px;color:var(--navy)">Vos Services Rapides</h2>
      <div class="tile-grid">${tilesHtml}</div>`;

    res.send(layout("Tableau de bord", content, req));
  } catch (e) { res.status(500).send("Erreur accueil."); }
});

// ESPACE ÉLÈVE AVEC TABLEUR STYLE MINI EXCEL
app.get("/espace-eleve", requireStudent, async (req, res) => {
  const id = req.session.user.id;
  try {
    const student = (await pool.query("SELECT u.*, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.id=$1", [id])).rows[0];
    const notes = await pool.query("SELECT matiere, note, COALESCE(total_max, 100) as total_max, COALESCE(type_eval, 'Contrôle') as type_eval, periode FROM notes WHERE eleve_id=$1 ORDER BY date_saisie DESC", [id]).catch(() => ({ rows: [] }));

    const rowsHtml = notes.rows.map(n => `
      <tr>
        <td><b>${h(n.matiere)}</b></td>
        <td><span class="excel-badge">${h(n.type_eval)}</span></td>
        <td><strong style="color:var(--blue);font-size:1.05rem">${h(n.note)}</strong> / ${h(n.total_max)}</td>
        <td>${h(n.periode)}</td>
      </tr>
    `).join("");

    const content = `
      <section class="card">
        <h2>👋 Espace Élève — ${h(student.prenom)} ${h(student.nom)}</h2>
        <p>Code Unique : <b style="color:var(--blue)">${h(student.code_eleve)}</b> · Classe : <b>${h(student.nom_classe || "Non assignée")}</b></p>
      </section>

      <section class="card">
        <h2>📊 Tableur de mes Notes &amp; Devoirs</h2>
        <p style="color:var(--muted);margin-bottom:12px">Relevé détaillé sous forme de tableur :</p>
        
        <div style="overflow-x:auto">
          <table class="excel-table">
            <thead>
              <tr>
                <th>Matière</th>
                <th>Type d'Évaluation / Devoir</th>
                <th>Note Obtenue</th>
                <th>Période / Contrôle</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || "<tr><td colspan='4' style='text-align:center;padding:20px;color:var(--muted)'>Aucune note enregistrée.</td></tr>"}
            </tbody>
          </table>
        </div>
      </section>`;

    res.send(layout("Mon Espace Élève", content, req));
  } catch (e) { res.status(500).send("Erreur espace élève."); }
});

// CALENDRIER
app.get("/calendrier", async (req, res) => {
  try {
    const isAuth = !!req.session.user;
    const id = isAuth ? req.session.user.id : null;

    let presenceMap = {};
    if (id) {
      const presences = await pool.query("SELECT date_presence::text, statut FROM presences WHERE eleve_id=$1", [id]).catch(() => ({ rows: [] }));
      presences.rows.forEach(p => {
        presenceMap[p.date_presence.split("T")[0]] = p.statut;
      });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthName = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

    const firstDayIndex = new Date(year, month, 1).getDay();
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

    const content = `
      <section class="card">
        <h2>🗓️ Calendrier de Présence — <span style="text-transform:capitalize;color:var(--blue)">${monthName}</span></h2>
        <p style="color:var(--muted)">Aperçu quotidien de vos présences pour le mois en cours (Lundi à Dimanche) :</p>
        
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

        <div class="legend-box">
          <div class="legend-item"><span class="legend-dot" style="background:#22c55e"></span> <b>Vert</b> = Présent (À l'heure)</div>
          <div class="legend-item"><span class="legend-dot" style="background:#ef4444"></span> <b>Rouge</b> = Absent</div>
          <div class="legend-item"><span class="legend-dot" style="background:#64748b"></span> <b>Gris</b> = Présent mais en Retard</div>
        </div>
      </section>`;

    res.send(layout("Calendrier de Présence", content, req));
  } catch (e) { res.status(500).send("Erreur calendrier."); }
});

// PANNEAU ADMIN AVEC GESTION MATIÈRES & SAISIE AVANCÉE SUR MESURE
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [classes, students, matieres] = await Promise.all([
      pool.query("SELECT id, nom FROM classes ORDER BY id ASC").catch(() => ({ rows: [] })),
      pool.query("SELECT u.id, u.nom, u.prenom, u.code_eleve, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE' ORDER BY u.id DESC").catch(() => ({ rows: [] })),
      pool.query("SELECT m.*, c.nom as nom_classe FROM matieres_classes m JOIN classes c ON c.id=m.classe_id ORDER BY c.id ASC").catch(() => ({ rows: [] }))
    ]);

    const classOpts = classes.rows.map(c => `<option value="${c.id}">${h(c.nom)}</option>`).join("");
    const studentOpts = students.rows.map(s => `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} (${h(s.code_eleve)})</option>`).join("");

    const content = `
      <div class="card">
        <h2>⚙️ Panneau de Direction — LEKOL S&amp;H</h2>
        <p style="color:var(--muted)">Gestion globale des élèves, des notes, devoirs et matières par classe.</p>
      </div>

      <div class="grid">
        <!-- SAISIE DES NOTES ET DEVOIRS AVEC TOTAL APPTÉ (SUR 5, 10, 100...) -->
        <section class="card">
          <h2>📊 Saisir Devoir / Note</h2>
          <form method="post" action="/admin/note">${csrfField(req)}
            <label>Élève</label>
            <select name="eleve_id" required><option value="">Choisir un élève</option>${studentOpts}</select>
            
            <label>Type d'Évaluation</label>
            <select name="type_eval" required>
              <option value="Devoir Maison">Devoir Maison</option>
              <option value="Exercice en Classe">Exercice en Classe</option>
              <option value="Contrôle">Contrôle</option>
              <option value="Examen">Examen</option>
            </select>

            <label>Matière</label>
            <input name="matiere" required placeholder="Ex. Mathématiques, Écriture, Dessin...">

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div>
                <label>Note obtenue</label>
                <input type="number" step="0.5" name="note" required placeholder="Ex. 8.5">
              </div>
              <div>
                <label>Sur combien ? (Max)</label>
                <input type="number" name="total_max" value="100" required placeholder="Ex. 10, 20, 100">
              </div>
            </div>

            <label>Période / Contrôle</label>
            <input name="periode" required placeholder="Ex. 1er Contrôle, Devoir #2...">
            
            <button style="margin-top:14px" class="btn full" type="submit">Enregistrer la Note / Devoir</button>
          </form>
        </section>

        <!-- AJOUT DE MATIÈRES SPÉCIFIQUES PAR CLASSE -->
        <section class="card">
          <h2>📚 Ajouter une Matière par Classe</h2>
          <p style="color:var(--muted);font-size:.85rem">Les matières du Kinder et de la 6ème Année sont différentes.</p>
          <form method="post" action="/admin/matiere" style="margin-top:10px">${csrfField(req)}
            <label>Classe concernée</label>
            <select name="classe_id" required><option value="">Choisir la classe</option>${classOpts}</select>

            <label>Nom de la Matière</label>
            <input name="nom_matiere" required placeholder="Ex. Graphisme, Écriture, Sciences...">

            <button style="margin-top:14px" class="btn full" type="submit">Ajouter la Matière à la Classe</button>
          </form>
        </section>
      </div>

      <section class="card">
        <h2>➕ Inscrire un Élève</h2>
        <form method="post" action="/admin/eleve">${csrfField(req)}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label>Nom</label><input name="nom" required placeholder="Nom de famille"></div>
            <div><label>Prénom</label><input name="prenom" required placeholder="Prénom"></div>
          </div>
          <label>Classe</label><select name="classe_id" required><option value="">Choisir la classe</option>${classOpts}</select>
          <label>Mot de passe</label><input type="password" name="password" value="ecole2026" required>
          <button style="margin-top:14px" class="btn full" type="submit">Créer le Compte Élève</button>
        </form>
      </section>`;

    res.send(layout("Administration", content, req));
  } catch (e) { res.status(500).send("Erreur administration."); }
});

// ACTION AJOUTER MATIERE
app.post("/admin/matiere", requireAdmin, async (req, res) => {
  const { classe_id, nom_matiere } = req.body;
  try {
    await pool.query("INSERT INTO matieres_classes (classe_id, nom_matiere) VALUES ($1, $2)", [Number(classe_id), String(nom_matiere).trim()]);
    res.redirect("/admin");
  } catch (e) { res.status(500).send("Erreur ajout matière."); }
});

// SAISIE NOTE / DEVOIR
app.post("/admin/note", requireStaff, async (req, res) => {
  const { eleve_id, matiere, note, total_max, type_eval, periode } = req.body;
  try {
    await pool.query(
      "INSERT INTO notes (eleve_id, matiere, note, total_max, type_eval, periode) VALUES ($1, $2, $3, $4, $5, $6)",
      [Number(eleve_id), String(matiere).trim(), Number(note), Number(total_max) || 100, String(type_eval || "Contrôle"), String(periode).trim()]
    );
    res.redirect(req.session.user.role === "PROF" ? "/prof" : "/admin");
  } catch (e) { res.status(500).send("Erreur ajout note."); }
});

// ESPACE PROFESSEUR
app.get("/prof", requireStaff, async (req, res) => {
  try {
    const students = await pool.query("SELECT u.id, u.nom, u.prenom, u.code_eleve, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE' ORDER BY u.id DESC").catch(() => ({ rows: [] }));
    const studentOpts = students.rows.map(s => `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} (${h(s.code_eleve)})</option>`).join("");

    const content = `
      <div class="card">
        <h2>👨‍🏫 Espace Enseignant — LEKOL S&amp;H</h2>
        <p style="color:var(--muted)">Saisie des devoirs, notes et présence pour votre classe.</p>
      </div>

      <section class="card">
        <h2>📊 Saisir Devoir / Note / Exercice</h2>
        <form method="post" action="/admin/note">${csrfField(req)}
          <label>Élève</label><select name="eleve_id" required><option value="">Choisir un élève</option>${studentOpts}</select>
          
          <label>Type d'Évaluation</label>
          <select name="type_eval" required>
            <option value="Devoir Maison">Devoir Maison</option>
            <option value="Exercice en Classe">Exercice en Classe</option>
            <option value="Contrôle">Contrôle</option>
            <option value="Examen">Examen</option>
          </select>

          <label>Matière</label><input name="matiere" required placeholder="Ex. Mathématiques, Lecture...">
          
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div><label>Note tenue</label><input type="number" step="0.5" name="note" required placeholder="Ex. 8"></div>
            <div><label>Sur combien ?</label><input type="number" name="total_max" value="10" required placeholder="Ex. 10 ou 100"></div>
          </div>

          <label>Période / Description</label><input name="periode" required placeholder="Ex. Devoir #1">
          <button style="margin-top:14px" class="btn full" type="submit">Enregistrer</button>
        </form>
      </section>`;

    res.send(layout("Espace Enseignant", content, req));
  } catch (e) { res.status(500).send("Erreur prof."); }
});

// ESPACE PARENT
app.get("/espace-parent", requireParent, async (req, res) => {
  const content = `
    <section class="card">
      <h2>👪 Espace Parent — LEKOL S&amp;H</h2>
      <p style="color:var(--muted)">Bienvenue dans votre espace dédié au suivi de la scolarité de vos enfants.</p>
    </section>`;
  res.send(layout("Espace Parent", content, req));
});

// PRISE D'APPEL ET CLASSES
app.get("/admin/appel", requireStaff, async (req, res) => {
  try {
    const classes = await pool.query("SELECT id, nom, niveau FROM classes ORDER BY id ASC");
    const content = `
      <div class="card">
        <p style="margin-bottom:10px"><a class="btn secondary" href="/">← Retour</a></p>
        <h2>📝 Prise d'Appel Journalier</h2>
        <p style="color:var(--muted)">Sélectionnez une classe :</p>
      </div>
      <div class="tile-grid">
        ${classes.rows.map(c => `<a href="/admin/appel/classe/${c.id}" class="tile"><div class="tile-icon">🏫</div><div class="tile-title">${h(c.nom)}</div></a>`).join("")}
      </div>`;
    res.send(layout("Prise d'Appel", content, req));
  } catch (e) { res.status(500).send("Erreur appel."); }
});

app.get("/admin/appel/classe/:id", requireStaff, async (req, res) => {
  const classeId = Number(req.params.id);
  const dateAppel = getTodayDate();
  try {
    const classe = (await pool.query("SELECT * FROM classes WHERE id=$1", [classeId])).rows[0];
    const students = await pool.query("SELECT id, nom, prenom, code_eleve FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom", [classeId]);

    const studentRows = students.rows.map(s => `
      <tr>
        <td><b>${h(s.nom)} ${h(s.prenom)}</b></td>
        <td><code>${h(s.code_eleve)}</code></td>
        <td>
          <label><input type="radio" name="statut_${s.id}" value="PRESENT" checked>🟢 Présent</label>
          <label><input type="radio" name="statut_${s.id}" value="ABSENT">🔴 Absent</label>
          <label><input type="radio" name="statut_${s.id}" value="RETARD">🩶 Retard</label>
        </td>
      </tr>`).join("");

    const content = `
      <div class="card">
        <h2>📋 Appel : ${h(classe.nom)} (${dateFr(dateAppel)})</h2>
        <form method="post" action="/admin/appel/valider">
          ${csrfField(req)}
          <input type="hidden" name="classe_id" value="${classeId}">
          <input type="hidden" name="date_presence" value="${dateAppel}">
          <table class="excel-table"><thead><tr><th>Nom</th><th>Code</th><th>Statut</th></tr></thead><tbody>${studentRows}</tbody></table>
          <button style="margin-top:15px" class="btn" type="submit">Enregistrer l'Appel</button>
        </form>
      </div>`;
    res.send(layout("Appel", content, req));
  } catch (e) { res.status(500).send("Erreur sous-page appel."); }
});

app.post("/admin/appel/valider", requireStaff, async (req, res) => {
  const { classe_id, date_presence } = req.body;
  try {
    const students = await pool.query("SELECT id FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1", [Number(classe_id)]);
    for (const s of students.rows) {
      const statut = req.body[`statut_${s.id}`] || "PRESENT";
      await pool.query("DELETE FROM presences WHERE eleve_id=$1 AND date_presence=$2", [s.id, date_presence]);
      await pool.query("INSERT INTO presences (eleve_id, statut, date_presence) VALUES ($1, $2, $3)", [s.id, statut, date_presence]);
    }
    res.redirect(`/admin/appel/classe/${classe_id}?succes=1`);
  } catch (e) { res.status(500).send("Erreur validation."); }
});

app.get("/admin/classes", requireStaff, async (req, res) => {
  try {
    const classes = await pool.query("SELECT id, nom, niveau FROM classes ORDER BY id ASC");
    const content = `<div class="card"><h2>🏫 Classes</h2><div class="tile-grid">${classes.rows.map(c => `<a href="/admin/classes/${c.id}" class="tile"><div class="tile-title">${h(c.nom)}</div></a>`).join("")}</div></div>`;
    res.send(layout("Classes", content, req));
  } catch (e) { res.status(500).send("Erreur."); }
});

app.get("/admin/classes/:id", requireStaff, async (req, res) => {
  const classeId = Number(req.params.id);
  try {
    const classe = (await pool.query("SELECT * FROM classes WHERE id=$1", [classeId])).rows[0];
    const students = await pool.query("SELECT id, nom, prenom, code_eleve FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom", [classeId]);
    const matieres = await pool.query("SELECT * FROM matieres_classes WHERE classe_id=$1", [classeId]);

    const content = `
      <div class="card">
        <h2>👥 ${h(classe.nom)}</h2>
        <p>Matières assignées : <b>${matieres.rows.map(m => h(m.nom_matiere)).join(", ") || "Aucune (Matières générales)"}</b></p>
        <table class="excel-table"><thead><tr><th>Élève</th><th>Code</th></tr></thead><tbody>${students.rows.map(s => `<tr><td>${h(s.nom)} ${h(s.prenom)}</td><td><code>${h(s.code_eleve)}</code></td></tr>`).join("")}</tbody></table>
      </div>`;
    res.send(layout("Détails classe", content, req));
  } catch (e) { res.status(500).send("Erreur."); }
});

app.get("/galerie", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, titre, description, COALESCE(image_data, image_url) AS img FROM galerie ORDER BY id DESC");
    const content = `<section class="card">2📸 Galerie Photos<div class="grid">${rows.map(g => `<div><img src="${g.img}" style="width:100%;height:180px;object-fit:cover"><p>${h(g.titre)}</p></div>`).join("")}</div></section>`;
    res.send(layout("Galerie", content, req));
  } catch (e) { res.status(500).send("Erreur."); }
});

app.get("/connexion", (req, res) => {
  if (req.session.user) return res.redirect(getHomeByRole(req.session.user.role));
  const content = `<section class="card" style="max-width:400px;margin:40px auto"><h2>🔑 Connexion</h2><form method="post" action="/connexion">${csrfField(req)}<label>Identifiant / Code</label><input name="identifiant" required><label>Mot de passe</label><input type="password" name="password" required><button class="btn full" style="margin-top:15px">Connexion</button></form></section>`;
  res.send(layout("Connexion", content, req));
});

app.post("/connexion", loginLimiter, async (req, res) => {
  const { identifiant, password } = req.body;
  try {
    const { rows } = await pool.query("SELECT * FROM utilisateurs WHERE lower(email)=lower($1) OR code_eleve=$1 LIMIT 1", [identifiant]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.mot_de_passe).catch(() => user.mot_de_passe === password))) {
      return res.status(401).send(layout("Erreur", "<section class='card'><h2>Identifiants incorrects</h2><a class='btn' href='/connexion'>Réessayer</a></section>", req));
    }
    req.session.user = { id: user.id, nom: user.nom, prenom: user.prenom, role: user.role, classe_id: user.classe_id };
    res.redirect(getHomeByRole(user.role));
  } catch (e) { res.status(500).send("Erreur."); }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => { res.clearCookie("lekolsid"); res.redirect("/"); });
});

app.post("/admin/eleve", requireAdmin, async (req, res) => {
  const { nom, prenom, password, classe_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const code = "S&H-" + crypto.randomInt(1000, 10000);
    await pool.query("INSERT INTO utilisateurs (nom, prenom, code_eleve, mot_de_passe, role, classe_id) VALUES ($1,$2,$3,$4,'ELEVE',$5)", [String(nom).trim(), String(prenom).trim(), code, hash, Number(classe_id)]);
    res.redirect("/admin");
  } catch (e) { res.status(500).send("Erreur élève."); }
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
