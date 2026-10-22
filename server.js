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

.tablewrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 8px; margin-top: 12px; }
table { border-collapse: collapse; width: 100%; background: #fff; font-size: .92rem; }
th, td { text-align: left; border-bottom: 1px solid var(--border); padding: 13px; }
th { background: #f8fafc; color: #475569; font-weight: 700; }

/* MINI CALENDRIER DE PRÉSENCE */
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

// PROTECTIONS DES ACCÈS (REDIRECTION AUTOMATIQUE SANS ACCÈS REFUSÉ)
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!rolesAdmin.includes(req.session.user.role)) {
    return res.redirect(getHomeByRole(req.session.user.role));
  }
  next();
}

function requireStaff(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!rolesStaff.includes(req.session.user.role)) {
    return res.redirect(getHomeByRole(req.session.user.role));
  }
  next();
}

function requireStudent(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (req.session.user.role !== "ELEVE") {
    return res.redirect(getHomeByRole(req.session.user.role));
  }
  next();
}

function requireParent(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (req.session.user.role !== "PARENT") {
    return res.redirect(getHomeByRole(req.session.user.role));
  }
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

// ACCUEIL ADAPTÉ EN FONCTION DU RÔLE CONNECTÉ
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
          <div class="tile-desc">Faire l'appel par classe (Kinder A à 6ème B)</div>
        </a>
        <a href="/admin/classes" class="tile">
          <div class="tile-icon">🏫</div>
          <div class="tile-title">Gestion des Classes</div>
          <div class="tile-desc">Voir les listes d'élèves par classe</div>
        </a>
        <a href="/admin" class="tile">
          <div class="tile-icon">⚙️</div>
          <div class="tile-title">Panneau Direction</div>
          <div class="tile-desc">Inscrire des élèves et ajouter des notes</div>
        </a>`;
    } else if (rolesProf.includes(role)) {
      tilesHtml = `
        <a href="/admin/appel" class="tile">
          <div class="tile-icon">📝</div>
          <div class="tile-title">Faire l'Appel</div>
          <div class="tile-desc">Noter les présences du jour pour votre classe</div>
        </a>
        <a href="/prof" class="tile">
          <div class="tile-icon">📊</div>
          <div class="tile-title">Saisie des Notes</div>
          <div class="tile-desc">Enregistrer les résultats des contrôles</div>
        </a>`;
    } else if (role === "ELEVE") {
      tilesHtml = `
        <a href="/espace-eleve" class="tile">
          <div class="tile-icon">👨‍🎓</div>
          <div class="tile-title">Mon Espace Élève</div>
          <div class="tile-desc">Consulter mes notes et évalutations</div>
        </a>
        <a href="/calendrier" class="tile">
          <div class="tile-icon">📅</div>
          <div class="tile-title">Calendrier de Présence</div>
          <div class="tile-desc">Aperçu quotidien de mes présences du mois</div>
        </a>`;
    } else if (role === "PARENT") {
      tilesHtml = `
        <a href="/espace-parent" class="tile">
          <div class="tile-icon">👪</div>
          <div class="tile-title">Espace Parent</div>
          <div class="tile-desc">Suivi de la présence et du bulletin de votre enfant</div>
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
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur accueil.");
  }
});

