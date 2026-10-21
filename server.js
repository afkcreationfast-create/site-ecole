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
const rolesAdmin = ["ADMIN", "TITULAIRE", "PROF"];

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

const layout = (title, content, req) => {
  const isAuth = !!req.session.user;
  const isAdmin = isAuth && rolesAdmin.includes(req.session.user.role);

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
.badge { display: inline-block; padding: 4px 10px; border-radius: 99px; font-size: .78rem; font-weight: 700; text-transform: uppercase; }

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
    <a href="/" class="nav-item">🏠 Tableau de Bord</a>
    <a href="/calendrier" class="nav-item">📅 Calendrier &amp; Congés</a>
    <a href="/galerie" class="nav-item">📸 Galerie Scolaire</a>
    ${isAuth ? (isAdmin 
      ? `<a href="/admin" class="nav-item active">⚙️ Panneau de Direction</a>` 
      : `<a href="/espace-eleve" class="nav-item active">👨‍🎓 Mon Espace Élève</a>`)
      : `<a href="/connexion" class="nav-item">🔑 Se Connecter</a>`}
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

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!rolesAdmin.includes(req.session.user.role)) {
    return res.status(403).send(layout("Accès refusé", "<section class='card'><h2>Accès refusé</h2></section>", req));
  }
  next();
}

function requireStudent(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!["ELEVE", "PARENT"].includes(req.session.user.role)) return res.status(403).send("Accès refusé.");
  next();
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
    if (req.path.startsWith('/admin/ia')) return next();
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
    const content = `
      <div class="card" style="background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:32px">
        <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:99px;font-size:.85rem;font-weight:700">📅 Date du jour : ${todayStr}</span>
        <h1 style="font-size:2rem;margin:12px 0 6px">Portail Officiel — LEKOL S&amp;H</h1>
        <p style="opacity:.9">Plateforme de gestion scolaire gratuite. Cliquez sur un carreau ci-dessous pour naviguer.</p>
      </div>

      <h2 style="margin-bottom:16px;color:var(--navy)">Services &amp; Actions Rapides</h2>
      <div class="tile-grid">
        <a href="/admin/appel" class="tile">
          <div class="tile-icon">📝</div>
          <div class="tile-title">Prise d'Appel</div>
          <div class="tile-desc">Faire la présence par classe (Kinder A à 6ème B)</div>
        </a>
        <a href="/calendrier" class="tile">
          <div class="tile-icon">📅</div>
          <div class="tile-title">Calendrier Scolaire</div>
          <div class="tile-desc">Consulter les jours fériés, congés et examens</div>
        </a>
        <a href="/galerie" class="tile">
          <div class="tile-icon">📸</div>
          <div class="tile-title">Galerie Photos</div>
          <div class="tile-desc">Photos des activités de l'école</div>
        </a>
        <a href="/connexion" class="tile">
          <div class="tile-icon">👨‍🎓</div>
          <div class="tile-title">Espace Élèves / Parents</div>
          <div class="tile-desc">Consulter son bulletin et ses devoirs</div>
        </a>
      </div>`;

    res.send(layout("Tableau de bord", content, req));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur accueil.");
  }
});

