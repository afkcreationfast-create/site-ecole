const express = require("express");
const { Pool } = require("pg");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const fileUpload = require("express-fileupload");
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
app.use(express.urlencoded({ extended: false, limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 } }));

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
  value ? new Date(value).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' }) : "—";

const today = () => new Date().toISOString().slice(0, 10);

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
  --bg: #f8fafc;
  --card: #ffffff;
  --text: #0f172a;
  --muted: #64748b;
  --border: #e2e8f0;
  --success: #16a34a;
  --danger: #dc2626;
  --warning: #d97706;
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
.sidebar-nav { padding: 15px 10px; flex: 1; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; }
.nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; color: #94a3b8; text-decoration: none; font-weight: 600; font-size: .95rem; border-radius: 8px; transition: .15s; }
.nav-item:hover, .nav-item.active { background: #1e293b; color: #fff; }
.nav-item.active { background: var(--blue); }

.main-wrapper { flex: 1; margin-left: var(--sidebar-w); display: flex; flex-direction: column; min-width: 0; }
header.topbar { background: #fff; border-bottom: 1px solid var(--border); padding: 16px 28px; display: flex; align-items: center; justify-content: space-between; }
.toggle-btn { display: none; background: none; border: none; font-size: 1.5rem; cursor: pointer; color: var(--navy); }
.user-badge { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: .9rem; }

main.content { padding: 28px; max-width: 1300px; margin: 0 auto; width: 100%; }

.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px #0000000d; }
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
.badge.success { background: #dcfce7; color: #15803d; }
.badge.danger { background: #fee2e2; color: #b91c1c; }
.badge.warning { background: #fef3c7; color: #b45309; }
.badge.FÉRIÉ { background: #fee2e2; color: #b91c1c; }
.badge.CONGÉ { background: #fef3c7; color: #b45309; }
.badge.EXAMEN { background: #e0e7ff; color: #3730a3; }
.badge.ÉVÉNEMENT { background: #dcfce7; color: #15803d; }

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
    <a href="/" class="nav-item">🏠 Accueil &amp; Actualités</a>
    <a href="/calendrier" class="nav-item">📅 Calendrier &amp; Congés</a>
    <a href="/galerie" class="nav-item">📸 Galerie Scolaire</a>
    ${isAuth ? (isAdmin 
      ? `<a href="/admin" class="nav-item">⚙️ Administration</a>` 
      : `<a href="/espace-eleve" class="nav-item">👨‍🎓 Espace Élève</a>`)
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
    if (req.headers["content-type"] && req.headers["content-type"].includes("multipart/form-data")) {
      return next();
    }
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
    const [annonces, evts] = await Promise.all([
      pool.query("SELECT titre,contenu,date_publication FROM annonces ORDER BY date_publication DESC LIMIT 5"),
      pool.query("SELECT titre,date_evenement,type_evt FROM evenements WHERE date_evenement >= CURRENT_DATE ORDER BY date_evenement ASC LIMIT 5")
    ]);

    const content = `
      <div class="card" style="background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:35px">
        <h1 style="font-size:2rem;margin-bottom:10px">Bienvenue à LEKOL S&amp;H</h1>
        <p style="opacity:.9;max-width:700px;font-size:1.05rem">Portail officiel d'excellence académique. Consultation des notes, devoirs, calendrier des congés et communications en temps réel.</p>
      </div>

      <div class="grid">
        <section class="card">
          <h2>📢 Dernières Annonces</h2>
          ${annonces.rows.map(a => `
            <div style="padding:14px;background:#f8fafc;border-left:4px solid var(--blue);border-radius:6px;margin-bottom:12px">
              <strong style="display:block;color:var(--navy);font-size:1rem">${h(a.titre)}</strong>
              <p style="margin:4px 0">${h(a.contenu)}</p>
              <small style="color:var(--muted)">${dateFr(a.date_publication)}</small>
            </div>`).join("") || "<p class='muted'>Aucune annonce.</p>"}
        </section>

        <section class="card">
          <h2>📌 Prochains Événements &amp; Congés</h2>
          ${evts.rows.map(e => `
            <div style="padding:12px;background:#fff;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
              <div>
                <strong>${h(e.titre)}</strong><br>
                <small style="color:var(--muted)">${dateFr(e.date_evenement)}</small>
              </div>
              <span class="badge ${e.type_evt}">${h(e.type_evt)}</span>
            </div>`).join("") || "<p class='muted'>Aucun événement prévu.</p>"}
        </section>
      </div>`;

    res.send(layout("Accueil", content, req));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement accueil.");
  }
});

// ROUTE CALENDRIER (SÉCURISÉE SANS ERREUR)
app.get("/calendrier", async (req, res) => {
  try {
    const evts = await pool.query("SELECT titre, date_evenement, type_evt, description FROM evenements ORDER BY date_evenement ASC");
    const content = `
      <section class="card">
        <h2>📅 Calendrier Scolaire &amp; Jours Fériés — LEKOL S&amp;H</h2>
        <p style="color:var(--muted);margin-bottom:15px">Consultez les dates d'examens, congés officiels et événements importants.</p>
        <div class="tablewrap"><table>
          <thead><tr><th>Date</th><th>Événement / Congé</th><th>Type</th><th>Description</th></tr></thead>
          <tbody>
            ${evts.rows.map(e => `
              <tr>
                <td><b>${dateFr(e.date_evenement)}</b></td>
                <td><b>${h(e.titre)}</b></td>
                <td><span class="badge ${h(e.type_evt)}">${h(e.type_evt)}</span></td>
                <td>${h(e.description || "—")}</td>
              </tr>
            `).join("") || "<tr><td colspan='4'>Aucun jour férié ou congé enregistré.</td></tr>"}
          </tbody>
        </table></div>
      </section>`;
    res.send(layout("Calendrier Scolaire", content, req));
  } catch (e) {
    console.error("Erreur calendrier:", e);
    res.status(500).send(layout("Erreur", "<section class='card'><h2>Erreur calendrier</h2><p>Exécutez le script SQL dans Supabase.</p></section>", req));
  }
});

// ROUTE GALERIE (SÉCURISÉE ET STOCKÉE EN BASE64)
app.get("/galerie", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT id, titre, description, image_data FROM galerie ORDER BY id DESC");
    const content = `
      <section class="card">
        <h2>📸 Galerie Photos — LEKOL S&amp;H</h2>
        <div class="grid" style="margin-top:15px">
          ${rows.map(g => `
            <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff">
              <img src="${g.image_data}" alt="${h(g.titre)}" style="width:100%;height:200px;object-fit:cover">
              <div style="padding:14px">
                <strong style="color:var(--navy);display:block">${h(g.titre)}</strong>
                <small style="color:var(--muted)">${h(g.description || "")}</small>
              </div>
            </div>`).join("") || "<p class='muted'>Aucune photo disponible pour le moment.</p>"}
        </div>
      </section>`;
    res.send(layout("Galerie", content, req));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur galerie.");
  }
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
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur connexion.");
  }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => { res.clearCookie("lekolsid"); res.redirect("/"); });
});

// ESPACE ÉLÈVE
app.get("/espace-eleve", requireStudent, async (req, res) => {
  const id = req.session.user.id;
  try {
    const student = (await pool.query("SELECT u.*, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.id=$1", [id])).rows[0];
    const [notes, devoirs] = await Promise.all([
      pool.query("SELECT matiere, note, periode FROM notes WHERE eleve_id=$1 ORDER BY date_saisie DESC", [id]),
      student.classe_id ? pool.query("SELECT matiere, description, date_pour FROM devoirs WHERE classe_id=$1 ORDER BY date_pour ASC", [student.classe_id]) : Promise.resolve({ rows: [] })
    ]);

    const content = `
      <section class="card">
        <h2>👋 Espace Élève — ${h(student.prenom)} ${h(student.nom)}</h2>
        <p>Code Unique : <b style="color:var(--blue)">${h(student.code_eleve)}</b> · Classe : <b>${h(student.nom_classe || "Non assignée")}</b></p>
      </section>

      <div class="grid">
        <section class="card">
          <h2>📊 Mes Notes &amp; Évaluations</h2>
          <div class="tablewrap"><table>
            <thead><tr><th>Matière</th><th>Note</th><th>Période</th></tr></thead>
            <tbody>${notes.rows.map(n => `<tr><td><b>${h(n.matiere)}</b></td><td><strong style="color:var(--blue)">${h(n.note)} / 100</strong></td><td>${h(n.periode)}</td></tr>`).join("") || "<tr><td colspan='3'>Aucune note.</td></tr>"}</tbody>
          </table></div>
        </section>

        <section class="card">
          <h2>📚 Devoirs à faire</h2>
          ${devoirs.rows.map(d => `<div style="padding:10px;background:#f8fafc;border:1px solid var(--border);border-radius:6px;margin-bottom:8px">
            <strong>${h(d.matiere)}</strong><p style="margin:4px 0">${h(d.description)}</p><small style="color:var(--blue)">Pour le : ${dateFr(d.date_pour)}</small>
          </div>`).join("") || "<p class='muted'>Aucun devoir à rendre.</p>"}
        </section>
      </div>`;

    res.send(layout("Espace Élève", content, req));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur espace élève.");
  }
});

// ADMIN AVEC UPLOAD PHOTO EN BASE64
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [classes, students, photos] = await Promise.all([
      pool.query("SELECT id, nom FROM classes ORDER BY nom"),
      pool.query("SELECT u.id, u.nom, u.prenom, u.code_eleve, c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE' ORDER BY u.id DESC"),
      pool.query("SELECT id, titre, image_data FROM galerie ORDER BY id DESC LIMIT 10")
    ]);

    const classOpts = classes.rows.map(c => `<option value="${c.id}">${h(c.nom)}</option>`).join("");
    const studentOpts = students.rows.map(s => `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} (${h(s.code_eleve)})</option>`).join("");

    const content = `
      <section class="card">
        <h2>⚙️ Panneau de Direction — LEKOL S&amp;H</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px">
          <a class="btn" href="/admin/appel">📝 Prise d'Appel par Classe</a>
        </div>
      </section>

      <div class="grid">
        <section class="card">
          <h2>📤 Importer une Photo dans la Galerie</h2>
          <form method="post" action="/admin/galerie/upload" enctype="multipart/form-data">
            <label>Titre de l'événement / photo</label>
            <input name="titre" required placeholder="Ex. Fête du drapeau, remise des prix...">
            <label>Sélectionner une photo depuis votre appareil (PNG, JPG)</label>
            <input type="file" name="photo" accept="image/*" required style="padding:8px">
            <label>Description (facultative)</label>
            <textarea name="description" placeholder="Courte explication..."></textarea>
            <button style="margin-top:12px" type="submit">📷 Publier la photo sur la Galerie</button>
          </form>
        </section>

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
      </div>

      <div class="grid">
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

        <section class="card">
          <h2>🖼️ Photos Publiées Récentes</h2>
          <div class="tablewrap"><table>
            <thead><tr><th>Aperçu</th><th>Titre</th><th>Action</th></tr></thead>
            <tbody>
              ${photos.rows.map(p => `
                <tr>
                  <td><img src="${p.image_data}" style="width:50px;height:50px;object-fit:cover;border-radius:6px"></td>
                  <td><b>${h(p.titre)}</b></td>
                  <td>
                    <form method="post" action="/admin/galerie/supprimer/${p.id}">
                      ${csrfField(req)}
                      <button class="btn danger" style="padding:4px 8px;font-size:.8rem" type="submit">Supprimer</button>
                    </form>
                  </td>
                </tr>
              `).join("") || "<tr><td colspan='3'>Aucune photo.</td></tr>"}
            </tbody>
          </table></div>
        </section>
      </div>`;

    res.send(layout("Administration", content, req));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur administration.");
  }
});