// ESPACE ÉLÈVE (UNIQUEMENT COMPTE, CLASSE ET NOTES)
app.get("/espace-eleve", requireStudent, async (req, res) => {
  const id = req.session.user.id;
  try {
    const student = (await pool.query("SELECT u.*, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.id=$1", [id])).rows[0];
    const notes = await pool.query("SELECT matiere, note, periode FROM notes WHERE eleve_id=$1 ORDER BY date_saisie DESC", [id]).catch(() => ({ rows: [] }));

    const content = `
      <section class="card">
        <h2>👋 Espace Élève — ${h(student.prenom)} ${h(student.nom)}</h2>
        <p>Code Unique : <b style="color:var(--blue)">${h(student.code_eleve)}</b> · Classe : <b>${h(student.nom_classe || "Non assignée")}</b></p>
      </section>

      <section class="card">
        <h2>📊 Mes Notes &amp; Évaluations</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Matière</th><th>Note</th><th>Période</th></tr></thead>
          <tbody>${notes.rows.map(n => `<tr><td><b>${h(n.matiere)}</b></td><td><strong style="color:var(--blue)">${h(n.note)} / 100</strong></td><td>${h(n.periode)}</td></tr>`).join("") || "<tr><td colspan='3'>Aucune note enregistrée pour le moment.</td></tr>"}</tbody>
        </table></div>
      </section>`;

    res.send(layout("Mon Espace Élève", content, req));
  } catch (e) { res.status(500).send("Erreur espace élève."); }
});

// PAGE PAGE CALENDRIER : REÇOIT DÉSORMAIS LE MINI CALENDRIER DE PRÉSENCE (SANS LISTE DE JOURS FÉRIÉS)
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

// ESPACE PARENT
app.get("/espace-parent", requireParent, async (req, res) => {
  const content = `
    <section class="card">
      <h2>👪 Espace Parent — LEKOL S&amp;H</h2>
      <p style="color:var(--muted)">Bienvenue dans votre espace dédié au suivi de la scolarité de vos enfants.</p>
    </section>`;
  res.send(layout("Espace Parent", content, req));
});

// ESPACE PROFESSEUR
app.get("/prof", requireStaff, async (req, res) => {
  try {
    const [classes, students] = await Promise.all([
      pool.query("SELECT id, nom FROM classes ORDER BY id ASC").catch(() => ({ rows: [] })),
      pool.query("SELECT u.id, u.nom, u.prenom, u.code_eleve, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE' ORDER BY u.id DESC").catch(() => ({ rows: [] }))
    ]);

    const studentOpts = students.rows.map(s => `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} (${h(s.code_eleve)})</option>`).join("");

    const content = `
      <div class="card">
        <h2>👨‍🏫 Espace Enseignant — LEKOL S&amp;H</h2>
        <p style="color:var(--muted)">Effectuez la prise d'appel et enregistrez les notes pour vos classes.</p>
      </div>

      <div class="tile-grid">
        <a href="/admin/appel" class="tile">
          <div class="tile-icon">📝</div>
          <div class="tile-title">Prise d'Appel</div>
          <div class="tile-desc">Noter les présences quotidiennes</div>
        </a>
      </div>

      <section class="card">
        <h2>📊 Saisir une Note</h2>
        <form method="post" action="/admin/note">${csrfField(req)}
          <label>Élève</label><select name="eleve_id" required><option value="">Choisir un élève</option>${studentOpts}</select>
          <label>Matière</label><input name="matiere" required placeholder="Ex. Mathématiques">
          <label>Note sur 100</label><input type="number" name="note" min="0" max="100" required placeholder="Ex. 85">
          <label>Période</label><input name="periode" required placeholder="Ex. 1er Contrôle">
          <button style="margin-top:14px" class="btn full" type="submit">Enregistrer la Note</button>
        </form>
      </section>`;

    res.send(layout("Espace Enseignant", content, req));
  } catch (e) { res.status(500).send("Erreur espace prof."); }
});