// SUB-PAGES : LISTE DES CLASSES POUR L'APPEL
app.get("/admin/appel", requireAdmin, async (req, res) => {
  try {
    const todayAuto = getTodayDate();
    const classes = await pool.query("SELECT id, nom, niveau FROM classes ORDER BY id ASC");

    const content = `
      <div class="card">
        <h2>📝 Sélectionne une Classe pour la Prise d'Appel</h2>
        <p style="color:var(--muted)">📅 Date détectée automatiquement : <b>${dateFr(todayAuto)}</b></p>
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
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement appel.");
  }
});

// SUB-PAGE SPÉCIFIQUE À UNE CLASSE
app.get("/admin/appel/classe/:id", requireAdmin, async (req, res) => {
  const classeId = Number(req.params.id);
  const dateAppel = String(req.query.date || getTodayDate());

  try {
    const classe = (await pool.query("SELECT * FROM classes WHERE id=$1", [classeId])).rows[0];
    if (!classe) return res.status(404).send("Classe non trouvée.");

    const students = await pool.query("SELECT id, nom, prenom, code_eleve FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom", [classeId]);

    const studentRows = students.rows.map(s => `
      <tr>
        <td><b>${h(s.nom)} ${h(s.prenom)}</b> <small style="color:var(--muted)">(${h(s.code_eleve)})</small></td>
        <td>
          <label style="display:inline-flex;align-items:center;margin-right:15px"><input type="radio" name="statut_${s.id}" value="PRESENT" checked style="width:auto;margin-right:5px"> Présent</label>
          <label style="display:inline-flex;align-items:center;margin-right:15px"><input type="radio" name="statut_${s.id}" value="ABSENT" style="width:auto;margin-right:5px"> Absent</label>
          <label style="display:inline-flex;align-items:center"><input type="radio" name="statut_${s.id}" value="RETARD" style="width:auto;margin-right:5px"> Retard</label>
        </td>
      </tr>`).join("");

    const content = `
      <div class="card">
        <p style="margin-bottom:10px"><a class="btn secondary" href="/admin/appel">← Retour aux classes</a></p>
        <h2>📋 Prise d'Appel — Classe : <span style="color:var(--blue)">${h(classe.nom)}</span></h2>
        <p style="color:var(--muted)">Date : <b>${dateFr(dateAppel)}</b></p>
      </div>

      <section class="card">
        ${students.rows.length > 0 ? `
          <form method="post" action="/admin/appel/valider">
            ${csrfField(req)}
            <input type="hidden" name="classe_id" value="${classeId}">
            <input type="hidden" name="date_presence" value="${dateAppel}">
            <div class="tablewrap">
              <table>
                <thead><tr><th>Nom &amp; Prénom de l'Élève</th><th>Statut de présence</th></tr></thead>
                <tbody>${studentRows}</tbody>
              </table>
            </div>
            <button style="margin-top:16px" class="btn" type="submit">✅ Valider l'Appel de ${h(classe.nom)}</button>
          </form>
        ` : "<p class='muted'>Aucun élève inscrit dans cette classe pour le moment.</p>"}
      </section>`;

    res.send(layout(`Appel - ${classe.nom}`, content, req));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement sous-page appel.");
  }
});

app.post("/admin/appel/valider", requireAdmin, async (req, res) => {
  const { classe_id, date_presence } = req.body;
  try {
    const students = await pool.query("SELECT id FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1", [Number(classe_id)]);
    for (const s of students.rows) {
      const statut = req.body[`statut_${s.id}`] || "PRESENT";
      await pool.query("DELETE FROM presences WHERE eleve_id=$1 AND date_presence=$2", [s.id, date_presence]);
      await pool.query("INSERT INTO presences (eleve_id, statut, date_presence) VALUES ($1, $2, $3)", [s.id, statut, date_presence]);
    }
    res.redirect(`/admin/appel/classe/${classe_id}`);
  } catch (e) { console.error(e); res.status(500).send("Erreur validation appel."); }
});

// CALENDRIER
app.get("/calendrier", async (req, res) => {
  try {
    const evts = await pool.query("SELECT titre, date_evenement, type_evt, description FROM evenements ORDER BY date_evenement ASC");
    const content = `
      <section class="card">
        <h2>📅 Calendrier Scolaire &amp; Jours Fériés — LEKOL S&amp;H</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Date</th><th>Événement / Congé</th><th>Type</th><th>Description</th></tr></thead>
          <tbody>
            ${evts.rows.map(e => `
              <tr>
                <td><b>${dateFr(e.date_evenement)}</b></td>
                <td><b>${h(e.titre)}</b></td>
                <td><span class="badge">${h(e.type_evt)}</span></td>
                <td>${h(e.description || "—")}</td>
              </tr>
            `).join("") || "<tr><td colspan='4'>Aucun jour férié enregistré.</td></tr>"}
          </tbody>
        </table></div>
      </section>`;
    res.send(layout("Calendrier Scolaire", content, req));
  } catch (e) { res.status(500).send("Erreur calendrier."); }
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
  if (req.session.user) return res.redirect(rolesAdmin.includes(req.session.user.role) ? "/admin" : "/espace-eleve");
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
    res.redirect(rolesAdmin.includes(user.role) ? "/admin" : "/espace-eleve");
  } catch (e) { res.status(500).send("Erreur connexion."); }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => { res.clearCookie("lekolsid"); res.redirect("/"); });
});

// ESPACE ÉLÈVE
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
          <tbody>${notes.rows.map(n => `<tr><td><b>${h(n.matiere)}</b></td><td><strong style="color:var(--blue)">${h(n.note)} / 100</strong></td><td>${h(n.periode)}</td></tr>`).join("") || "<tr><td colspan='3'>Aucune note enregistrée.</td></tr>"}</tbody>
        </table></div>
      </section>`;

    res.send(layout("Espace Élève", content, req));
  } catch (e) { res.status(500).send("Erreur espace élève."); }
});

