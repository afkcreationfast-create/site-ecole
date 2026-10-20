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
<meta name="theme-color" content="#102a56">
<title>${h(title)} — LEKOL S&amp;H</title>
<style>
:root{--navy:#102a56;--blue:#2563eb;--light-bg:#f8fafc;--card-bg:#ffffff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--success:#16a34a;--danger:#dc2626;--warning:#d97706}
*{box-sizing:border-box}
body{margin:0;background:var(--light-bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
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
tr:last-child td{border-bottom:0}
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
<div class="sub">Plateforme de Gestion Scolaire Moderne</div></div>
${body.includes("data-user") ? "<span class='badge success'>Connecté</span>" : ""}
</div></header>
<nav><a href="/">Accueil</a><a href="/connexion">Connexion</a>
${body.includes("data-user") ? '<a href="/deconnexion">Déconnexion</a>' : ""}
</nav>
<main>${body}</main>
<div class="footer">© ${new Date().getFullYear()} LEKOL S&amp;H — Port-au-Prince / Haiti</div>
</body></html>`;

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!rolesAdmin.includes(req.session.user.role)) {
    return res.status(403).send(page("Accès refusé",
      "<section class='card'><h2>Accès refusé</h2><p>Ton compte n'a pas les droits d'administration.</p><a class='btn' href='/'>Retour</a></section>"));
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
        "<section class='card'><h2>Formulaire expiré</h2><p>Recharge la page et réessaie.</p><a class='btn' href='/'>Accueil</a></section>"));
    }
  }
  next();
});

// ACCUEIL
app.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT titre,contenu,date_publication,publie_par FROM annonces ORDER BY date_publication DESC LIMIT 20"
    );
    const list = rows.length ? rows.map(a => `
      <article style="padding:14px;background:#f8fafc;border-left:4px solid var(--blue);border-radius:6px;margin-bottom:12px">
        <h3 style="margin:0 0 6px;color:var(--navy)">${h(a.titre)}</h3>
        <p style="margin:0 0 8px">${h(a.contenu).replace(/\n/g, "<br>")}</p>
        <small style="color:var(--muted)">Publié le ${dateFr(a.date_publication)} · ${h(a.publie_par || "Direction")}</small>
      </article>`).join("") : "<p class='muted'>Aucune annonce publique pour le moment.</p>";

    const welcome = req.session.user
      ? `<section class="card"><h2>Bonjour ${h(req.session.user.prenom || "")} 👋</h2>
         <p>Tu es connecté à ton compte LEKOL S&amp;H.</p>
         <a class="btn" href="${rolesAdmin.includes(req.session.user.role) ? "/admin" : "/espace-eleve"}">Accéder à mon espace</a></section>`
      : `<section class="card"><h2>🔑 Espace Membre</h2>
         <p>Connecte-toi pour consulter tes devoirs, tes notes et tes présences.</p>
         <a class="btn full" href="/connexion">Se connecter</a></section>`;

    res.send(page("Accueil", `<section class="card"><h2>📢 Annonces de l'école</h2>${list}</section>${welcome}`));
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
    <label>Identifiant</label><input name="identifiant" autocomplete="username" required placeholder="Email ou S&amp;H-XXXX">
    <label>Mot de passe</label><input type="password" name="password" autocomplete="current-password" required placeholder="••••••••">
    <button class="full" style="margin-top:15px" type="submit">Se connecter</button></form></section>`));
});

app.post("/connexion", loginLimiter, async (req, res) => {
  const identifiant = String(req.body.identifiant || "").trim();
  const password = String(req.body.password || "");
  if (!identifiant || !password) return res.redirect("/connexion");

  try {
    const result = await pool.query(
      "SELECT * FROM utilisateurs WHERE lower(email)=lower($1) OR code_eleve=$1 LIMIT 1",
      [identifiant]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).send(page("Connexion",
        "<section class='card'><h2>Connexion échouée</h2><p>Identifiant ou mot de passe incorrect.</p><a class='btn' href='/connexion'>Réessayer</a></section>"));
    }

    let valid = false;
    const stored = String(user.mot_de_passe || "");
    if (/^\$2[aby]\$/.test(stored)) {
      valid = await bcrypt.compare(password, stored);
    } else {
      valid = stored === password;
      if (valid) {
        const hash = await bcrypt.hash(password, 12);
        await pool.query("UPDATE utilisateurs SET mot_de_passe=$1 WHERE id=$2", [hash, user.id]);
      }
    }

    if (!valid) {
      return res.status(401).send(page("Connexion",
        "<section class='card'><h2>Connexion échouée</h2><p>Identifiant ou mot de passe incorrect.</p><a class='btn' href='/connexion'>Réessayer</a></section>"));
    }

    const role = String(user.role || "").toUpperCase();
    await new Promise((resolve, reject) =>
      req.session.regenerate(err => err ? reject(err) : resolve())
    );

    req.session.user = {
      id: user.id, nom: user.nom, prenom: user.prenom,
      role, classe_id: user.classe_id
    };
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");

    req.session.save(() => {
      res.redirect(rolesAdmin.includes(role) ? "/admin" : "/espace-eleve");
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur lors de la connexion.");
  }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("lekolsid");
    res.redirect("/");
  });
});

// ESPACE ÉLÈVE & PARENT
app.get("/espace-eleve", requireStudent, async (req, res) => {
  const id = req.session.user.id;
  try {
    const er = await pool.query(`
      SELECT u.id,u.nom,u.prenom,u.code_eleve,u.email,u.classe_id,c.nom AS nom_classe
      FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id
      WHERE u.id=$1`, [id]);

    if (!er.rows.length) return res.status(404).send("Élève non trouvé.");
    const student = er.rows[0];

    const [pr, dr, nr, mr, hr] = await Promise.all([
      pool.query("SELECT statut,date_presence,remarque FROM presences WHERE eleve_id=$1 ORDER BY date_presence DESC LIMIT 100", [id]),
      student.classe_id
        ? pool.query("SELECT matiere,description,date_pour FROM devoirs WHERE classe_id=$1 ORDER BY date_pour ASC LIMIT 50", [student.classe_id])
        : Promise.resolve({ rows: [] }),
      pool.query("SELECT matiere,note,periode,date_saisie FROM notes WHERE eleve_id=$1 ORDER BY date_saisie DESC LIMIT 100", [id]),
      pool.query("SELECT id,sujet,contenu,date_envoi FROM messages WHERE destinataire_id=$1 ORDER BY date_envoi DESC LIMIT 50", [id]),
      student.classe_id
        ? pool.query("SELECT jour,creneau,titre,description FROM horaires WHERE classe_id=$1 ORDER BY id ASC", [student.classe_id])
        : Promise.resolve({ rows: [] })
    ]);

    const count = s => pr.rows.filter(p => p.statut === s).length;
    
    // Calcul de la moyenne
    const totalNotes = nr.rows.reduce((acc, curr) => acc + Number(curr.note || 0), 0);
    const moyenne = nr.rows.length ? (totalNotes / nr.rows.length).toFixed(1) : "—";

    const presenceRows = pr.rows.map(p =>
      `<tr><td>${dateFr(p.date_presence)}</td>
       <td><span class="badge ${p.statut === 'PRESENT' ? 'success' : p.statut === 'ABSENT' ? 'danger' : 'warning'}">${h(p.statut)}</span></td>
       <td>${h(p.remarque || "—")}</td></tr>`
    ).join("");

    const devoirRows = dr.rows.map(d =>
      `<div style="padding:12px;background:#f8fafc;border:1px solid var(--line);border-radius:8px;margin-bottom:10px">
        <strong style="color:var(--navy);display:block">${h(d.matiere)}</strong>
        <p style="margin:4px 0">${h(d.description)}</p>
        <small style="color:var(--blue);font-weight:600">📅 À rendre pour le : ${dateFr(d.date_pour)}</small>
       </div>`
    ).join("") || "<p class='muted'>Aucun devoir à rendre.</p>";

    const horaireRows = hr.rows.map(item =>
      `<tr><td><b>${h(item.jour)}</b><br><small>${h(item.creneau)}</small></td><td><b>${h(item.titre)}</b><br><small>${h(item.description || "")}</small></td></tr>`
    ).join("") || "<tr><td colspan='2'>Aucun horaire publié.</td></tr>";

    const noteRows = nr.rows.map(n =>
      `<tr><td><b>${h(n.matiere)}</b></td><td><strong style="color:var(--blue)">${h(n.note)} / 100</strong></td><td>${h(n.periode)}</td><td>${dateFr(n.date_saisie)}</td></tr>`
    ).join("");

    const messageRows = mr.rows.map(m =>
      `<div style="padding:12px;background:#eff6ff;border-radius:8px;margin-bottom:10px">
        <strong style="color:var(--navy);display:block">${h(m.sujet)}</strong>
        <p style="margin:4px 0">${h(m.contenu).replace(/\n/g, "<br>")}</p>
        <small style="color:var(--muted)">${dateFr(m.date_envoi)}</small>
       </div>`
    ).join("") || "<p class='muted'>Aucun message direct.</p>";

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>👋 Espace Élève — ${h(student.prenom)} ${h(student.nom)}</h2>
        <p style="margin:0">Code élève : <b style="color:var(--blue)">${h(student.code_eleve || "—")}</b> · Classe : <b>${h(student.nom_classe || "Non assignée")}</b></p>
      </section>

      <div class="grid">
        <div class="stat"><strong>${moyenne}${moyenne !== "—" ? " / 100" : ""}</strong>Moyenne Générale</div>
        <div class="stat"><strong>${count("PRESENT")}</strong>Présences</div>
        <div class="stat"><strong>${count("ABSENT")}</strong>Absences</div>
        <div class="stat"><strong>${count("RETARD")}</strong>Retards</div>
      </div>

      <br>
      <div class="tabs">
        <button class="tab-btn active" onclick="openTab('t-notes', this)">📊 Notes & Bulletins</button>
        <button class="tab-btn" onclick="openTab('t-devoirs', this)">📚 Cahier de Textes / Devoirs</button>
        <button class="tab-btn" onclick="openTab('t-horaires', this)">⏰ Emploi du temps</button>
        <button class="tab-btn" onclick="openTab('t-presences', this)">📅 Présences</button>
        <button class="tab-btn" onclick="openTab('t-messages', this)">✉️ Messages Direction</button>
        <button class="tab-btn" onclick="openTab('t-profil', this)">🔐 Mon Profil</button>
      </div>

      <div id="t-notes" class="tab-content active"><section class="card">
        <h2>📊 Relevé de Notes</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Matière</th><th>Note</th><th>Période</th><th>Date</th></tr></thead>
          <tbody>${noteRows || "<tr><td colspan='4'>Aucune note enregistrée.</td></tr>"}</tbody>
        </table></div>
      </section></div>

      <div id="t-devoirs" class="tab-content"><section class="card">
        <h2>📚 Devoirs et Leçons</h2>${devoirRows}
      </section></div>

      <div id="t-horaires" class="tab-content"><section class="card">
        <h2>⏰ Emploi du Temps</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Jour & Horaires</th><th>Matière & Informations</th></tr></thead>
          <tbody>${horaireRows}</tbody>
        </table></div>
      </section></div>

      <div id="t-presences" class="tab-content"><section class="card">
        <h2>📅 Historique des Présences</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Date</th><th>Statut</th><th>Remarque</th></tr></thead>
          <tbody>${presenceRows || "<tr><td colspan='3'>Aucune présence enregistrée.</td></tr>"}</tbody>
        </table></div>
      </section></div>

      <div id="t-messages" class="tab-content"><section class="card">
        <h2>✉️ Messages reçus de la Direction</h2>${messageRows}
      </section></div>

      <div id="t-profil" class="tab-content"><section class="card">
        <h2>🔐 Modifier mon mot de passe / Email</h2>
        <form method="post" action="/profil">${csrfField(req)}
        <label>Email de contact</label><input type="email" name="email" value="${h(student.email || "")}">
        <label>Nouveau mot de passe (laisser vide si inchangé)</label>
        <input type="password" name="password" minlength="8" placeholder="8 caractères minimum">
        <button style="margin-top:12px" type="submit">Sauvegarder les modifications</button></form>
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
    res.status(500).send("Erreur lors du chargement de votre espace élève.");
  }
});

app.post("/profil", requireStudent, async (req, res) => {
  const email = String(req.body.email || "").trim() || null;
  const password = String(req.body.password || "");
  try {
    if (password && password.length >= 8) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query("UPDATE utilisateurs SET email=$1,mot_de_passe=$2 WHERE id=$3", [email, hash, req.session.user.id]);
    } else {
      await pool.query("UPDATE utilisateurs SET email=$1 WHERE id=$2", [email, req.session.user.id]);
    }
    res.redirect("/espace-eleve");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur lors de la mise à jour du profil.");
  }
});

// PANNEAU ADMINISTRATION
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [classes, annonces, students, presences, notes, devoirs, messages] = await Promise.all([
      pool.query("SELECT id,nom,niveau FROM classes ORDER BY nom"),
      pool.query("SELECT id,titre,contenu,date_publication FROM annonces ORDER BY date_publication DESC LIMIT 50"),
      pool.query(`
        SELECT u.id,u.nom,u.prenom,u.code_eleve,u.classe_id,c.nom AS nom_classe
        FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id
        WHERE u.role='ELEVE' ORDER BY u.id DESC LIMIT 500`),
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE statut='PRESENT') AS presents,
          COUNT(*) FILTER (WHERE statut='ABSENT') AS absents,
          COUNT(*) FILTER (WHERE statut='RETARD') AS retards
        FROM presences WHERE date_presence=CURRENT_DATE`),
      pool.query("SELECT COUNT(*) AS total FROM notes"),
      pool.query("SELECT d.id,d.matiere,d.description,d.date_pour,c.nom AS nom_classe FROM devoirs d LEFT JOIN classes c ON c.id=d.classe_id ORDER BY d.id DESC LIMIT 30"),
      pool.query("SELECT id,sujet,contenu,date_envoi,destinataire_id FROM messages ORDER BY date_envoi DESC LIMIT 30")
    ]);

    const classOptions = classes.rows.map(c => `<option value="${c.id}">${h(c.nom)} (${h(c.niveau || "")})</option>`).join("");
    const studentOptions = students.rows.map(s => `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} — ${h(s.code_eleve)} (${h(s.nom_classe || "Sans classe")})</option>`).join("");

    const studentRows = students.rows.map(s => `
      <tr><td><b>${h(s.code_eleve)}</b></td><td>${h(s.nom)} ${h(s.prenom)}</td><td>${h(s.nom_classe || "Non assignée")}</td></tr>
    `).join("");

    const announcementRows = annonces.rows.map(a => `
      <tr><td><b>${h(a.titre)}</b><br><small>${h(a.contenu)}</small></td><td>${dateFr(a.date_publication)}</td>
      <td><form method="post" action="/admin/annonce/supprimer/${a.id}">${csrfField(req)}<button class="btn danger" type="submit">X</button></form></td></tr>
    `).join("");

    const devoirRows = devoirs.rows.map(d => `
      <tr><td><b>${h(d.nom_classe || "—")}</b></td><td><b>${h(d.matiere)}</b><br><small>${h(d.description)}</small></td><td>${dateFr(d.date_pour)}</td></tr>
    `).join("");

    const stats = presences.rows[0];

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>⚙️ Administration — LEKOL S&amp;H</h2>
        <p>Connecté en tant que <b>${h(req.session.user.role)}</b>.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px">
          <a class="btn" href="/admin/appel">📝 Prise d'appel par classe</a>
          <a class="btn secondary" href="/admin/horaires">⏰ Gestion des emplois du temps</a>
          <a class="btn secondary" href="/admin/rapport.csv">📥 Exporter Présences CSV</a>
        </div>
      </section>

      <div class="grid">
        <div class="stat"><strong>${students.rows.length}</strong>Élèves Inscrits</div>
        <div class="stat"><strong>${h(stats.presents || 0)}</strong>Présents Aujourd'hui</div>
        <div class="stat"><strong>${h(stats.absents || 0)}</strong>Absents Aujourd'hui</div>
        <div class="stat"><strong>${h(notes.rows[0].total || 0)}</strong>Notes Saisies</div>
      </div>

      <br>
      <div class="tabs">
        <button class="tab-btn active" onclick="openTab('a-eleves', this)">👩‍🎓 Élèves & Inscription</button>
        <button class="tab-btn" onclick="openTab('a-notes', this)">📊 Saisie des Notes</button>
        <button class="tab-btn" onclick="openTab('a-devoirs', this)">📚 Cahier de Textes / Devoirs</button>
        <button class="tab-btn" onclick="openTab('a-annonces', this)">📢 Annonces</button>
        <button class="tab-btn" onclick="openTab('a-messages', this)">✉️ Messages Directs</button>
      </div>

      <div id="a-eleves" class="tab-content active">
        <section class="card">
          <h2>➕ Inscrire un nouvel élève</h2>
          <form method="post" action="/admin/eleve">${csrfField(req)}
          <div class="grid">
            <div><label>Nom</label><input name="nom" required placeholder="Nom de l'élève"></div>
            <div><label>Prénom</label><input name="prenom" required placeholder="Prénom de l'élève"></div>
          </div>
          <label>Classe</label><select name="classe_id" required><option value="">Choisir une classe</option>${classOptions}</select>
          <label>Email des parents (facultatif)</label><input type="email" name="email" placeholder="parents@example.com">
          <label>Mot de passe initial</label><input type="password" name="password" required value="ecole2026">
          <button style="margin-top:12px" type="submit">Créer le compte Élève & Générer Code S&amp;H</button>[span_1](start_span)[span_1](end_span)
          </form>
        </section>

        <section class="card">
          <h2>📋 Liste des Élèves</h2>
          <input id="search" placeholder="Rechercher un élève ou un code..." style="margin-bottom:12px">
          <div class="tablewrap"><table id="studentTable">
            <thead><tr><th>Code Élève</th><th>Nom & Prénom</th><th>Classe</th></tr></thead>
            <tbody>${studentRows || "<tr><td colspan='3'>Aucun élève inscrit.</td></tr>"}</tbody>
          </table></div>
        </section>
      </div>

      <div id="a-notes" class="tab-content">
        <section class="card">
          <h2>📊 Saisie d'une Note</h2>
          <form method="post" action="/admin/note">${csrfField(req)}
          <label>Sélectionner l'élève</label><select name="eleve_id" required><option value="">Choisir un élève</option>${studentOptions}</select>
          <label>Matière</label><input name="matiere" required placeholder="Ex. Mathématiques, Français, Sciences">
          <div class="grid">
            <div><label>Note sur 100</label><input type="number" name="note" min="0" max="100" step="0.5" required placeholder="Ex. 85"></div>
            <div><label>Période / Contrôle</label><input name="periode" required placeholder="Ex. 1er Contrôle, Examen Final"></div>
          </div>
          <button style="margin-top:12px" type="submit">Enregistrer la note</button>
          </form>
        </section>
      </div>

      <div id="a-devoirs" class="tab-content">
        <section class="card">
          <h2>📚 Ajouter un devoir / Cahier de textes</h2>
          <form method="post" action="/admin/devoir">${csrfField(req)}
          <label>Classe concernée</label><select name="classe_id" required><option value="">Choisir la classe</option>${classOptions}</select>
          <label>Matière</label><input name="matiere" required placeholder="Ex. Histoire, Grammaire">
          <label>Description du devoir / Exercices à faire</label><textarea name="description" required placeholder="Ex. Faire les exercices 1 à 5 page 42."></textarea>
          <label>À rendre pour le (Date)</label><input type="date" name="date_pour" required value="${today()}">
          <button style="margin-top:12px" type="submit">Publier le devoir</button>
          </form>
        </section>
        <section class="card">
          <h2>Devoirs récents</h2>
          <div class="tablewrap"><table>
            <thead><tr><th>Classe</th><th>Matière & Consignes</th><th>Date limite</th></tr></thead>
            <tbody>${devoirRows || "<tr><td colspan='3'>Aucun devoir publié.</td></tr>"}</tbody>
          </table></div>
        </section>
      </div>

      <div id="a-annonces" class="tab-content">
        <section class="card">
          <h2>📢 Publier une Annonce officielle</h2>
          <form method="post" action="/admin/annonce">${csrfField(req)}
          <label>Titre de l'annonce</label><input name="titre" required placeholder="Ex. Fermeture exceptionnelle, Réunion des parents">
          <label>Contenu du message</label><textarea name="contenu" required></textarea>
          <button style="margin-top:12px" type="submit">Publier l'annonce</button>
          </form>
        </section>
        <section class="card">
          <h2>Annonces publiées</h2>
          <div class="tablewrap"><table>
            <thead><tr><th>Annonce</th><th>Date</th><th>Action</th></tr></thead>
            <tbody>${announcementRows || "<tr><td colspan='3'>Aucune annonce.</td></tr>"}</tbody>
          </table></div>
        </section>
      </div>

      <div id="a-messages" class="tab-content">
        <section class="card">
          <h2>✉️ Envoyer un Message direct à un élève / parent</h2>
          <form method="post" action="/admin/message">${csrfField(req)}
          <label>Destinataire</label><select name="destinataire_id" required><option value="">Choisir le destinataire</option>${studentOptions}</select>
          <label>Sujet</label><input name="sujet" required placeholder="Ex. Convocation, Rappel de frais, Discipline">
          <label>Message</label><textarea name="contenu" required></textarea>
          <button style="margin-top:12px" type="submit">Envoyer le message</button>
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
      document.getElementById("search").addEventListener("input", function() {
        const q = this.value.toLowerCase();
        document.querySelectorAll("#studentTable tbody tr").forEach(r => {
          r.style.display = r.innerText.toLowerCase().includes(q) ? "" : "none";
        });
      });
      </script>`;

    res.send(page("Administration", body));
  } catch (e) {
    console.error("Erreur Admin:", e);
    res.status(500).send("Erreur chargement admin. Vérifie la base de données.");
  }
});

// ROUTE PRISE D'APPEL PAR CLASSE
app.get("/admin/appel", requireAdmin, async (req, res) => {
  const classeId = Number(req.query.classe_id);
  const dateAppel = String(req.query.date || today());

  try {
    const classes = await pool.query("SELECT id, nom, niveau FROM classes ORDER BY nom");
    const classOptions = classes.rows.map(c => 
      `<option value="${c.id}" ${c.id === classeId ? "selected" : ""}>${h(c.nom)} (${h(c.niveau || "")})</option>`
    ).join("");

    let studentRows = "";
    if (classeId) {
      const students = await pool.query(
        "SELECT id, nom, prenom, code_eleve FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1 ORDER BY nom",
        [classeId]
      );

      studentRows = students.rows.length ? students.rows.map(s => `
        <tr>
          <td><b>${h(s.nom)} ${h(s.prenom)}</b><br><small style="color:var(--muted)">${h(s.code_eleve)}</small></td>
          <td>
            <label style="display:inline-flex;align-items:center;gap:4px;margin-right:15px;cursor:pointer"><input type="radio" name="statut_${s.id}" value="PRESENT" checked> <span class="badge success">Présent</span></label>
            <label style="display:inline-flex;align-items:center;gap:4px;margin-right:15px;cursor:pointer"><input type="radio" name="statut_${s.id}" value="ABSENT"> <span class="badge danger">Absent</span></label>
            <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="statut_${s.id}" value="RETARD"> <span class="badge warning">Retard</span></label>
          </td>
        </tr>
      `).join("") : "<tr><td colspan='2'>Aucun élève dans cette classe.</td></tr>";
    }

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>📝 Prise d'appel par classe</h2>
        <p><a class="btn secondary" href="/admin">← Retour au Tableau de Bord</a></p>
        <form method="get" action="/admin/appel">
          <label>Choisir la classe</label>
          <select name="classe_id" onchange="this.form.submit()" required>
            <option value="">-- Sélectionner une classe --</option>${classOptions}
          </select>
          <label>Date de l'appel</label>
          <input type="date" name="date" value="${dateAppel}" onchange="this.form.submit()" required>
        </form>
      </section>

      ${classeId ? `
      <section class="card">
        <h2>Feuille d'appel — Date du ${dateFr(dateAppel)}</h2>
        <form method="post" action="/admin/appel/valider">${csrfField(req)}
          <input type="hidden" name="classe_id" value="${classeId}">
          <input type="hidden" name="date_presence" value="${dateAppel}">
          <div class="tablewrap"><table>
            <thead><tr><th>Nom & Prénom Élève</th><th>Statut</th></tr></thead>
            <tbody>${studentRows}</tbody>
          </table></div>
          <button style="margin-top:15px" type="submit">Valider et Enregistrer l'Appel</button>
        </form>
      </section>` : ""}`;

    res.send(page("Prise d'appel", body));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur lors de la prise d'appel.");
  }
});

