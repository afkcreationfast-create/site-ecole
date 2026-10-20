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
  value ? new Date(value).toLocaleDateString("fr-FR", { day: 'numeric', month: 'long', year: 'numeric' }) : "—";

const today = () => new Date().toISOString().slice(0, 10);

const page = (title, body) => `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0f172a">
<title>${h(title)} — LEKOL S&amp;H</title>
<style>
:root{--navy:#0f172a;--blue:#2563eb;--gold:#f59e0b;--light-bg:#f1f5f9;--card-bg:#ffffff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--success:#16a34a;--danger:#dc2626}
*{box-sizing:border-box}
body{margin:0;background:var(--light-bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}

/* HEADER VIVANT & HERO */
header{background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#2563eb 100%);color:white;padding:25px 16px;box-shadow:0 4px 20px #0002}
.head{max-width:1200px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}
.brand{font-size:1.6rem;font-weight:900;letter-spacing:.03em;color:#fff;display:flex;align-items:center;gap:10px}
.sub{opacity:.9;font-size:.9rem;font-weight:400;margin-top:2px}

/* NAVIGATION */
nav{background:#0f172a;padding:12px 16px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;border-top:1px solid #1e293b;sticky:top}
nav a{color:#cbd5e1;text-decoration:none;font-weight:650;font-size:.92rem;padding:8px 14px;border-radius:8px;transition:.2s}
nav a:hover{color:#fff;background:#1e293b}

/* CONTENU PRINCIPAL */
main{max-width:1200px;margin:24px auto;padding:0 16px}
.hero{background:linear-gradient(rgba(15,23,42,0.85),rgba(30,58,138,0.85)), url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80') center/cover;color:white;padding:40px 24px;border-radius:16px;margin-bottom:24px;text-align:center}
.hero h1{font-size:2rem;margin:0 0 10px;font-weight:800}
.hero p{font-size:1.1rem;opacity:.95;max-width:700px;margin:0 auto 20px}

/* CARTE ET GRILLE */
.card{background:var(--card-bg);border:1px solid var(--line);border-radius:14px;padding:24px;margin-bottom:22px;box-shadow:0 4px 12px #00000008}
h2{font-size:1.3rem;color:var(--navy);margin:0 0 16px;display:flex;align-items:center;gap:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
.stat{padding:20px;background:#fff;border:1px solid var(--line);border-radius:12px;border-top:4px solid var(--blue);box-shadow:0 2px 6px #00000005}
.stat strong{font-size:2rem;color:var(--navy);display:block;line-height:1.2}

/* FORMULAIRES & BOUTONS */
label{display:block;font-weight:650;font-size:.88rem;margin:12px 0 4px;color:#334155}
input,select,textarea{width:100%;padding:11px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font:inherit;color:var(--ink);transition:.15s}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 3px #2563eb22}
textarea{min-height:95px;resize:vertical}
.btn,button{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--blue);color:white;border:0;border-radius:8px;padding:11px 18px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer;transition:.2s;box-shadow:0 2px 6px #2563eb33}
.btn:hover,button:hover{opacity:.95;transform:translateY(-2px)}
.btn.gold{background:var(--gold);color:#0f172a;box-shadow:0 2px 6px #f59e0b33}
.btn.secondary{background:#f1f5f9;color:#334155;border:1px solid var(--line);box-shadow:none}
.btn.danger{background:var(--danger)}
.btn.full{width:100%}

/* TAB & BULLETINS */
.tablewrap{overflow-x:auto;border:1px solid var(--line);border-radius:10px;margin-top:12px}
table{border-collapse:collapse;width:100%;background:white;font-size:.92rem}
th,td{text-align:left;border-bottom:1px solid var(--line);padding:13px;vertical-align:middle}
th{background:#f8fafc;color:#475569;font-weight:700}
.badge{display:inline-block;padding:4px 10px;border-radius:99px;font-size:.78rem;font-weight:700;text-transform:uppercase}
.badge.success{background:#dcfce7;color:#15803d}
.badge.danger{background:#fee2e2;color:#b91c1c}
.badge.warning{background:#fef3c7;color:#b45309}

.tabs{display:flex;gap:10px;border-bottom:2px solid var(--line);margin-bottom:20px;overflow-x:auto;padding-bottom:6px}
.tab-btn{background:none;border:none;padding:10px 18px;font-weight:700;color:var(--muted);cursor:pointer;border-radius:8px;white-space:nowrap;transition:.2s}
.tab-btn.active{background:#2563eb;color:white}
.tab-content{display:none}
.tab-content.active{display:block}

.footer{background:#0f172a;color:#cbd5e1;text-align:center;padding:35px 16px;margin-top:50px;font-size:.9rem;border-top:4px solid var(--gold)}
@media(max-width:640px){.hero{padding:25px 16px}.hero h1{font-size:1.5rem}.card{padding:18px}}
</style>
</head>
<body>
<header><div class="head">
<div><div class="brand">🎓 LEKOL S&amp;H</div>
<div class="sub">Inscrivez votre enfant vers l'Excellence — 100% Gratuit</div></div>
${body.includes("data-user") ? "<span class='badge success'>Session Active</span>" : ""}
</div></header>
<nav>
<a href="/">🏠 Accueil &amp; Vie Scolaire</a>
<a href="/connexion">🔑 Connexion</a>
${body.includes("data-user") ? '<a href="/deconnexion">🚪 Déconnexion</a>' : ""}
</nav>
<main>${body}</main>
<div class="footer">
  <strong style="color:white;font-size:1.1rem;display:block;margin-bottom:6px">Collège / École Modèle LEKOL S&amp;H</strong>
  <p style="margin:0 0 10px;opacity:.8">Éducation d'Excellence · Discipline · Valeurs républicaines</p>
  <small style="opacity:.6">© ${new Date().getFullYear()} LEKOL S&amp;H — Tous droits réservés</small>
</div>
</body></html>`;

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!rolesAdmin.includes(req.session.user.role)) {
    return res.status(403).send(page("Accès refusé",
      "<section class='card'><h2>Accès refusé</h2><p>Réservé à la direction et aux enseignants.</p><a class='btn' href='/'>Retour</a></section>"));
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
        "<section class='card'><h2>Session expirée</h2><p>Veuillez rafraîchir la page.</p><a class='btn' href='/'>Accueil</a></section>"));
    }
  }
  next();
});