// ROUTE D'UPLOAD DIRECT DE PHOTO EN BASE64
app.post("/admin/galerie/upload", requireAdmin, async (req, res) => {
  try {
    const titre = String(req.body.titre || "").trim();
    const description = String(req.body.description || "").trim();

    if (!req.files || !req.files.photo) {
      return res.status(400).send("Veuillez choisir un fichier image.");
    }

    const file = req.files.photo;
    const base64Image = `data:${file.mimetype};base64,${file.data.toString("base64")}`;

    await pool.query(
      "INSERT INTO galerie (titre, description, image_data) VALUES ($1, $2, $3)",
      [titre, description, base64Image]
    );

    res.redirect("/galerie");
  } catch (e) {
    console.error("Erreur Upload:", e);
    res.status(500).send("Erreur lors de l'envoi de l'image.");
  }
});

app.post("/admin/galerie/supprimer/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM galerie WHERE id=$1", [Number(req.params.id)]);
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur suppression photo.");
  }
});

app.post("/admin/eleve", requireAdmin, async (req, res) => {
  const { nom, prenom, password, classe_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const code = "S&H-" + crypto.randomInt(1000, 10000);
    await pool.query("INSERT INTO utilisateurs (nom, prenom, code_eleve, mot_de_passe, role, classe_id) VALUES ($1,$2,$3,$4,'ELEVE',$5)", [String(nom).trim(), String(prenom).trim(), code, hash, Number(classe_id)]);
    res.redirect("/admin");
  } catch (e) { console.error(e); res.status(500).send("Erreur ajout élève."); }
});