app.post("/admin/appel/valider", requireAdmin, async (req, res) => {
  const datePresence = String(req.body.date_presence || today());
  const classeId = Number(req.body.classe_id);

  try {
    const students = await pool.query("SELECT id FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1", [classeId]);
    for (const s of students.rows) {
      const statut = req.body[`statut_${s.id}`] || "PRESENT";
      if (["PRESENT", "ABSENT", "RETARD"].includes(statut)) {
        await pool.query("DELETE FROM presences WHERE eleve_id=$1 AND date_presence=$2", [s.id, datePresence]);
        await pool.query("INSERT INTO presences (eleve_id, statut, date_presence) VALUES ($1, $2, $3)", [s.id, statut, datePresence]);
      }
    }
    res.redirect(`/admin/appel?classe_id=${classeId}&date=${datePresence}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur validation appel.");
  }
});

// ROUTE GESTION DES HORAIRES
app.get("/admin/horaires", requireAdmin, async (req, res) => {
  try {
    const [classes, horaires] = await Promise.all([
      pool.query("SELECT id, nom, niveau FROM classes ORDER BY nom"),
      pool.query("SELECT h.id, h.titre, h.description, h.jour, h.creneau, c.nom AS nom_classe FROM horaires h LEFT JOIN classes c ON c.id = h.classe_id ORDER BY h.id DESC")
    ]);

    const classOptions = classes.rows.map(c => `<option value="${c.id}">${h(c.nom)} (${h(c.niveau || "")})</option>`).join("");
    const horaireRows = horaires.rows.map(item => `
      <tr>
        <td><b>${h(item.nom_classe)}</b></td>
        <td>${h(item.jour)}<br><small>${h(item.creneau)}</small></td>
        <td><b>${h(item.titre)}</b><br><small>${h(item.description)}</small></td>
        <td><form method="post" action="/admin/horaires/supprimer/${item.id}">${csrfField(req)}<button class="btn danger" type="submit">X</button></form></td>
      </tr>
    `).join("");

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>⏰ Emplois du temps & Horaires</h2>
        <p><a class="btn secondary" href="/admin">← Retour au Tableau de Bord</a></p>
      </section>

      <section class="card">
        <h2>Ajouter un cours à l'emploi du temps</h2>
        <form method="post" action="/admin/horaires">${csrfField(req)}
          <label>Classe</label><select name="classe_id" required><option value="">Choisir une classe</option>${classOptions}</select>
          <div class="grid">
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
            <div><label>Créneau Horaire</label><input name="creneau" required placeholder="Ex. 08:00 - 09:30"></div>
          </div>
          <label>Matière</label><input name="titre" required placeholder="Ex. Mathématiques, Physique">
          <label>Description / Professeur</label><input name="description" placeholder="Ex. Prof. Jean, Salle 4">
          <button style="margin-top:12px" type="submit">Ajouter à l'emploi du temps</button>
        </form>
      </section>

      <section class="card">
        <h2>Horaires Enregistrés</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Classe</th><th>Jour & Heure</th><th>Matière</th><th>Action</th></tr></thead>
          <tbody>${horaireRows || "<tr><td colspan='4'>Aucun horaire ajouté.</td></tr>"}</tbody>
        </table></div>
      </section>`;

    res.send(page("Horaires", body));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement horaires.");
  }
});

app.post("/admin/horaires", requireAdmin, async (req, res) => {
  const { classe_id, titre, description, jour, creneau } = req.body;
  try {
    await pool.query(
      "INSERT INTO horaires (classe_id, titre, description, jour, creneau) VALUES ($1, $2, $3, $4, $5)",
      [Number(classe_id), String(titre).trim(), String(description).trim(), String(jour).trim(), String(creneau).trim()]
    );
    res.redirect("/admin/horaires");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur ajout horaire.");
  }
});

app.post("/admin/horaires/supprimer/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM horaires WHERE id=$1", [Number(req.params.id)]);
    res.redirect("/admin/horaires");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur suppression horaire.");
  }
});