// PANNEAU ADMIN AVEC ASSISTANT IA INTERACTIF
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
        <p style="color:var(--muted)">Gestion globale et assistant intelligent</p>
      </div>

      <!-- MODULE ASSISTANT IA -->
      <div class="card" style="border: 2px solid var(--blue);">
        <h2>🤖 Assistant IA de Direction</h2>
        <p style="color:var(--muted); margin-bottom: 12px;">Discutez naturellement ou donnez un ordre (ex: "Salut", "Aide-moi", "Hey AI, mets les élèves de Kinder A présents").</p>
        
        <div id="aiChatBox" style="background:#f8fafc; border:1px solid var(--border); border-radius:8px; height:240px; padding:12px; overflow-y:auto; margin-bottom:12px; font-size:.9rem; display:flex; flex-direction:column; gap:8px;">
          <div style="color:var(--navy); background:#e2e8f0; padding:8px 12px; border-radius:8px; max-width:85%; align-self:flex-start;">
            🤖 <b>Assistant IA :</b> Bonjour ! Je suis l'assistant officiel de la direction. Comment puis-je vous aider aujourd'hui ?
          </div>
        </div>

        <div style="display:flex; gap:10px;">
          <input type="text" id="aiPromptInput" placeholder="Écrivez votre message ou ordre..." style="flex:1;" onkeypress="if(event.key==='Enter') document.getElementById('aiSendBtn').click()">
          <button type="button" id="aiSendBtn" class="btn">Envoyer</button>
        </div>
      </div>

      <script>
        document.getElementById('aiSendBtn').addEventListener('click', async () => {
          const input = document.getElementById('aiPromptInput');
          const chatBox = document.getElementById('aiChatBox');
          const prompt = input.value.trim();
          if(!prompt) return;

          chatBox.innerHTML += \`<div style="background:#2563eb; color:#fff; padding:8px 12px; border-radius:8px; max-width:85%; align-self:flex-end;">🧑‍💼 <b>Vous :</b> \${prompt}</div>\`;
          input.value = '';
          chatBox.scrollTop = chatBox.scrollHeight;

          try {
            const res = await fetch('/admin/ia-command', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt })
            });
            const data = await res.json();
            const responseMsg = data.message || data.error || "Action effectuée avec succès.";
            chatBox.innerHTML += \`<div style="background:#e2e8f0; color:var(--navy); padding:8px 12px; border-radius:8px; max-width:85%; align-self:flex-start;">🤖 <b>Assistant IA :</b> \${responseMsg}</div>\`;
          } catch(err) {
            chatBox.innerHTML += \`<div style="background:#fee2e2; color:var(--danger); padding:8px 12px; border-radius:8px; max-width:85%; align-self:flex-start;">🤖 <b>Assistant IA :</b> Désolé, une erreur réseau est survenue.</div>\`;
          }
          chatBox.scrollTop = chatBox.scrollHeight;
        });
      </script>

      <div class="tile-grid">
        <a href="/admin/appel" class="tile">
          <div class="tile-icon">📝</div>
          <div class="tile-title">Faire l'Appel</div>
          <div class="tile-desc">Par sous-page de classe</div>
        </a>
      </div>

      <div class="grid">
        <section class="card">
          <h2>➕ Inscrire un Élève</h2>
          <form method="post" action="/admin/eleve">${csrfField(req)}
            <label>Nom</label><input name="nom" required>
            <label>Prénom</label><input name="prenom" required>
            <label>Classe</label><select name="classe_id" required><option value="">Choisir</option>${classOpts}</select>
            <label>Mot de passe</label><input type="password" name="password" value="ecole2026" required>
            <button style="margin-top:10px" type="submit">Créer le Compte Élève</button>
          </form>
        </section>

        <section class="card">
          <h2>📊 Saisir une Note</h2>
          <form method="post" action="/admin/note">${csrfField(req)}
            <label>Élève</label><select name="eleve_id" required><option value="">Choisir</option>${studentOpts}</select>
            <label>Matière</label><input name="matiere" required placeholder="Ex. Mathématiques">
            <label>Note sur 100</label><input type="number" name="note" min="0" max="100" required>
            <label>Période</label><input name="periode" required placeholder="1er Contrôle">
            <button style="margin-top:10px" type="submit">Enregistrer la Note</button>
          </form>
        </section>
      </div>`;

    res.send(layout("Administration", content, req));
  } catch (e) { res.status(500).send("Erreur administration."); }
});