// PANNEAU ADMIN (ADMINS ET TITULAIRES)
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [classes, students] = await Promise.all([
      pool.query("SELECT id, nom FROM classes ORDER BY id ASC").catch(() => ({ rows: [] })),
      pool.query("SELECT u.id, u.nom, u.prenom, u.code_eleve, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE' ORDER BY u.id DESC").catch(() => ({ rows: [] }))
    ]);

    const classOpts = classes.rows.map(c => `<option value="${c.id}">${h(c.nom)}</option>`).join("");
    const studentOpts = students.rows.map(s => `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} (${h(s.code_eleve)})</option>`).join("");

    const content = `
      <div class="card">
        <h2>⚙️ Panneau de Direction — LEKOL S&amp;H</h2>
        <p style="color:var(--muted)">Gestion globale des élèves, des notes et de la présence scolaire.</p>
      </div>

      <div class="tile-grid">
        <a href="/admin/appel" class="tile">
          <div class="tile-icon">📝</div>
          <div class="tile-title">Prise d'Appel</div>
          <div class="tile-desc">Faire l'appel journalier (Présent, Absent, Retard)</div>
        </a>
        <a href="/admin/classes" class="tile">
          <div class="tile-icon">🏫</div>
          <div class="tile-title">Voir les Classes &amp; Élèves</div>
          <div class="tile-desc">Consulter les listes d'élèves et codes uniques</div>
        </a>
      </div>

      <div class="grid">
        <section class="card">
          <h2>➕ Inscrire un Élève</h2>
          <form method="post" action="/admin/eleve">${csrfField(req)}
            <label>Nom</label><input name="nom" required placeholder="Nom de famille">
            <label>Prénom</label><input name="prenom" required placeholder="Prénom">
            <label>Classe</label><select name="classe_id" required><option value="">Choisir la classe</option>${classOpts}</select>
            <label>Mot de passe</label><input type="password" name="password" value="ecole2026" required>
            <button style="margin-top:14px" class="btn full" type="submit">Créer le Compte Élève</button>
          </form>
        </section>

        <section class="card">
          <h2>📊 Saisir une Note</h2>
          <form method="post" action="/admin/note">${csrfField(req)}
            <label>Élève</label><select name="eleve_id" required><option value="">Choisir un élève</option>${studentOpts}</select>
            <label>Matière</label><input name="matiere" required placeholder="Ex. Mathématiques">
            <label>Note sur 100</label><input type="number" name="note" min="0" max="100" required placeholder="Ex. 85">
            <label>Période</label><input name="periode" required placeholder="Ex. 1er Contrôle">
            <button style="margin-top:14px" class="btn full" type="submit">Enregistrer la Note</button>
          </form>
        </section>
      </div>`;

    res.send(layout("Administration", content, req));
  } catch (e) { res.status(500).send("Erreur administration."); }
});

// PRISE D'APPEL
app.get("/admin/appel", requireStaff, async (req, res) => {
  try {
    const todayAuto = getTodayDate();
    const classes = await pool.query("SELECT id, nom, niveau FROM classes ORDER BY id ASC");

    const content = `
      <div class="card">
        <p style="margin-bottom:10px"><a class="btn secondary" href="/">← Retour</a></p>
        <h2>📝 Prise d'Appel Journalier</h2>
        <p style="color:var(--muted)">📅 Date du jour : <b>${dateFr(todayAuto)}</b>. Sélectionnez une classe pour commencer l'appel.</p>
      </div>

      <div class="tile-grid">
        ${classes.rows.map(c => `
          <a href="/admin/appel/classe/${c.id}" class="tile">
            <div class="tile-icon">🏫</div>
            <div class="tile-title">${h(c.nom)}</div>
            <div class="tile-desc">Niveau : ${h(c.niveau)}</div>
          </a>
        `).join("") || "<p>Aucune classe enregistrée.</p>"}
      </div>`;

    res.send(layout("Prise d'Appel", content, req));
  } catch (e) { res.status(500).send("Erreur appel."); }
});