// ACTIONS ENREGISTREMENT ADMIN
app.post("/admin/eleve", requireAdmin, async (req, res) => {
  const { nom, prenom, email, password, classe_id } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    let code = "S&H-" + crypto.randomInt(1000, 10000);
    await pool.query(
      `INSERT INTO utilisateurs (nom,prenom,email,code_eleve,mot_de_passe,role,classe_id)
       VALUES ($1,$2,$3,$4,$5,'ELEVE',$6)`,
      [String(nom).trim(), String(prenom).trim(), String(email).trim() || null, code, hash, Number(classe_id)]
    );
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur ajout élève.");
  }
});

app.post("/admin/note", requireAdmin, async (req, res) => {
  const { eleve_id, matiere, note, periode } = req.body;
  try {
    await pool.query(
      "INSERT INTO notes (eleve_id,matiere,note,periode) VALUES ($1,$2,$3,$4)",
      [Number(eleve_id), String(matiere).trim(), Number(note), String(periode).trim()]
    );
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur ajout note.");
  }
});

app.post("/admin/devoir", requireAdmin, async (req, res) => {
  const { classe_id, matiere, description, date_pour } = req.body;
  try {
    await pool.query(
      "INSERT INTO devoirs (classe_id,matiere,description,date_pour) VALUES ($1,$2,$3,$4)",
      [Number(classe_id), String(matiere).trim(), String(description).trim(), date_pour]
    );
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur ajout devoir.");
  }
});

