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

// MIGRATIONS AUTOMATIQUES BDD
async function initTables() {
  await pool.query(`
    ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS photo_url TEXT;
    
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

    ALTER TABLE notes ADD COLUMN IF NOT EXISTS total_max INT DEFAULT 100;
    ALTER TABLE notes ADD COLUMN IF NOT EXISTS type_eval VARCHAR(50) DEFAULT 'Contrôle';
  `).catch(err => console.log("Info DB:", err.message));
}
initTables();

// LAYOUT
const layout = (title, content, req) => {
  const isAuth = !!req.session.user;
  const user = isAuth ? req.session.user : null;
  const userRole = user ? user.role : null;
  const photo = user && user.photo_url ? user.photo_url : "https://via.placeholder.com/40";

  let navItems = `<a href="/" class="nav-item">🏠 Tableau de Bord</a>
                  <a href="/horaire" class="nav-item active">📅 Horaire des Cours</a>
                  <a href="/calendrier" class="nav-item">🗓️ Calendrier &amp; Présence</a>
                  <a href="/galerie" class="nav-item">📸 Galerie Scolaire</a>`;

  if (isAuth) {
    if (rolesAdmin.includes(userRole)) {
      navItems += `<a href="/admin" class="nav-item">⚙️ Panneau de Direction</a>`;
    } else if (rolesProf.includes(userRole)) {
      navItems += `<a href="/prof" class="nav-item">👨‍🏫 Espace Professeur</a>`;
    } else if (userRole === "PARENT") {
      navItems += `<a href="/espace-parent" class="nav-item">👪 Espace Parent</a>`;
    } else if (userRole === "ELEVE") {
      navItems += `<a href="/espace-eleve" class="nav-item">👨‍🎓 Mon Dossier Élève</a>`;
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
.sidebar-header { padding: 20px; border-bottom: 1px solid #1e293b; }
.sidebar-logo { font-size: 1.4rem; font-weight: 900; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 10px; }
.sidebar-logo span { color: var(--gold); }
.user-sidebar-card { display: flex; align-items: center; gap: 12px; padding: 15px 20px; border-bottom: 1px solid #1e293b; background: #162032; }
.user-avatar { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid var(--blue); }

.sidebar-nav { padding: 15px 10px; flex: 1; display: flex; flex-direction: column; gap: 6px; overflow-y: auto; }
.nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; color: #cbd5e1; text-decoration: none; font-weight: 600; font-size: .92rem; border-radius: 8px; transition: .15s; }
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

.stat-box { background: #fff; border: 1px solid var(--border); border-radius: 12px; padding: 18px; text-align: center; }
.stat-value { font-size: 1.8rem; font-weight: 900; color: var(--blue); }
.stat-label { font-size: .82rem; font-weight: 700; color: var(--muted); text-transform: uppercase; margin-top: 4px; }

label { display: block; font-weight: 650; font-size: .88rem; margin: 12px 0 4px; color: #334155; }
input, select, textarea { width: 100%; padding: 11px 14px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; font: inherit; color: var(--text); }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px #2563eb22; }
.btn, button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: var(--blue); color: #fff; border: 0; border-radius: 8px; padding: 11px 18px; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; transition: .15s; }
.btn:hover, button:hover { background: var(--blue-hover); }
.btn.secondary { background: #f1f5f9; color: #334155; border: 1px solid var(--border); }
.btn.danger { background: var(--danger); padding: 5px 10px; font-size: .8rem; }
.btn.full { width: 100%; }

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
    <button class="toggle-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
    <div style="font-weight:800;color:var(--navy);font-size:1.1rem">LEKOL S&amp;H</div>
    <div class="user-badge">
      ${isAuth ? `<span>${h(user.prenom)}</span> <a class="btn secondary" href="/deconnexion" style="padding:6px 12px;font-size:.8rem">Sortir</a>` : `<a class="btn" href="/connexion">Connexion</a>`}
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
        <a href="/connexion" class="tile"><div class="tile-icon">🔑</div><div class="tile-title">Se Connecter</div><div class="tile-desc">Accéder à son espace privé</div></a>
        <a href="/horaire" class="tile"><div class="tile-icon">📅</div><div class="tile-title">Horaire des Cours</div><div class="tile-desc">Consulter l'emploi du temps</div></a>
        <a href="/calendrier" class="tile"><div class="tile-icon">🗓️</div><div class="tile-title">Calendrier de Présence</div><div class="tile-desc">Aperçu mensuel des présences</div></a>`;
    } else if (rolesAdmin.includes(role)) {
      tilesHtml = `
        <a href="/admin/appel" class="tile"><div class="tile-icon">📝</div><div class="tile-title">Prise d'Appel</div><div class="tile-desc">Faire l'appel par classe</div></a>
        <a href="/horaire" class="tile"><div class="tile-icon">📅</div><div class="tile-title">Éditer les Horaires</div><div class="tile-desc">Gérer les emplois du temps</div></a>
        <a href="/admin" class="tile"><div class="tile-icon">⚙️</div><div class="tile-title">Panneau Direction</div><div class="tile-desc">Comptes, photos et notes</div></a>`;
    } else if (rolesProf.includes(role)) {
      tilesHtml = `
        <a href="/admin/appel" class="tile"><div class="tile-icon">📝</div><div class="tile-title">Faire l'Appel</div><div class="tile-desc">Présences du jour</div></a>
        <a href="/prof" class="tile"><div class="tile-icon">📊</div><div class="tile-title">Notes &amp; Devoirs</div><div class="tile-desc">Saisir les évaluations</div></a>`;
    } else if (role === "ELEVE") {
      tilesHtml = `
        <a href="/espace-eleve" class="tile"><div class="tile-icon">🎓</div><div class="tile-title">Dossier Élève</div><div class="tile-desc">Notes, bulletin et photo de profil</div></a>
        <a href="/horaire" class="tile"><div class="tile-icon">📅</div><div class="tile-title">Mon Emploi du Temps</div><div class="tile-desc">Horaire officiel de ma classe</div></a>`;
    } else if (role === "PARENT") {
      tilesHtml = `
        <a href="/espace-parent" class="tile"><div class="tile-icon">👪</div><div class="tile-title">Espace Parent</div><div class="tile-desc">Suivi de votre enfant</div></a>`;
    }

    const content = `
      <div class="card" style="background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:32px">
        <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:999px;font-size:.85rem;font-weight:700">📅 Date du jour : ${todayStr}</span>
        <h1 style="font-size:2rem;margin:12px 0 6px">Portail Officiel — LEKOL S&amp;H</h1>
        <p style="opacity:.9">Plateforme de gestion scolaire officielle.</p>
      </div>
      <h2 style="margin-bottom:16px;color:var(--navy)">Accès Rapides</h2>
      <div class="tile-grid">${tilesHtml}</div>`;

    res.send(layout("Tableau de bord", content, req));
  } catch (e) { res.status(500).send("Erreur accueil."); }
});

// DOSSIER ÉLÈVE AVEC COMPRESSION AUTOMATIQUE DE LA PHOTO
app.get("/espace-eleve", requireStudent, async (req, res) => {
  const id = req.session.user.id;
  try {
    const student = (await pool.query("SELECT u.*, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.id=$1", [id])).rows[0];
    const notes = await pool.query("SELECT matiere, note, COALESCE(total_max, 100) as total_max, COALESCE(type_eval, 'Contrôle') as type_eval, periode FROM notes WHERE eleve_id=$1 ORDER BY date_saisie DESC", [id]).catch(() => ({ rows: [] }));
    const presences = await pool.query("SELECT statut FROM presences WHERE eleve_id=$1", [id]).catch(() => ({ rows: [] }));
    const matieres = await pool.query("SELECT nom_matiere, nom_prof, coeff FROM matieres_classes WHERE classe_id=$1", [student.classe_id]).catch(() => ({ rows: [] }));

    const absCount = presences.rows.filter(p => p.statut === "ABSENT").length;
    const retCount = presences.rows.filter(p => p.statut === "RETARD").length;

    const photoUrl = student.photo_url || "https://via.placeholder.com/100";

    const content = `
      <section class="card" style="background:linear-gradient(135deg,#1e3a8a,#0f172a);color:#fff;display:flex;flex-wrap:wrap;align-items:center;gap:20px;padding:24px">
        <img src="${h(photoUrl)}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:3px solid #fff">
        <div style="flex:1">
          <span style="background:rgba(255,255,255,0.2);padding:3px 10px;border-radius:6px;font-size:.8rem;font-weight:700">DOSSIER ÉLÈVE</span>
          <h2 style="margin:6px 0 2px;color:#fff">${h(student.prenom)} ${h(student.nom)}</h2>
          <p style="opacity:.9;font-size:.9rem">Code : <b>${h(student.code_eleve)}</b> · Classe : <b>${h(student.nom_classe || "Non assignée")}</b></p>
        </div>

        <form method="post" action="/espace-eleve/photo" style="background:rgba(255,255,255,0.1);padding:12px;border-radius:10px;width:100%;max-width:300px">
          ${csrfField(req)}
          <label style="color:#fff;margin-top:0;font-size:.82rem">📷 Prendre / Changer sa Photo :</label>
          <input type="file" id="photoInput" accept="image/*" style="display:none">
          <input type="hidden" name="photo_base64" id="photoBase64">
          <button type="button" class="btn secondary" style="width:100%;margin-top:6px" onclick="document.getElementById('photoInput').click()">📸 Appareil photo / Galerie</button>
          <button type="submit" id="savePhotoBtn" class="btn" style="width:100%;margin-top:6px;display:none;background:#22c55e">✅ Enregistrer</button>
        </form>
      </section>

      <script>
        document.getElementById('photoInput').addEventListener('change', function(e) {
          const file = e.target.files[0];
          if (file) {
            const img = new Image();
            img.src = URL.createObjectURL(file);
            img.onload = function() {
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              const maxDim = 400;
              let width = img.width;
              let height = img.height;

              if (width > height) {
                if (width > maxDim) { height *= maxDim / width; width = maxDim; }
              } else {
                if (height > maxDim) { width *= maxDim / height; height = maxDim; }
              }

              canvas.width = width;
              canvas.height = height;
              ctx.drawImage(img, 0, 0, width, height);

              const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
              document.getElementById('photoBase64').value = compressedBase64;
              document.getElementById('savePhotoBtn').style.display = 'block';
            };
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
        <div style="overflow-x:auto">
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
      </section>

      <section class="card">
        <h2>📚 Matières &amp; Professeurs de la classe</h2>
        <div style="overflow-x:auto">
          <table class="excel-table">
            <thead><tr><th>Matière</th><th>Enseignant</th><th>Coeff</th></tr></thead>
            <tbody>
              ${matieres.rows.map(m => `
                <tr>
                  <td><b>${h(m.nom_matiere)}</b></td>
                  <td>${h(m.nom_prof)}</td>
                  <td><span class="excel-badge">Coeff. ${h(m.coeff)}</span></td>
                </tr>
              `).join("") || "<tr><td colspan='3' style='text-align:center;padding:15px'>Matières générales.</td></tr>"}
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

// PAGE DYNAMIQUE : HORAIRE & EMPLOI DU TEMPS
app.get("/horaire", async (req, res) => {
  try {
    const isAuth = !!req.session.user;
    const userRole = isAuth ? req.session.user.role : null;
    const isAdmin = rolesAdmin.includes(userRole);

    const classes = await pool.query("SELECT id, nom FROM classes ORDER BY id ASC");
    
    let selectedClasseId = 1;
    if (isAdmin) {
      selectedClasseId = req.query.classe_id ? Number(req.query.classe_id) : (classes.rows[0]?.id || 1);
    } else if (isAuth && req.session.user.classe_id) {
      selectedClasseId = req.session.user.classe_id;
    } else {
      selectedClasseId = classes.rows[0]?.id || 1;
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
        <div style="min-width:220px">
          <label style="margin-top:0">Changer de classe (Mode Admin) :</label>
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
            <span style="font-size:.8rem;font-weight:600;opacity:.9">${coursJour.length} cours planifié(s)</span>
          </div>
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
        </div>`;
    }).join("");

    let adminFormHtml = "";
    if (isAdmin) {
      adminFormHtml = `
        <section class="card" style="border:2px dashed var(--blue);background:#eff6ff">
          <h3 style="color:var(--navy);margin-bottom:10px">➕ Ajouter un créneau d'horaire pour : <span style="color:var(--blue)">${h(classeNom)}</span></h3>
          <form method="post" action="/admin/horaire/ajouter">${csrfField(req)}
            <input type="hidden" name="classe_id" value="${selectedClasseId}">
            
            <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:10px">
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
              <div>
                <label>Heure Début</label>
                <input name="heure_debut" required placeholder="Ex. 08:00">
              </div>
              <div>
                <label>Heure Fin</label>
                <input name="heure_fin" required placeholder="Ex. 09:00">
              </div>
              <div>
                <label>Matière</label>
                <input name="matiere" required placeholder="Ex. Français, Mathématiques...">
              </div>
              <div>
                <label>Professeur</label>
                <input name="professeur" required placeholder="Ex. M. Béliard">
              </div>
              <div>
                <label>Coefficient</label>
                <input type="number" name="coeff" value="1" min="1" required>
              </div>
            </div>

            <button type="submit" class="btn full" style="margin-top:15px">✅ Enregistrer ce créneau horaire</button>
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

// ACTIONS ADMIN POUR LES HORAIRES
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

// CONNEXION FLEXIBLE (PAR CODE, EMAIL, NOM OU PRÉNOM)
app.get("/connexion", (req, res) => {
  if (req.session.user) return res.redirect(getHomeByRole(req.session.user.role));
  const content = `
    <section class="card" style="max-width:400px;margin:40px auto">
      <h2>🔑 Connexion</h2>
      <p style="color:var(--muted);font-size:.85rem;margin-bottom:15px">Entrez votre code élève (ex: S&amp;H-XXXX), votre e-mail, ou votre nom et prénom.</p>
      <form method="post" action="/connexion">${csrfField(req)}
        <label>Identifiant / Nom / Code</label>
        <input name="identifiant" required placeholder="Ex. Fransen Augustin ou S&amp;H-1234">
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
    // REQUÊTE FLEXIBLE : GÈRE LE CODE, L'EMAIL, LE NOM, LE PRÉNOM OU NOM + PRÉNOM
    const queryText = `
      SELECT * FROM utilisateurs 
      WHERE lower(email) = lower($1) 
         OR code_eleve = $1 
         OR lower(nom) = lower($1) 
         OR lower(prenom) = lower($1)
         OR lower(concat(prenom, ' ', nom)) = lower($1)
         OR lower(concat(nom, ' ', prenom)) = lower($1)
      LIMIT 1
    `;
    const { rows } = await pool.query(queryText, [identClean]);
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.mot_de_passe).catch(() => user.mot_de_passe === password))) {
      return res.status(401).send(layout("Erreur", "<section class='card'><h2>Identifiants incorrects</h2><p style='color:var(--muted);margin:10px 0'>Vérifiez votre nom, prénom, code ou mot de passe.</p><a class='btn' href='/connexion'>Réessayer</a></section>", req));
    }

    req.session.user = { id: user.id, nom: user.nom, prenom: user.prenom, role: user.role, classe_id: user.classe_id, photo_url: user.photo_url };
    res.redirect(getHomeByRole(user.role));
  } catch (e) { res.status(500).send("Erreur connexion."); }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => { res.clearCookie("lekolsid"); res.redirect("/"); });
});

// PANNEAU DIRECTION (ADMIN)
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
        <p style="color:var(--muted)">Gestion des comptes, photos de profil, matières et notes.</p>
      </div>

      <div class="grid">
        <section class="card">
          <h2>➕ Inscrire un Élève</h2>
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
          <h2>📊 Saisir Note / Devoir</h2>
          <form method="post" action="/admin/note">${csrfField(req)}
            <label>Élève</label><select name="eleve_id" required><option value="">Choisir un élève</option>${studentOpts}</select>
            <label>Type d'Évaluation</label>
            <select name="type_eval" required>
              <option value="Devoir Maison">Devoir Maison</option>
              <option value="Exercice en Classe">Exercice en Classe</option>
              <option value="Contrôle">Contrôle</option>
              <option value="Examen">Examen</option>
            </select>
            <label>Matière</label><input name="matiere" required placeholder="Ex. Mathématiques">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div><label>Note tenue</label><input type="number" step="0.5" name="note" required placeholder="8.5"></div>
              <div><label>Sur combien ?</label><input type="number" name="total_max" value="100" required placeholder="100 ou 10"></div>
            </div>
            <label>Période</label><input name="periode" required placeholder="Ex. 1er Contrôle">
            <button style="margin-top:14px" class="btn full" type="submit">Enregistrer la Note</button>
          </form>
        </section>
      </div>`;

    res.send(layout("Administration", content, req));
  } catch (e) { res.status(500).send("Erreur admin."); }
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

app.post("/admin/note", requireStaff, async (req, res) => {
  const { eleve_id, matiere, note, total_max, type_eval, periode } = req.body;
  try {
    await pool.query("INSERT INTO notes (eleve_id, matiere, note, total_max, type_eval, periode) VALUES ($1,$2,$3,$4,$5,$6)", [Number(eleve_id), String(matiere).trim(), Number(note), Number(total_max) || 100, String(type_eval), String(periode).trim()]);
    res.redirect(req.session.user.role === "PROF" ? "/prof" : "/admin");
  } catch (e) { res.status(500).send("Erreur note."); }
});

// CALENDRIER
app.get("/calendrier", async (req, res) => {
  try {
    const isAuth = !!req.session.user;
    const id = isAuth ? req.session.user.id : null;

    let presenceMap = {};
    if (id) {
      const presences = await pool.query("SELECT date_presence::text, statut FROM presences WHERE eleve_id=$1", [id]).catch(() => ({ rows: [] }));
      presences.rows.forEach(p => { presenceMap[p.date_presence.split("T")[0]] = p.statut; });
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthName = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

    const firstDayIndex = new Date(year, month, 1).getDay();
    const startOffset = (firstDayIndex === 0 ? 6 : firstDayIndex - 1); 
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let calendarCellsHtml = "";
    for (let i = 0; i < startOffset; i++) { calendarCellsHtml += `<div class="calendar-cell empty"></div>`; }

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
        <div class="calendar-grid">
          <div class="calendar-day-head">Lun</div><div class="calendar-day-head">Mar</div><div class="calendar-day-head">Mer</div><div class="calendar-day-head">Jeu</div><div class="calendar-day-head">Ven</div><div class="calendar-day-head">Sam</div><div class="calendar-day-head">Dim</div>
          ${calendarCellsHtml}
        </div>
        <div class="legend-box">
          <div class="legend-item"><span class="legend-dot" style="background:#22c55e"></span> <b>Vert</b> = Présent</div>
          <div class="legend-item"><span class="legend-dot" style="background:#ef4444"></span> <b>Rouge</b> = Absent</div>
          <div class="legend-item"><span class="legend-dot" style="background:#64748b"></span> <b>Gris</b> = Retard</div>
        </div>
      </section>`;

    res.send(layout("Calendrier de Présence", content, req));
  } catch (e) { res.status(500).send("Erreur calendrier."); }
});

// PRISE D'APPEL ET CLASSES
app.get("/admin/appel", requireStaff, async (req, res) => {
  try {
    const classes = await pool.query("SELECT id, nom, niveau FROM classes ORDER BY id ASC");
    const content = `<div class="card"><h2>📝 Prise d'Appel</h2><div class="tile-grid">${classes.rows.map(c => `<a href="/admin/appel/classe/${c.id}" class="tile"><div class="tile-title">${h(c.nom)}</div></a>`).join("")}</div></div>`;
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
  } catch (e) { res.status(500).send("Erreur sous-page."); }
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
    const content = `<div class="card"><h2>👥 ${h(classe.nom)}</h2><table class="excel-table"><thead><tr><th>Élève</th><th>Code</th></tr></thead><tbody>${students.rows.map(s => `<tr><td>${h(s.nom)} ${h(s.prenom)}</td><td><code>${h(s.code_eleve)}</code></td></tr>`).join("")}</tbody></table></div>`;
    res.send(layout("Détails classe", content, req));
  } catch (e) { res.status(500).send("Erreur."); }
});

app.get("/galerie", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, titre, description, COALESCE(image_data, image_url) AS img FROM galerie ORDER BY id DESC");
    const content = `<section class="card"><h2>📸 Galerie Photos</h2><div class="grid">${rows.map(g => `<div><img src="${g.img}" style="width:100%;height:180px;object-fit:cover"><p>${h(g.titre)}</p></div>`).join("")}</div></section>`;
    res.send(layout("Galerie", content, req));
  } catch (e) { res.status(500).send("Erreur."); }
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