app.get("/admin/appel/classe/:id", requireStaff, async (req, res) => {
  const classeId = Number(req.params.id);
  const dateAppel = getTodayDate();

  try {
    const classe = (await pool.query("SELECT * FROM classes WHERE id=$1", [classeId])).rows[0];
    if (!classe) return res.status(404).send("Classe non trouvée.");

    const students = await pool.query("SELECT id, nom, prenom, code_eleve FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom", [classeId]);

    const studentRows = students.rows.map(s => `
      <tr>
        <td><b>${h(s.nom)} ${h(s.prenom)}</b></td>
        <td><code style="background:#e2e8f0;padding:4px 8px;border-radius:4px">${h(s.code_eleve)}</code></td>
        <td>
          <label style="display:inline-flex;align-items:center;margin-right:15px;cursor:pointer"><input type="radio" name="statut_${s.id}" value="PRESENT" checked style="width:auto;margin-right:5px">🟢 Présent</label>
          <label style="display:inline-flex;align-items:center;margin-right:15px;cursor:pointer"><input type="radio" name="statut_${s.id}" value="ABSENT" style="width:auto;margin-right:5px">🔴 Absent</label>
          <label style="display:inline-flex;align-items:center;cursor:pointer"><input type="radio" name="statut_${s.id}" value="RETARD" style="width:auto;margin-right:5px">🩶 Retard</label>
        </td>
      </tr>`).join("");

    const content = `
      <div class="card">
        <p style="margin-bottom:10px"><a class="btn secondary" href="/admin/appel">← Retour aux classes</a></p>
        <h2>📋 Appel de la classe : <span style="color:var(--blue)">${h(classe.nom)}</span></h2>
        <p style="color:var(--muted)">📅 Date enregistrée automatiquement : <b>${dateFr(dateAppel)}</b></p>
      </div>

      <section class="card">
        ${students.rows.length > 0 ? `
          <form method="post" action="/admin/appel/valider">
            ${csrfField(req)}
            <input type="hidden" name="classe_id" value="${classeId}">
            <input type="hidden" name="date_presence" value="${dateAppel}">
            <div class="tablewrap">
              <table>
                <thead><tr><th>Nom &amp; Prénom</th><th>Code Élève</th><th>Statut de présence</th></tr></thead>
                <tbody>${studentRows}</tbody>
              </table>
            </div>
            <button style="margin-top:20px" class="btn" type="submit">✅ Enregistrer l'Appel (${h(classe.nom)})</button>
          </form>
        ` : "<p class='muted'>Aucun élève inscrit dans cette classe pour le moment.</p>"}
      </section>`;

    res.send(layout(`Appel - ${classe.nom}`, content, req));
  } catch (e) { res.status(500).send("Erreur détails appel."); }
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
  } catch (e) { res.status(500).send("Erreur validation appel."); }
});

// GESTION DES CLASSES
app.get("/admin/classes", requireStaff, async (req, res) => {
  try {
    const classes = await pool.query("SELECT id, nom, niveau FROM classes ORDER BY id ASC");
    const content = `
      <div class="card">
        <p style="margin-bottom:10px"><a class="btn secondary" href="/">← Retour</a></p>
        <h2>🏫 Liste des Classes &amp; Élèves</h2>
        <p style="color:var(--muted)">Cliquez sur une classe pour voir la liste détaillée des élèves inscrits.</p>
      </div>

      <div class="tile-grid">
        ${classes.rows.map(c => `
          <a href="/admin/classes/${c.id}" class="tile">
            <div class="tile-icon">👥</div>
            <div class="tile-title">${h(c.nom)}</div>
            <div class="tile-desc">Niveau : ${h(c.niveau)}</div>
          </a>
        `).join("")}
      </div>`;
    res.send(layout("Gestion des Classes", content, req));
  } catch (e) { res.status(500).send("Erreur classes."); }
});