app.post("/admin/annonce", requireAdmin, async (req, res) => {
  const { titre, contenu } = req.body;
  try {
    await pool.query(
      "INSERT INTO annonces (titre,contenu,publie_par) VALUES ($1,$2,$3)",
      [String(titre).trim(), String(contenu).trim(), `Direction`]
    );
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur ajout annonce.");
  }
});

app.post("/admin/annonce/supprimer/:id", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM annonces WHERE id=$1", [Number(req.params.id)]);
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur suppression annonce.");
  }
});

app.post("/admin/message", requireAdmin, async (req, res) => {
  const { destinataire_id, sujet, contenu } = req.body;
  try {
    await pool.query(
      "INSERT INTO messages (expediteur_id,destinataire_id,sujet,contenu) VALUES ($1,$2,$3,$4)",
      [req.session.user.id, Number(destinataire_id), String(sujet).trim(), String(contenu).trim()]
    );
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur envoi message.");
  }
});

app.get("/admin/rapport.csv", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.code_eleve,u.nom,u.prenom,c.nom AS classe,p.date_presence,p.statut
      FROM presences p JOIN utilisateurs u ON u.id=p.eleve_id LEFT JOIN classes c ON c.id=u.classe_id
      ORDER BY p.date_presence DESC LIMIT 2000`);

    const csv = ["Code,Nom,Prenom,Classe,Date,Statut", ...rows.map(r => `"${r.code_eleve}","${r.nom}","${r.prenom}","${r.classe}","${dateFr(r.date_presence)}","${r.statut}"`)].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="rapport-presences.csv"');
    res.send("\uFEFF" + csv);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur export CSV.");
  }
});

// ROUTING ERREURS
app.use((req, res) => {
  res.status(404).send(page("Page introuvable", "<section class='card'><h2>Page introuvable</h2><a class='btn' href='/'>Retour</a></section>"));
});

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Connexion PostgreSQL établie.");
    app.listen(port, () => console.log(`🚀 LEKOL S&H prêt sur le port ${port}`));
  } catch (e) {
    console.error("❌ Connexion PostgreSQL impossible:", e.message);
    process.exit(1);
  }
}

start();