app.post("/admin/note", requireAdmin, async (req, res) => {
  const { eleve_id, matiere, note, periode } = req.body;
  try {
    await pool.query("INSERT INTO notes (eleve_id, matiere, note, periode) VALUES ($1,$2,$3,$4)", [Number(eleve_id), String(matiere).trim(), Number(note), String(periode).trim()]);
    res.redirect("/admin");
  } catch (e) { console.error(e); res.status(500).send("Erreur ajout note."); }
});

app.get("/admin/appel", requireAdmin, async (req, res) => {
  const classeId = Number(req.query.classe_id);
  const dateAppel = String(req.query.date || today());
  try {
    const classes = await pool.query("SELECT id, nom FROM classes ORDER BY nom");
    const classOpts = classes.rows.map(c => `<option value="${c.id}" ${c.id === classeId ? "selected" : ""}>${h(c.nom)}</option>`).join("");
    let studentRows = "";
    if (classeId) {
      const students = await pool.query("SELECT id, nom, prenom FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom", [classeId]);
      studentRows = students.rows.map(s => `<tr><td><b>${h(s.nom)} ${h(s.prenom)}</b></td><td>
        <label style="margin-right:10px"><input type="radio" name="statut_${s.id}" value="PRESENT" checked> Présent</label>
        <label style="margin-right:10px"><input type="radio" name="statut_${s.id}" value="ABSENT"> Absent</label>
        <label><input type="radio" name="statut_${s.id}" value="RETARD"> Retard</label>
      </td></tr>`).join("");
    }
    const content = `<section class="card"><h2>📝 Appel par Classe</h2>
      <form method="get" action="/admin/appel">
        <select name="classe_id" onchange="this.form.submit()"><option value="">Sélectionner une classe</option>${classOpts}</select>
      </form>
      ${classeId ? `<form method="post" action="/admin/appel/valider">${csrfField(req)}<input type="hidden" name="classe_id" value="${classeId}"><input type="hidden" name="date_presence" value="${dateAppel}"><table>${studentRows}</table><button style="margin-top:10px" type="submit">Enregistrer l'Appel</button></form>` : ""}
    </section>`;
    res.send(layout("Prise d'Appel", content, req));
  } catch (e) { console.error(e); res.status(500).send("Erreur appel."); }
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
    res.redirect(`/admin/appel?classe_id=${classe_id}&date=${date_presence}`);
  } catch (e) { console.error(e); res.status(500).send("Erreur validation appel."); }
});

app.use((req, res) => res.status(404).send("Page introuvable."));

async function start() {
  try {
    await pool.query("SELECT 1");
    app.listen(port, () => console.log(`🚀 LEKOL S&H en ligne sur le port ${port}`));
  } catch (e) {
    console.error("❌ Erreur PG:", e.message);
    process.exit(1);
  }
}

start();