app.get("/admin/classes/:id", requireStaff, async (req, res) => {
  const classeId = Number(req.params.id);
  try {
    const classe = (await pool.query("SELECT * FROM classes WHERE id=$1", [classeId])).rows[0];
    if (!classe) return res.status(404).send("Classe non trouvée.");

    const students = await pool.query("SELECT id, nom, prenom, code_eleve FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom", [classeId]);

    const content = `
      <div class="card">
        <p style="margin-bottom:10px"><a class="btn secondary" href="/admin/classes">← Retour aux classes</a></p>
        <h2>👥 Élèves de la classe : <span style="color:var(--blue)">${h(classe.nom)}</span></h2>
        <p style="color:var(--muted)">Total : <b>${students.rows.length} élève(s) inscrit(s)</b></p>
      </div>

      <section class="card">
        <div class="tablewrap">
          <table>
            <thead><tr><th>Nom &amp; Prénom</th><th>Code Unique</th></tr></thead>
            <tbody>
              ${students.rows.map(s => `
                <tr>
                  <td><b>${h(s.nom)} ${h(s.prenom)}</b></td>
                  <td><code style="background:#e2e8f0;padding:4px 8px;border-radius:4px;font-weight:700">${h(s.code_eleve)}</code></td>
                </tr>
              `).join("") || "<tr><td colspan='2'>Aucun élève dans cette classe pour le moment.</td></tr>"}
            </tbody>
          </table>
        </div>
      </section>`;
    res.send(layout(`Classe - ${classe.nom}`, content, req));
  } catch (e) { res.status(500).send("Erreur détails classe."); }
});

// GALERIE
app.get("/galerie", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, titre, description, COALESCE(image_data, image_url) AS img FROM galerie ORDER BY id DESC");
    const content = `
      <section class="card">
        <h2>📸 Galerie Photos — LEKOL S&amp;H</h2>
        <div class="grid" style="margin-top:15px">
          ${rows.map(g => `
            <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff">
              <img src="${g.img}" alt="${h(g.titre)}" style="width:100%;height:220px;object-fit:cover">
              <div style="padding:14px">
                <strong style="color:var(--navy);display:block">${h(g.titre)}</strong>
                <small style="color:var(--muted)">${h(g.description || "")}</small>
              </div>
            </div>`).join("") || "<p class='muted'>Aucune photo disponible pour le moment.</p>"}
        </div>
      </section>`;
    res.send(layout("Galerie", content, req));
  } catch (e) { res.status(500).send("Erreur galerie."); }
});

// CONNEXION
app.get("/connexion", (req, res) => {
  if (req.session.user) return res.redirect(getHomeByRole(req.session.user.role));
  const content = `
    <section class="card" style="max-width:420px;margin:40px auto">
      <h2>🔑 Connexion LEKOL S&amp;H</h2>
      <form method="post" action="/connexion">${csrfField(req)}
        <label>Identifiant / Code Élève</label><input name="identifiant" required placeholder="Email ou S&amp;H-XXXX">
        <label>Mot de passe</label><input type="password" name="password" required placeholder="••••••••">
        <button class="full" style="margin-top:15px" type="submit">Se connecter</button>
      </form>
    </section>`;
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
  } catch (e) { res.status(500).send("Erreur connexion."); }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => { res.clearCookie("lekolsid"); res.redirect("/"); });
});

// ACTIONS ADMIN
app.post("/admin/eleve", requireAdmin, async (req, res) => {
  const { nom, prenom, password, classe_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const code = "S&H-" + crypto.randomInt(1000, 10000);
    await pool.query("INSERT INTO utilisateurs (nom, prenom, code_eleve, mot_de_passe, role, classe_id) VALUES ($1,$2,$3,$4,'ELEVE',$5)", [String(nom).trim(), String(prenom).trim(), code, hash, Number(classe_id)]);
    res.redirect("/admin");
  } catch (e) { res.status(500).send("Erreur ajout élève."); }
});

app.post("/admin/note", requireStaff, async (req, res) => {
  const { eleve_id, matiere, note, periode } = req.body;
  try {
    await pool.query("INSERT INTO notes (eleve_id, matiere, note, periode) VALUES ($1,$2,$3,$4)", [Number(eleve_id), String(matiere).trim(), Number(note), String(periode).trim()]);
    res.redirect(req.session.user.role === "PROF" ? "/prof" : "/admin");
  } catch (e) { res.status(500).send("Erreur ajout note."); }
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