// PAGE D'ACCUEIL VIVANTE ET DYNAMIQUE
app.get("/", async (req, res) => {
  try {
    const [annonces, galeries, evts, honeur] = await Promise.all([
      pool.query("SELECT titre,contenu,date_publication FROM annonces ORDER BY date_publication DESC LIMIT 5"),
      pool.query("SELECT titre,description,image_url FROM galerie ORDER BY id DESC LIMIT 6"),
      pool.query("SELECT titre,date_evenement,heure,lieu,description FROM evenements WHERE date_evenement >= CURRENT_DATE ORDER BY date_evenement ASC LIMIT 4"),
      pool.query("SELECT d.type_remarque, d.motif, u.nom, u.prenom, c.nom AS classe FROM discipline d JOIN utilisateurs u ON u.id=d.eleve_id LEFT JOIN classes c ON c.id=u.classe_id WHERE d.type_remarque='FÉLICITATIONS' ORDER BY d.id DESC LIMIT 4")
    ]);

    const listAnnonces = annonces.rows.length ? annonces.rows.map(a => `
      <article style="padding:16px;background:#f8fafc;border-left:5px solid var(--blue);border-radius:8px;margin-bottom:14px">
        <h3 style="margin:0 0 6px;color:var(--navy);font-size:1.1rem">${h(a.titre)}</h3>
        <p style="margin:0 0 8px">${h(a.contenu).replace(/\n/g, "<br>")}</p>
        <small style="color:var(--muted);font-weight:600">📅 Publié le ${dateFr(a.date_publication)}</small>
      </article>`).join("") : "<p class='muted'>Aucune annonce récente.</p>";

    const listEvts = evts.rows.length ? evts.rows.map(e => `
      <div style="padding:14px;background:#fff;border:1px solid var(--line);border-radius:10px;display:flex;gap:15px;align-items:center">
        <div style="background:var(--blue);color:white;padding:10px 14px;border-radius:8px;text-align:center;min-width:70px">
          <strong style="font-size:1.2rem;display:block;line-height:1">${new Date(e.date_evenement).getDate()}</strong>
          <small style="font-size:.75rem;text-transform:uppercase">${new Date(e.date_evenement).toLocaleDateString("fr-FR",{month:'short'})}</small>
        </div>
        <div>
          <strong style="color:var(--navy);display:block;font-size:1rem">${h(e.titre)}</strong>
          <small style="color:var(--muted)">🕒 ${h(e.heure || 'Toute la journée')} · 📍 ${h(e.lieu)}</small>
        </div>
      </div>`).join("") : "<p class='muted'>Aucun événement programmé.</p>";

    const listHonneur = honeur.rows.length ? honeur.rows.map(h_item => `
      <div style="padding:12px;background:#fef3c7;border:1px solid #fde68a;border-radius:10px">
        <strong style="color:#b45309;display:block">⭐ ${h(h_item.prenom)} ${h(h_item.nom)} (${h(h_item.classe || "Élève")})</strong>
        <p style="margin:4px 0 0;font-size:.88rem;color:#78350f">${h(h_item.motif)}</p>
      </div>`).join("") : "";

    const welcome = req.session.user
      ? `<div style="background:#e0e7ff;padding:16px;border-radius:12px;display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
           <span><b>Bienvenue ${h(req.session.user.prenom)} !</b> Accédez directement à votre tableau de bord.</span>
           <a class="btn" href="${rolesAdmin.includes(req.session.user.role) ? "/admin" : "/espace-eleve"}">Ouvrir Mon Espace</a>
         </div>`
      : "";

    res.send(page("Accueil", `
      ${welcome}
      <div class="hero">
        <h1>Bienvenue à LEKOL S&amp;H</h1>
        <p>Une école communautaire gratuite dédiée à la réussite, à la rigueur académique et à l'épanouissement de chaque élève.</p>
        <a class="btn gold" href="/connexion">Portail Connexion Élèves &amp; Parents</a>
      </div>

      ${listHonneur ? `<section class="card"><h2>🏆 Tableau d'Honneur &amp; Élèves Félicités</h2><div class="grid">${listHonneur}</div></section>` : ""}

      <div class="grid">
        <section class="card">
          <h2>📢 Dernières Communiqués</h2>
          ${listAnnonces}
        </section>

        <section class="card">
          <h2>🗓️ Agenda &amp; Événements à Venir</h2>
          <div style="display:flex;flex-direction:column;gap:10px">
            ${listEvts}
          </div>
        </section>
      </div>

      <section class="card">
        <h2>📸 Galerie de la Vie Scolaire</h2>
        <div class="grid">
          ${galeries.rows.map(g => `
            <div style="border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff">
              <img src="${h(g.image_url)}" alt="${h(g.titre)}" style="width:100%;height:160px;object-fit:cover">
              <div style="padding:12px">
                <strong style="display:block;color:var(--navy);font-size:.95rem">${h(g.titre)}</strong>
                <small style="color:var(--muted)">${h(g.description || "")}</small>
              </div>
            </div>`).join("") || "<p class='muted'>Aucune photo récente dans la galerie.</p>"}
        </div>
      </section>
    `));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement page d'accueil.");
  }
});

// ROUTE CONNEXION
app.get("/connexion", (req, res) => {
  if (req.session.user) {
    return res.redirect(rolesAdmin.includes(req.session.user.role) ? "/admin" : "/espace-eleve");
  }
  res.send(page("Connexion", `<section class="card narrow" style="margin:40px auto">
    <h2>Espace de Connexion</h2>
    <p style="color:var(--muted);font-size:.9rem">Saisis ton code élève (ex: S&amp;H-1234) ou ton email pour ouvrir ta session.</p>
    <form method="post" action="/connexion">${csrfField(req)}
    <label>Identifiant / Code Élève</label><input name="identifiant" required placeholder="Email ou S&amp;H-XXXX">
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

// ESPACE ÉLÈVE & PARENT COMPLET
app.get("/espace-eleve", requireStudent, async (req, res) => {
  const id = req.session.user.id;
  try {
    const er = await pool.query(`
      SELECT u.id,u.nom,u.prenom,u.code_eleve,u.email,u.classe_id,c.nom AS nom_classe
      FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.id=$1`, [id]);

    const student = er.rows[0];

    const [pr, dr, nr, mr, hr, disc] = await Promise.all([
      pool.query("SELECT statut,date_presence,remarque FROM presences WHERE eleve_id=$1 ORDER BY date_presence DESC LIMIT 50", [id]),
      student.classe_id ? pool.query("SELECT matiere,description,date_pour FROM devoirs WHERE classe_id=$1 ORDER BY date_pour ASC LIMIT 30", [student.classe_id]) : Promise.resolve({ rows: [] }),
      pool.query("SELECT matiere,note,periode,date_saisie FROM notes WHERE eleve_id=$1 ORDER BY date_saisie DESC LIMIT 50", [id]),
      pool.query("SELECT sujet,contenu,date_envoi FROM messages WHERE destinataire_id=$1 ORDER BY date_envoi DESC LIMIT 30", [id]),
      student.classe_id ? pool.query("SELECT jour,creneau,titre,description FROM horaires WHERE classe_id=$1 ORDER BY id ASC", [student.classe_id]) : Promise.resolve({ rows: [] }),
      pool.query("SELECT type_remarque,motif,date_remarque FROM discipline WHERE eleve_id=$1 ORDER BY date_remarque DESC", [id])
    ]);

    const totalNotes = nr.rows.reduce((acc, curr) => acc + Number(curr.note || 0), 0);
    const moyenne = nr.rows.length ? (totalNotes / nr.rows.length).toFixed(1) : "—";

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>👋 Espace Personnel — ${h(student.prenom)} ${h(student.nom)}</h2>
        <p style="margin:0">Code Élève : <b style="color:var(--blue)">${h(student.code_eleve || "—")}</b> · Classe : <b>${h(student.nom_classe || "Non assignée")}</b></p>
      </section>

      <div class="grid">
        <div class="stat"><strong>${moyenne}${moyenne !== "—" ? " / 100" : ""}</strong>Moyenne Générale</div>
        <div class="stat"><strong>${pr.rows.filter(p => p.statut === 'PRESENT').length}</strong>Présences Enregistrées</div>
        <div class="stat"><strong>${pr.rows.filter(p => p.statut === 'ABSENT').length}</strong>Absences</div>
        <div class="stat"><strong>${disc.rows.length}</strong>Remarques Discipline</div>
      </div>

      <br>
      <div class="tabs">
        <button class="tab-btn active" onclick="openTab('t-notes', this)">📊 Bulletins &amp; Notes</button>
        <button class="tab-btn" onclick="openTab('t-devoirs', this)">📚 Devoirs à faire</button>
        <button class="tab-btn" onclick="openTab('t-discipline', this)">⭐ Discipline</button>
        <button class="tab-btn" onclick="openTab('t-horaires', this)">⏰ Emploi du temps</button>
        <button class="tab-btn" onclick="openTab('t-messages', this)">✉️ Messages Direction</button>
      </div>

      <div id="t-notes" class="tab-content active"><section class="card">
        <h2>📊 Relevé de Notes</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Matière</th><th>Note</th><th>Période</th><th>Date</th></tr></thead>
          <tbody>${nr.rows.map(n => `<tr><td><b>${h(n.matiere)}</b></td><td><strong style="color:var(--blue)">${h(n.note)} / 100</strong></td><td>${h(n.periode)}</td><td>${dateFr(n.date_saisie)}</td></tr>`).join("") || "<tr><td colspan='4'>Aucune note encore enregistrée.</td></tr>"}</tbody>
        </table></div>
      </section></div>

      <div id="t-devoirs" class="tab-content"><section class="card">
        <h2>📚 Cahier de Textes / Devoirs</h2>
        ${dr.rows.map(d => `<div style="padding:14px;background:#f8fafc;border:1px solid var(--line);border-radius:10px;margin-bottom:12px">
          <strong style="color:var(--navy);font-size:1rem">${h(d.matiere)}</strong>
          <p style="margin:6px 0">${h(d.description)}</p>
          <small style="color:var(--blue);font-weight:700">📅 À rendre pour le : ${dateFr(d.date_pour)}</small>
        </div>`).join("") || "<p class='muted'>Aucun devoir en cours.</p>"}
      </section></div>

      <div id="t-discipline" class="tab-content"><section class="card">
        <h2>⭐ Dossier Disciplinaire &amp; Mentions</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Mention</th><th>Détails / Motif</th><th>Date</th></tr></thead>
          <tbody>${disc.rows.map(d => `<tr><td><span class="badge ${d.type_remarque === 'FÉLICITATIONS' ? 'success' : 'danger'}">${h(d.type_remarque)}</span></td><td>${h(d.motif)}</td><td>${dateFr(d.date_remarque)}</td></tr>`).join("") || "<tr><td colspan='3'>Dossier exemplaire. Aucune sanction ni avertissement !</td></tr>"}</tbody>
        </table></div>
      </section></div>

      <div id="t-horaires" class="tab-content"><section class="card">
        <h2>⏰ Emploi du Temps de la Classe</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Jour</th><th>Créneau &amp; Matière</th></tr></thead>
          <tbody>${hr.rows.map(h_item => `<tr><td><b>${h(h_item.jour)}</b><br><small>${h(h_item.creneau)}</small></td><td><b>${h(h_item.titre)}</b><br><small>${h(h_item.description || "")}</small></td></tr>`).join("") || "<tr><td colspan='2'>Horaires non définis.</td></tr>"}</tbody>
        </table></div>
      </section></div>

      <div id="t-messages" class="tab-content"><section class="card">
        <h2>✉️ Messagerie Interne</h2>
        ${mr.rows.map(m => `<div style="padding:12px;background:#eff6ff;border-radius:8px;margin-bottom:10px">
          <strong style="color:var(--navy)">${h(m.sujet)}</strong><p style="margin:4px 0">${h(m.contenu)}</p><small>${dateFr(m.date_envoi)}</small>
        </div>`).join("") || "<p class='muted'>Aucun message de la direction.</p>"}
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
    res.status(500).send("Erreur espace élève.");
  }
});

// ADMIN COMPLET
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [classes, students, evts] = await Promise.all([
      pool.query("SELECT id,nom,niveau FROM classes ORDER BY nom"),
      pool.query("SELECT u.id,u.nom,u.prenom,u.code_eleve,c.nom AS nom_classe FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id WHERE u.role='ELEVE' ORDER BY u.id DESC"),
      pool.query("SELECT id,titre,date_evenement,heure FROM evenements ORDER BY date_evenement DESC LIMIT 20")
    ]);

    const classOptions = classes.rows.map(c => `<option value="${c.id}">${h(c.nom)} (${h(c.niveau || "")})</option>`).join("");
    const studentOptions = students.rows.map(s => `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} — ${h(s.code_eleve)} (${h(s.nom_classe || "Sans classe")})</option>`).join("");

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>⚙️ Panneau de Direction LEKOL S&amp;H</h2>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <a class="btn" href="/admin/appel">📝 Prise d'Appel par Classe</a>
          <a class="btn secondary" href="/admin/horaires">⏰ Gestion Emplois du Temps</a>
        </div>
      </section>

      <div class="tabs">
        <button class="tab-btn active" onclick="openTab('a-eleves', this)">👩‍🎓 Élèves</button>
        <button class="tab-btn" onclick="openTab('a-notes', this)">📊 Notes</button>
        <button class="tab-btn" onclick="openTab('a-agenda', this)">🗓️ Agenda / Événements</button>
        <button class="tab-btn" onclick="openTab('a-discipline', this)">⭐ Discipline</button>
        <button class="tab-btn" onclick="openTab('a-galerie', this)">📸 Galerie</button>
      </div>

      <div id="a-eleves" class="tab-content active">
        <section class="card">
          <h2>➕ Inscrire un Élève</h2>
          <form method="post" action="/admin/eleve">${csrfField(req)}
            <div class="grid">
              <div><label>Nom</label><input name="nom" required placeholder="Ex. Pierre"></div>
              <div><label>Prénom</label><input name="prenom" required placeholder="Ex. Jean"></div>
            </div>
            <label>Classe</label><select name="classe_id" required><option value="">Choisir</option>${classOptions}</select>
            <label>Mot de passe initial</label><input type="password" name="password" required value="ecole2026">
            <button style="margin-top:12px" type="submit">Inscrire Élève &amp; Générer Code S&amp;H</button>
          </form>
        </section>
      </div>

      <div id="a-notes" class="tab-content">
        <section class="card">
          <h2>📊 Saisie d'une Note</h2>
          <form method="post" action="/admin/note">${csrfField(req)}
            <label>Élève</label><select name="eleve_id" required><option value="">Choisir</option>${studentOptions}</select>
            <label>Matière</label><input name="matiere" required placeholder="Ex. Mathématiques">
            <label>Note sur 100</label><input type="number" name="note" min="0" max="100" required placeholder="Ex. 85">
            <label>Période</label><input name="periode" required placeholder="Ex. 1er Contrôle">
            <button style="margin-top:12px" type="submit">Enregistrer la note</button>
          </form>
        </section>
      </div>

      <div id="a-agenda" class="tab-content">
        <section class="card">
          <h2>🗓️ Ajouter un événement à l'agenda</h2>
          <form method="post" action="/admin/agenda">${csrfField(req)}
            <label>Titre de l'événement</label><input name="titre" required placeholder="Ex. Examen du 1er Contrôle, Fête du Drapeau">
            <div class="grid">
              <div><label>Date</label><input type="date" name="date_evenement" required value="${today()}"></div>
              <div><label>Heure</label><input name="heure" placeholder="Ex. 08:00 AM"></div>
            </div>
            <label>Lieu</label><input name="lieu" value="Enceinte de l'école">
            <button style="margin-top:12px" type="submit">Ajouter à l'Agenda</button>
          </form>
        </section>
      </div>

      <div id="a-discipline" class="tab-content">
        <section class="card">
          <h2>⭐ Attribuer Félicitations ou Avertissement</h2>
          <form method="post" action="/admin/discipline">${csrfField(req)}
            <label>Élève</label><select name="eleve_id" required><option value="">Choisir</option>${studentOptions}</select>
            <label>Mention</label>
            <select name="type_remarque" required>
              <option value="FÉLICITATIONS">Félicitations / Tableau d'Honneur</option>
              <option value="AVERTISSEMENT">Avertissement Discipline</option>
            </select>
            <label>Motif / Remarque</label><textarea name="motif" required></textarea>
            <button style="margin-top:12px" type="submit">Ajouter au dossier</button>
          </form>
        </section>
      </div>

      <div id="a-galerie" class="tab-content">
        <section class="card">
          <h2>📸 Publier une photo sur la Galerie</h2>
          <form method="post" action="/admin/galerie">${csrfField(req)}
            <label>Titre</label><input name="titre" required placeholder="Ex. Concours de lecture">
            <label>Lien d'image URL</label><input name="image_url" required placeholder="https://...">
            <label>Description</label><textarea name="description"></textarea>
            <button style="margin-top:12px" type="submit">Publier sur la Galerie</button>
          </form>
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
    res.status(500).send("Erreur administration.");
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

app.post("/admin/agenda", requireAdmin, async (req, res) => {
  const { titre, date_evenement, heure, lieu } = req.body;
  try {
    await pool.query("INSERT INTO evenements (titre, date_evenement, heure, lieu) VALUES ($1,$2,$3,$4)", [String(titre).trim(), date_evenement, String(heure).trim(), String(lieu).trim()]);
    res.redirect("/admin");
  } catch (e) { console.error(e); res.status(500).send("Erreur ajout événement."); }
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

// ROUTE PRISES D'APPEL
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

// ROUTE GESTION DES HORAIRES
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
