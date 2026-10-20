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
app.use(express.urlencoded({ extended: false, limit: "30kb" }));
app.use(express.json({ limit: "30kb" }));

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
  value ? new Date(value).toLocaleDateString("fr-FR") : "—";

const today = () => new Date().toISOString().slice(0, 10);

const page = (title, body) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0f172a">
<title>${h(title)} — LEKOL S&amp;H</title>
<style>
:root{--navy:#0f172a;--blue:#2563eb;--light-bg:#f8fafc;--card-bg:#ffffff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--success:#16a34a;--danger:#dc2626;--warning:#d97706}
*{box-sizing:border-box}
body{margin:0;background:var(--light-bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,sans-serif}
header{background:linear-gradient(135deg,#0f172a,#1e3a8a);color:white;padding:20px 16px;box-shadow:0 4px 12px #0001}
.head{max-width:1200px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}
.brand{font-size:1.4rem;font-weight:800;letter-spacing:.03em;color:#fff}
.sub{opacity:.85;font-size:.88rem;font-weight:400}
nav{background:#0f172a;padding:10px 16px;display:flex;gap:15px;justify-content:center;flex-wrap:wrap;border-top:1px solid #1e293b}
nav a{color:#cbd5e1;text-decoration:none;font-weight:600;font-size:.92rem;padding:6px 12px;border-radius:6px;transition:.2s}
nav a:hover{color:#fff;background:#1e293b}
main{max-width:1200px;margin:24px auto;padding:0 16px}
.narrow{max-width:440px}
.card{background:var(--card-bg);border:1px solid var(--line);border-radius:12px;padding:22px;margin-bottom:20px;box-shadow:0 2px 8px #0000000a}
h2{font-size:1.25rem;color:var(--navy);margin:0 0 16px;display:flex;align-items:center;gap:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.stat{padding:18px;background:#fff;border:1px solid var(--line);border-radius:10px;border-left:4px solid var(--blue)}
.stat strong{font-size:1.75rem;color:var(--navy);display:block;line-height:1.2}
label{display:block;font-weight:650;font-size:.88rem;margin:12px 0 4px;color:#334155}
input,select,textarea{width:100%;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font:inherit;color:var(--ink);transition:.15s}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px #2563eb22}
textarea{min-height:90px;resize:vertical}
.btn,button{display:inline-flex;align-items:center;justify-content:center;gap:6px;background:var(--blue);color:white;border:0;border-radius:8px;padding:10px 16px;font:inherit;font-weight:650;text-decoration:none;cursor:pointer;transition:.15s}
.btn:hover,button:hover{opacity:.92;transform:translateY(-1px)}
.btn.secondary{background:#f1f5f9;color:#334155;border:1px solid var(--line)}
.btn.danger{background:var(--danger)}
.btn.full{width:100%}
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px;margin-top:12px}
table{border-collapse:collapse;width:100%;background:white;font-size:.9rem}
th,td{text-align:left;border-bottom:1px solid var(--line);padding:12px;vertical-align:middle}
th{background:#f8fafc;color:#475569;font-weight:700}
.badge{display:inline-block;padding:3px 8px;border-radius:99px;font-size:.78rem;font-weight:700;text-transform:uppercase}
.badge.success{background:#dcfce7;color:#15803d}
.badge.danger{background:#fee2e2;color:#b91c1c}
.badge.warning{background:#fef3c7;color:#b45309}
.tabs{display:flex;gap:8px;border-bottom:2px solid var(--line);margin-bottom:20px;overflow-x:auto;padding-bottom:4px}
.tab-btn{background:none;border:none;padding:10px 16px;font-weight:650;color:var(--muted);cursor:pointer;border-radius:6px;white-space:nowrap}
.tab-btn.active{background:#e0e7ff;color:var(--navy)}
.tab-content{display:none}
.tab-content.active{display:block}
.footer{text-align:center;color:var(--muted);padding:30px 16px;font-size:.85rem}
@media(max-width:640px){.card{padding:16px}th,td{padding:9px;font-size:.82rem}}
</style>
</head>
<body>
<header><div class="head">
<div><div class="brand">🏫 LEKOL S&amp;H</div>
<div class="sub">École Communautaire &amp; Gratuite d'Excellence</div></div>
${body.includes("data-user") ? "<span class='badge success'>Connecté</span>" : ""}
</div></header>
<nav><a href="/">Accueil &amp; Galerie</a><a href="/connexion">Connexion</a>
${body.includes("data-user") ? '<a href="/deconnexion">Déconnexion</a>' : ""}
</nav>
<main>${body}</main>
<div class="footer">© ${new Date().getFullYear()} LEKOL S&amp;H — Éducation Gratuite pour Tous</div>
</body></html>`;

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!rolesAdmin.includes(req.session.user.role)) {
    return res.status(403).send(page("Accès refusé",
      "<section class='card'><h2>Accès refusé</h2><p>Droits insuffisants.</p><a class='btn' href='/'>Retour</a></section>"));
  }
  next();
}

function requireStudent(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!["ELEVE", "PARENT"].includes(req.session.user.role)) {
    return res.status(403).send("Accès réservé aux élèves et parents.");
  }
  next();
}

function csrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
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
      return res.status(403).send(page("Formulaire expiré",
        "<section class='card'><h2>Formulaire expiré</h2><p>Veuillez réessayer.</p><a class='btn' href='/'>Accueil</a></section>"));
    }
  }
  next();
});

// ACCUEIL & GALERIE
app.get("/", async (req, res) => {
  try {
    const [annonces, galeries] = await Promise.all([
      pool.query("SELECT titre,contenu,date_publication FROM annonces ORDER BY date_publication DESC LIMIT 10"),
      pool.query("SELECT titre,description,image_url FROM galerie ORDER BY id DESC LIMIT 12")
    ]);

    const listAnnonces = annonces.rows.length ? annonces.rows.map(a => `
      <article style="padding:14px;background:#f8fafc;border-left:4px solid var(--blue);border-radius:6px;margin-bottom:12px">
        <h3 style="margin:0 0 6px;color:var(--navy)">${h(a.titre)}</h3>
        <p style="margin:0 0 8px">${h(a.contenu).replace(/\n/g, "<br>")}</p>
        <small style="color:var(--muted)">Publié le ${dateFr(a.date_publication)}</small>
      </article>`).join("") : "<p class='muted'>Aucune annonce publique.</p>";

    const listGalerie = galeries.rows.length ? galeries.rows.map(g => `
      <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff">
        <img src="${h(g.image_url)}" alt="${h(g.titre)}" style="width:100%;height:160px;object-fit:cover">
        <div style="padding:12px">
          <strong style="display:block;color:var(--navy)">${h(g.titre)}</strong>
          <small style="color:var(--muted)">${h(g.description || "")}</small>
        </div>
      </div>`).join("") : "<p class='muted'>Aucune photo récente.</p>";

    const welcome = req.session.user
      ? `<section class="card"><h2>Bonjour ${h(req.session.user.prenom || "")} 👋</h2>
         <a class="btn" href="${rolesAdmin.includes(req.session.user.role) ? "/admin" : "/espace-eleve"}">Accéder à mon espace</a></section>`
      : `<section class="card"><h2>🔑 Espace Élèves / Parents</h2>
         <p>Accédez au suivi des notes, devoirs, discipline et emplois du temps.</p>
         <a class="btn full" href="/connexion">Se connecter</a></section>`;

    res.send(page("Accueil", `
      ${welcome}
      <section class="card"><h2>📢 Annonces de l'école</h2>${listAnnonces}</section>
      <section class="card"><h2>📸 Galerie &amp; Activités de l'école</h2>
        <div class="grid">${listGalerie}</div>
      </section>
    `));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur serveur lors du chargement de l'accueil.");
  }
});

// CONNEXION
app.get("/connexion", (req, res) => {
  if (req.session.user) {
    return res.redirect(rolesAdmin.includes(req.session.user.role) ? "/admin" : "/espace-eleve");
  }
  res.send(page("Connexion", `<section class="card narrow" style="margin:40px auto">
    <h2>Connexion à LEKOL S&amp;H</h2>
    <p style="color:var(--muted);font-size:.9rem">Entre ton email ou ton code élève (ex: S&amp;H-1234).</p>
    <form method="post" action="/connexion">${csrfField(req)}
    <label>Identifiant</label><input name="identifiant" required placeholder="Email ou S&amp;H-XXXX">
    <label>Mot de passe</label><input type="password" name="password" required placeholder="••••••••">
    <button class="full" style="margin-top:15px" type="submit">Se connecter</button></form></section>`));
});

app.post("/connexion", loginLimiter, async (req, res) => {
  const identifiant = String(req.body.identifiant || "").trim();
  const password = String(req.body.password || "");

  try {
    const result = await pool.query(
      "SELECT * FROM utilisateurs WHERE lower(email)=lower($1) OR code_eleve=$1 LIMIT 1",
      [identifiant]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.mot_de_passe).catch(() => user.mot_de_passe === password))) {
      return res.status(401).send(page("Connexion", "<section class='card'><h2>Identifiant ou mot de passe incorrect.</h2><a class='btn' href='/connexion'>Réessayer</a></section>"));
    }

    req.session.user = { id: user.id, nom: user.nom, prenom: user.prenom, role: user.role, classe_id: user.classe_id };
    res.redirect(rolesAdmin.includes(user.role) ? "/admin" : "/espace-eleve");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur de connexion.");
  }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => { res.clearCookie("lekolsid"); res.redirect("/"); });
});

// ESPACE ÉLÈVE & PARENT
app.get("/espace-eleve", requireStudent, async (req, res) => {
  const id = req.session.user.id;
  try {
    const er = await pool.query(`
      SELECT u.id,u.nom,u.prenom,u.code_eleve,u.email,u.classe_id,c.nom AS nom_classe
      FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.id=$1`, [id]);

    const student = er.rows[0];

    const [pr, dr, nr, mr, hr, disc, liais] = await Promise.all([
      pool.query("SELECT statut,date_presence,remarque FROM presences WHERE eleve_id=$1 ORDER BY date_presence DESC LIMIT 50", [id]),
      student.classe_id ? pool.query("SELECT matiere,description,date_pour FROM devoirs WHERE classe_id=$1 ORDER BY date_pour ASC LIMIT 30", [student.classe_id]) : Promise.resolve({ rows: [] }),
      pool.query("SELECT matiere,note,periode,date_saisie FROM notes WHERE eleve_id=$1 ORDER BY date_saisie DESC LIMIT 50", [id]),
      pool.query("SELECT sujet,contenu,date_envoi FROM messages WHERE destinataire_id=$1 ORDER BY date_envoi DESC LIMIT 30", [id]),
      student.classe_id ? pool.query("SELECT jour,creneau,titre,description FROM horaires WHERE classe_id=$1 ORDER BY id ASC", [student.classe_id]) : Promise.resolve({ rows: [] }),
      pool.query("SELECT type_remarque,motif,date_remarque FROM discipline WHERE eleve_id=$1 ORDER BY date_remarque DESC", [id]),
      pool.query("SELECT sujet,message,statut,date_envoi FROM liaison WHERE eleve_id=$1 ORDER BY date_envoi DESC", [id])
    ]);

    const totalNotes = nr.rows.reduce((acc, curr) => acc + Number(curr.note || 0), 0);
    const moyenne = nr.rows.length ? (totalNotes / nr.rows.length).toFixed(1) : "—";

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>👋 Espace Élève — ${h(student.prenom)} ${h(student.nom)}</h2>
        <p>Code élève : <b style="color:var(--blue)">${h(student.code_eleve || "—")}</b> · Classe : <b>${h(student.nom_classe || "Non assignée")}</b></p>
      </section>

      <div class="grid">
        <div class="stat"><strong>${moyenne}${moyenne !== "—" ? " / 100" : ""}</strong>Moyenne Générale</div>
        <div class="stat"><strong>${pr.rows.filter(p => p.statut === 'PRESENT').length}</strong>Présences</div>
        <div class="stat"><strong>${pr.rows.filter(p => p.statut === 'ABSENT').length}</strong>Absences</div>
        <div class="stat"><strong>${disc.rows.length}</strong>Remarques Discipline</div>
      </div>

      <br>
      <div class="tabs">
        <button class="tab-btn active" onclick="openTab('t-notes', this)">📊 Notes</button>
        <button class="tab-btn" onclick="openTab('t-devoirs', this)">📚 Devoirs</button>
        <button class="tab-btn" onclick="openTab('t-discipline', this)">⭐ Discipline &amp; Remarques</button>
        <button class="tab-btn" onclick="openTab('t-liaison', this)">📝 Cahier de Liaison / RDV</button>
        <button class="tab-btn" onclick="openTab('t-horaires', this)">⏰ Emploi du temps</button>
        <button class="tab-btn" onclick="openTab('t-messages', this)">✉️ Messages</button>
      </div>

      <div id="t-notes" class="tab-content active"><section class="card">
        <h2>📊 Notes &amp; Évaluations</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Matière</th><th>Note</th><th>Période</th><th>Date</th></tr></thead>
          <tbody>${nr.rows.map(n => `<tr><td><b>${h(n.matiere)}</b></td><td><strong style="color:var(--blue)">${h(n.note)} / 100</strong></td><td>${h(n.periode)}</td><td>${dateFr(n.date_saisie)}</td></tr>`).join("") || "<tr><td colspan='4'>Aucune note disponible.</td></tr>"}</tbody>
        </table></div>
      </section></div>

      <div id="t-devoirs" class="tab-content"><section class="card">
        <h2>📚 Devoirs et Cahier de Textes</h2>
        ${dr.rows.map(d => `<div style="padding:12px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;margin-bottom:10px">
          <strong style="color:var(--navy)">${h(d.matiere)}</strong><p style="margin:4px 0">${h(d.description)}</p>
          <small style="color:var(--blue);font-weight:600">📅 Pour le : ${dateFr(d.date_pour)}</small>
        </div>`).join("") || "<p class='muted'>Aucun devoir à rendre.</p>"}
      </section></div>

      <div id="t-discipline" class="tab-content"><section class="card">
        <h2>⭐ Suivi Disciplinaire &amp; Mentions</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Type</th><th>Motif</th><th>Date</th></tr></thead>
          <tbody>${disc.rows.map(d => `<tr><td><span class="badge ${d.type_remarque === 'FÉLICITATIONS' ? 'success' : 'danger'}">${h(d.type_remarque)}</span></td><td>${h(d.motif)}</td><td>${dateFr(d.date_remarque)}</td></tr>`).join("") || "<tr><td colspan='3'>Aucune remarque disciplinaire. Compte exemplaire !</td></tr>"}</tbody>
        </table></div>
      </section></div>

      <div id="t-liaison" class="tab-content"><section class="card">
        <h2>📝 Contacter la Direction / Demander un RDV</h2>
        <form method="post" action="/espace-eleve/liaison">${csrfField(req)}
          <label>Sujet de la demande</label><input name="sujet" required placeholder="Ex. Motif d'absence, Demande de RDV">
          <label>Message / Explication</label><textarea name="message" required></textarea>
          <button style="margin-top:10px" type="submit">Envoyer au bureau d'administration</button>
        </form>
        <h3 style="margin-top:20px">Mes demandes envoyées</h3>
        ${liais.rows.map(l => `<div style="padding:10px;background:#f1f5f9;border-radius:6px;margin-bottom:8px">
          <strong>${h(l.sujet)}</strong> <span class="badge warning">${h(l.statut)}</span>
          <p style="margin:4px 0">${h(l.message)}</p>
        </div>`).join("") || "<p class='muted'>Aucun message envoyé.</p>"}
      </section></div>

      <div id="t-horaires" class="tab-content"><section class="card">
        <h2>⏰ Emploi du Temps</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Jour</th><th>Matière &amp; Cours</th></tr></thead>
          <tbody>${hr.rows.map(h_item => `<tr><td><b>${h(h_item.jour)}</b><br><small>${h(h_item.creneau)}</small></td><td><b>${h(h_item.titre)}</b><br><small>${h(h_item.description || "")}</small></td></tr>`).join("") || "<tr><td colspan='2'>Pas d'horaire affiché.</td></tr>"}</tbody>
        </table></div>
      </section></div>

      <div id="t-messages" class="tab-content"><section class="card">
        <h2>✉️ Messages reçus</h2>
        ${mr.rows.map(m => `<div style="padding:12px;background:#eff6ff;border-radius:8px;margin-bottom:10px">
          <strong>${h(m.sujet)}</strong><p style="margin:4px 0">${h(m.contenu)}</p><small>${dateFr(m.date_envoi)}</small>
        </div>`).join("") || "<p class='muted'>Aucun message.</p>"}
      </section></div>

      <script>
      function openTab(id, btn) {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        btn.classList.add('active');
      }
      </script>`;

    res.send(page("Espace élève", body));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement espace élève.");
  }
});

app.post("/espace-eleve/liaison", requireStudent, async (req, res) => {
  const { sujet, message } = req.body;
  try {
    await pool.query("INSERT INTO liaison (eleve_id, sujet, message) VALUES ($1, $2, $3)", [req.session.user.id, String(sujet).trim(), String(message).trim()]);
    res.redirect("/espace-eleve");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur envoi liaison.");
  }
});

// ADMIN
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [classes, students, liaisons] = await Promise.all([
      pool.query("SELECT id,nom,niveau FROM classes ORDER BY nom"),
      pool.query("SELECT u.id,u.nom,u.prenom,u.code_eleve,c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE' ORDER BY u.id DESC"),
      pool.query("SELECT l.id,l.sujet,l.message,l.date_envoi,u.nom,u.prenom FROM liaison l JOIN utilisateurs u ON u.id=l.eleve_id ORDER BY l.id DESC LIMIT 20")
    ]);

    const classOptions = classes.rows.map(c => `<option value="${c.id}">${h(c.nom)} (${h(c.niveau || "")})</option>`).join("");
    const studentOptions = students.rows.map(s => `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} — ${h(s.code_eleve)} (${h(s.nom_classe || "Sans classe")})</option>`).join("");

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>⚙️ Administration LEKOL S&amp;H</h2>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <a class="btn" href="/admin/appel">📝 Prise d'Appel par Classe</a>
          <a class="btn secondary" href="/admin/horaires">⏰ Emplois du Temps</a>
        </div>
      </section>

      <div class="tabs">
        <button class="tab-btn active" onclick="openTab('a-eleves', this)">👩‍🎓 Élèves</button>
        <button class="tab-btn" onclick="openTab('a-notes', this)">📊 Notes</button>
        <button class="tab-btn" onclick="openTab('a-discipline', this)">⭐ Discipline</button>
        <button class="tab-btn" onclick="openTab('a-galerie', this)">📸 Galerie Photos</button>
        <button class="tab-btn" onclick="openTab('a-liaison', this)">📬 Demandes Parents (${liaisons.rows.length})</button>
      </div>

      <div id="a-eleves" class="tab-content active">
        <section class="card">
          <h2>➕ Inscrire un élève</h2>
          <form method="post" action="/admin/eleve">${csrfField(req)}
            <div class="grid">
              <div><label>Nom</label><input name="nom" required></div>
              <div><label>Prénom</label><input name="prenom" required></div>
            </div>
            <label>Classe</label><select name="classe_id" required><option value="">Choisir</option>${classOptions}</select>
            <label>Mot de passe initial</label><input type="password" name="password" required value="ecole2026">
            <button style="margin-top:10px" type="submit">Inscrire Élève &amp; Générer Code S&amp;H</button>
          </form>
        </section>
      </div>

      <div id="a-notes" class="tab-content">
        <section class="card">
          <h2>📊 Saisir une Note</h2>
          <form method="post" action="/admin/note">${csrfField(req)}
            <label>Élève</label><select name="eleve_id" required><option value="">Choisir</option>${studentOptions}</select>
            <label>Matière</label><input name="matiere" required placeholder="Ex. Mathématiques">
            <label>Note sur 100</label><input type="number" name="note" min="0" max="100" required>
            <label>Période</label><input name="periode" required placeholder="Ex. 1er Contrôle">
            <button style="margin-top:10px" type="submit">Enregistrer la note</button>
          </form>
        </section>
      </div>

      <div id="a-discipline" class="tab-content">
        <section class="card">
          <h2>⭐ Ajouter un Avertissement / Une Mention</h2>
          <form method="post" action="/admin/discipline">${csrfField(req)}
            <label>Élève</label><select name="eleve_id" required><option value="">Choisir</option>${studentOptions}</select>
            <label>Type</label>
            <select name="type_remarque" required>
              <option value="FÉLICITATIONS">Félicitations / Tableau d'Honneur</option>
              <option value="AVERTISSEMENT">Avertissement Discipline</option>
              <option value="BLÂME">Blâme</option>
            </select>
            <label>Motif / Détails</label><textarea name="motif" required></textarea>
            <button style="margin-top:10px" type="submit">Enregistrer au dossier disciplinaire</button>
          </form>
        </section>
      </div>

      <div id="a-galerie" class="tab-content">
        <section class="card">
          <h2>📸 Ajouter une photo à la Galerie</h2>
          <form method="post" action="/admin/galerie">${csrfField(req)}
            <label>Titre de l'événement</label><input name="titre" required placeholder="Ex. Journée du Drapeau">
            <label>Lien URL de l'image</label><input name="image_url" required placeholder="https://...">
            <label>Description</label><textarea name="description"></textarea>
            <button style="margin-top:10px" type="submit">Publier sur la Galerie</button>
          </form>
        </section>
      </div>

      <div id="a-liaison" class="tab-content">
        <section class="card">
          <h2>📬 Demandes &amp; Carnet de liaison des parents</h2>
          ${liaisons.rows.map(l => `<div style="padding:12px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;margin-bottom:10px">
            <strong>${h(l.prenom)} ${h(l.nom)}</strong> — <i>${h(l.sujet)}</i>
            <p style="margin:4px 0">${h(l.message)}</p>
            <small>${dateFr(l.date_envoi)}</small>
          </div>`).join("") || "<p class='muted'>Aucun message reçu.</p>"}
        </section>
      </div>

      <script>
      function openTab(id, btn) {
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        btn.classList.add('active');
      }
      </script>`;

    res.send(page("Administration", body));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur admin.");
  }
});

// ACTIONS POST ADMIN
app.post("/admin/eleve", requireAdmin, async (req, res) => {
  const { nom, prenom, password, classe_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const code = "S&H-" + crypto.randomInt(1000, 10000);
    await pool.query("INSERT INTO utilisateurs (nom,prenom,code_eleve,mot_de_passe,role,classe_id) VALUES ($1,$2,$3,$4,'ELEVE',$5)", [String(nom).trim(), String(prenom).trim(), code, hash, Number(classe_id)]);
    res.redirect("/admin");
  } catch (e) { console.error(e); res.status(500).send("Erreur ajout élève."); }
});

app.post("/admin/note", requireAdmin, async (req, res) => {
  const { eleve_id, matiere, note, periode } = req.body;
  try {
    await pool.query("INSERT INTO notes (eleve_id,matiere,note,periode) VALUES ($1,$2,$3,$4)", [Number(eleve_id), String(matiere).trim(), Number(note), String(periode).trim()]);
    res.redirect("/admin");
  } catch (e) { console.error(e); res.status(500).send("Erreur ajout note."); }
});

app.post("/admin/discipline", requireAdmin, async (req, res) => {
  const { eleve_id, type_remarque, motif } = req.body;
  try {
    await pool.query("INSERT INTO discipline (eleve_id, type_remarque, motif) VALUES ($1,$2,$3)", [Number(eleve_id), String(type_remarque).trim(), String(motif).trim()]);
    res.redirect("/admin");
  } catch (e) { console.error(e); res.status(500).send("Erreur ajout discipline."); }
});

app.post("/admin/galerie", requireAdmin, async (req, res) => {
  const { titre, image_url, description } = req.body;
  try {
    await pool.query("INSERT INTO galerie (titre, image_url, description) VALUES ($1,$2,$3)", [String(titre).trim(), String(image_url).trim(), String(description).trim()]);
    res.redirect("/admin");
  } catch (e) { console.error(e); res.status(500).send("Erreur ajout galerie."); }
});

// ROUTE APPEL
app.get("/admin/appel", requireAdmin, async (req, res) => {
  const classeId = Number(req.query.classe_id);
  const dateAppel = String(req.query.date || today());
  try {
    const classes = await pool.query("SELECT id, nom, niveau FROM classes ORDER BY nom");
    const classOptions = classes.rows.map(c => `<option value="${c.id}" ${c.id === classeId ? "selected" : ""}>${h(c.nom)} (${h(c.niveau || "")})</option>`).join("");
    let studentRows = "";
    if (classeId) {
      const students = await pool.query("SELECT id, nom, prenom, code_eleve FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom", [classeId]);
      studentRows = students.rows.map(s => `<tr><td><b>${h(s.nom)} ${h(s.prenom)}</b></td><td>
        <label style="margin-right:10px"><input type="radio" name="statut_${s.id}" value="PRESENT" checked> Présent</label>
        <label style="margin-right:10px"><input type="radio" name="statut_${s.id}" value="ABSENT"> Absent</label>
        <label><input type="radio" name="statut_${s.id}" value="RETARD"> Retard</label>
      </td></tr>`).join("");
    }
    res.send(page("Prise d'appel", `<section class="card"><h2>📝 Appel par classe</h2><p><a class="btn secondary" href="/admin">← Retour</a></p>
      <form method="get" action="/admin/appel">
        <select name="classe_id" onchange="this.form.submit()"><option value="">Choisir classe</option>${classOptions}</select>
      </form>
      ${classeId ? `<form method="post" action="/admin/appel/valider">${csrfField(req)}<input type="hidden" name="classe_id" value="${classeId}"><input type="hidden" name="date_presence" value="${dateAppel}"><table>${studentRows}</table><button style="margin-top:10px" type="submit">Valider</button></form>` : ""}
    </section>`));
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
  } catch (e) { console.error(e); res.status(500).send("Erreur appel."); }
});

// HORAIRES
app.get("/admin/horaires", requireAdmin, async (req, res) => {
  try {
    const classes = await pool.query("SELECT id, nom FROM classes ORDER BY nom");
    const classOptions = classes.rows.map(c => `<option value="${c.id}">${h(c.nom)}</option>`).join("");
    res.send(page("Emplois du temps", `<section class="card"><h2>⏰ Horaires</h2><p><a class="btn secondary" href="/admin">← Retour</a></p>
      <form method="post" action="/admin/horaires">${csrfField(req)}
        <select name="classe_id" required><option value="">Choisir la classe</option>${classOptions}</select>
        <select name="jour" required><option value="Lundi">Lundi</option><option value="Mardi">Mardi</option><option value="Mercredi">Mercredi</option><option value="Jeudi">Jeudi</option><option value="Vendredi">Vendredi</option></select>
        <input name="creneau" required placeholder="08:00 - 09:30">
        <input name="titre" required placeholder="Matière">
        <input name="description" placeholder="Professeur / Salle">
        <button style="margin-top:10px" type="submit">Ajouter Horaire</button>
      </form>
    </section>`));
  } catch (e) { console.error(e); res.status(500).send("Erreur horaires."); }
});

app.post("/admin/horaires", requireAdmin, async (req, res) => {
  const { classe_id, titre, description, jour, creneau } = req.body;
  try {
    await pool.query("INSERT INTO horaires (classe_id, titre, description, jour, creneau) VALUES ($1,$2,$3,$4,$5)", [Number(classe_id), String(titre).trim(), String(description).trim(), String(jour).trim(), String(creneau).trim()]);
    res.redirect("/admin/horaires");
  } catch (e) { console.error(e); res.status(500).send("Erreur ajout horaire."); }
});

app.use((req, res) => { res.status(404).send("Page introuvable."); });

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