// ROUTE API LLAMA 3 - CONVERSATION NATURELLE & EXÉCUTION D'ORDRES
app.post("/admin/ia-command", requireAdmin, async (req, res) => {
  const prompt = String(req.body.prompt || "").trim();
  if (!prompt) return res.json({ error: "Aucun ordre ou message fourni." });

  if (!process.env.GROQ_API_KEY) {
    return res.json({ error: "Clé GROQ_API_KEY non configurée sur Render." });
  }

  try {
    const dbClasses = await pool.query("SELECT id, nom FROM classes ORDER BY id ASC");
    const classListStr = dbClasses.rows.map(c => `"${c.nom}"`).join(", ");

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Tu es l'assistant intelligent de la direction de l'école LEKOL S&H en Haïti.
Classes disponibles : [${classListStr}].

Tu dois analyser le message de l'administrateur et répondre strictement sous forme d'un objet JSON valide contenant :
- "action": "discussion" (si c'est une salutation, une question, de l'aide ou une discussion générale) ou "presence" (pour l'appel) ou "evenement" (pour un congé/calendrier) ou "annonce" (pour publier une annonce).
- "message_reponse": Ton texte de conversation amical, poli et détaillé si c'est une discussion ou une question.
- "reponse_intro": Une petite phrase naturelle de confirmation si c'est une action (ex: "C'est parti !").
- "classe_exacte": Le nom exact de la classe concernée si action=presence (pris parmi la liste).
- "statut": "PRESENT", "ABSENT" ou "RETARD".
- "titre": Titre de l'événement ou de l'annonce si applicable.
- "type_evt": "CONGÉ", "FÉRIÉ", "EXAMEN" ou "ÉVÉNEMENT".`
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.5
      })
    });

    const aiData = await aiResponse.json();
    const contentText = aiData.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(contentText);
    const today = getTodayDate();

    // 1. Discussion / Salutations / Aide
    if (parsed.action === "discussion" || parsed.message_reponse) {
      const defaultReply = "Bonjour ! Je suis votre assistant de direction. Je peux vous aider à faire l'appel d'une classe, ajouter des congés au calendrier ou publier des annonces. Que souhaitez-vous faire ?";
      return res.json({ message: parsed.message_reponse || defaultReply });
    }

    // 2. Prise d'Appel
    if (parsed.action === "presence") {
      const classNameReq = parsed.classe_exacte || "";

      const cls = (await pool.query(
        "SELECT id, nom FROM classes WHERE lower(nom) LIKE lower($1) OR lower(nom) LIKE lower($2) LIMIT 1",
        [`%${classNameReq}%`, `%${prompt}%`]
      )).rows[0];

      if (cls) {
        const students = await pool.query("SELECT id FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1", [cls.id]);
        
        if (students.rows.length === 0) {
          return res.json({ message: `${parsed.reponse_intro || 'Entendu !'} Cependant, aucun élève n'est inscrit dans la classe **${cls.nom}** pour le moment.` });
        }

        for (const s of students.rows) {
          await pool.query("DELETE FROM presences WHERE eleve_id=$1 AND date_presence=$2", [s.id, today]);
          await pool.query("INSERT INTO presences (eleve_id, statut, date_presence) VALUES ($1, $2, $3)", [s.id, parsed.statut || "PRESENT", today]);
        }

        const intro = parsed.reponse_intro ? `${parsed.reponse_intro} ` : "C'est fait ! ";
        return res.json({ message: `🤖 ${intro}Tous les élèves de la classe **${cls.nom}** ont été marqués : **${parsed.statut || "PRESENT"}** pour aujourd'hui.` });
      } else {
        return res.json({ message: "⚠️ Je n'ai pas bien identifié la classe. Merci de préciser (ex: 'Mets les élèves de 1ère Année A présents')." });
      }
    }

    // 3. Calendrier / Événement
    if (parsed.action === "evenement") {
      await pool.query(
        "INSERT INTO evenements (titre, date_evenement, type_evt, description) VALUES ($1, $2, $3, $4)",
        [parsed.titre || "Congé / Événement", today, parsed.type_evt || "CONGÉ", prompt]
      );
      const intro = parsed.reponse_intro ? `${parsed.reponse_intro} ` : "Très bien ! ";
      return res.json({ message: `🤖 ${intro}L'événement "**${parsed.titre || "Congé"}**" a bien été ajouté au calendrier.` });
    }

    // 4. Publication d'Annonce
    if (parsed.action === "annonce") {
      await pool.query(
        "INSERT INTO annonces (titre, contenu) VALUES ($1, $2)",
        [parsed.titre || "Annonce Officielle", prompt]
      );
      const intro = parsed.reponse_intro ? `${parsed.reponse_intro} ` : "Parfait ! ";
      return res.json({ message: `🤖 ${intro}L'annonce officielle a été publiée sur le site.` });
    }

    res.json({ message: parsed.message_reponse || "Comment puis-je vous aider pour la suite ?" });

  } catch (e) {
    console.error("Erreur Llama 3:", e);
    res.json({ error: "Une erreur est survenue lors du traitement de votre demande." });
  }
});

app.post("/admin/eleve", requireAdmin, async (req, res) => {
  const { nom, prenom, password, classe_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const code = "S&H-" + crypto.randomInt(1000, 10000);
    await pool.query("INSERT INTO utilisateurs (nom, prenom, code_eleve, mot_de_passe, role, classe_id) VALUES ($1,$2,$3,$4,'ELEVE',$5)", [String(nom).trim(), String(prenom).trim(), code, hash, Number(classe_id)]);
    res.redirect("/admin");
  } catch (e) { res.status(500).send("Erreur ajout élève."); }
});

app.post("/admin/note", requireAdmin, async (req, res) => {
  const { eleve_id, matiere, note, periode } = req.body;
  try {
    await pool.query("INSERT INTO notes (eleve_id, matiere, note, periode) VALUES ($1,$2,$3,$4)", [Number(eleve_id), String(matiere).trim(), Number(note), String(periode).trim()]);
    res.redirect("/admin");
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
