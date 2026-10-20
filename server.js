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
if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error("SESSION_SECRET doit contenir au moins 32 caractères.");
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
app.use(express.urlencoded({ extended: false, limit: "20kb" }));
app.use(express.json({ limit: "20kb" }));

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
:root{--navy:#102a56;--blue:#2457a7;--ink:#17243a;--muted:#64748b;--line:#dbe3ef}
*{box-sizing:border-box}
body{margin:0;background:#f4f7fb;color:var(--ink);font:16px/1.5 system-ui,Arial,sans-serif}
header{background:linear-gradient(120deg,#102a56,#2457a7);color:white;padding:24px 18px}
.head{max-width:1100px;margin:auto;display:flex;align-items:center;justify-content:space-between;gap:15px;flex-wrap:wrap}
.brand{font-weight:850;letter-spacing:.04em;font-size:1.35rem}
.sub{opacity:.88;font-size:.92rem}
nav{background:#0b1d3a;padding:12px 18px;display:flex;gap:18px;justify-content:center;flex-wrap:wrap}
nav a{color:white;text-decoration:none;font-weight:650}
nav a:hover{color:#cfe0ff}
main{max-width:1100px;margin:26px auto;padding:0 16px}
.narrow{max-width:480px}
.card{background:white;border:1px solid var(--line);border-radius:15px;padding:22px;margin-bottom:18px;box-shadow:0 5px 18px #102a560b}
h2{font-size:1.2rem;color:var(--navy);margin:0 0 16px}
h3{margin:0 0 8px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:15px}
.stat{padding:20px;background:white;border:1px solid var(--line);border-radius:14px}
.stat strong{font-size:1.8rem;color:var(--blue);display:block}
label{display:block;font-weight:700;font-size:.92rem;margin:10px 0 5px}
input,select,textarea{width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:9px;background:white;font:inherit;margin-bottom:8px}
textarea{min-height:95px;resize:vertical}
.btn,button{display:inline-block;background:var(--blue);color:white;border:0;border-radius:9px;padding:11px 15px;font:inherit;font-weight:750;text-decoration:none;cursor:pointer}
.btn.secondary{background:#e7eef9;color:var(--navy)}
.btn.danger{background:#b4232f}
.btn.full{width:100%}
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;background:white}
th,td{text-align:left;border-bottom:1px solid var(--line);padding:11px;vertical-align:top;font-size:.93rem}
th{background:#eaf0fa;color:var(--navy)}
.muted,small{color:var(--muted)}
.announcement,.message{padding:14px;background:#f7faff;border-left:4px solid var(--blue);border-radius:8px;margin:12px 0}
.footer{text-align:center;color:var(--muted);padding:25px}
@media(max-width:600px){header{padding:20px 15px}.card{padding:17px}th,td{padding:8px;font-size:.85rem}}
</style>
</head>
<body>
<header><div class="head">
<div><div class="brand">LEKOL S&amp;H</div>
<div class="sub">Plateforme d'information et de suivi scolaire</div></div>
${body.includes("data-user") ? "<span>Session active</span>" : ""}
</div></header>
<nav><a href="/">Accueil</a><a href="/connexion">Connexion</a>
${body.includes("data-user") ? '<a href="/deconnexion">Déconnexion</a>' : ""}
</nav>
<main>${body}</main>
<div class="footer">© ${new Date().getFullYear()} LEKOL S&amp;H</div>
</body></html>`;

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect("/connexion");
  if (!rolesAdmin.includes(req.session.user.role)) {
    return res.status(403).send(page("Accès refusé",
      "<section class='card'><h2>Accès refusé</h2><p>Ton compte n'a pas les droits nécessaires.</p><a class='btn' href='/'>Retour</a></section>"));
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

// ROUTE ACCUEIL
app.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT titre,contenu,date_publication,publie_par FROM annonces ORDER BY date_publication DESC LIMIT 50"
    );
    const list = rows.length ? rows.map(a => `
      <article class="announcement"><h3>${h(a.titre)}</h3>
      <p>${h(a.contenu).replace(/\n/g, "<br>")}</p>
      <small>Publié le ${dateFr(a.date_publication)} · ${h(a.publie_par || "Direction")}</small>
      </article>`).join("") : "<p class='muted'>Aucune annonce pour le moment.</p>";

    const welcome = req.session.user
      ? `<section class="card"><h2>Bonjour ${h(req.session.user.prenom || req.session.user.nom || "")} !</h2>
         <p>Bienvenue sur ton espace scolaire.</p>
         <a class="btn" href="${rolesAdmin.includes(req.session.user.role) ? "/admin" : "/espace-eleve"}">Ouvrir mon espace</a></section>`
      : `<section class="card"><h2>Espace membres</h2>
         <p>Connecte-toi pour consulter les informations de ton compte.</p>
         <a class="btn full" href="/connexion">Se connecter</a></section>`;

    res.send(page("Accueil", `<section class="card"><h2>📢 Annonces officielles</h2>${list}</section>${welcome}`));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur serveur. Vérifie la base de données.");
  }
});

// ROUTE CONNEXION
app.get("/connexion", (req, res) => {
  if (req.session.user) {
    return res.redirect(rolesAdmin.includes(req.session.user.role) ? "/admin" : "/espace-eleve");
  }
  res.send(page("Connexion", `<section class="card narrow" style="margin:30px auto">
    <h2>Connexion LEKOL S&amp;H</h2><p class="muted">Utilise ton email ou ton code élève.</p>
    <form method="post" action="/connexion">${csrfField(req)}
    <label>Identifiant</label><input name="identifiant" autocomplete="username" required maxlength="254" placeholder="Email ou S&amp;H-1234">
    <label>Mot de passe</label><input type="password" name="password" autocomplete="current-password" required maxlength="200">
    <button class="full" type="submit">Se connecter</button></form></section>`));
});

app.post("/connexion", loginLimiter, async (req, res) => {
  const identifiant = String(req.body.identifiant || "").trim();
  const password = String(req.body.password || "");
  if (!identifiant || !password || identifiant.length > 254 || password.length > 200) {
    return res.redirect("/connexion");
  }

  try {
    const result = await pool.query(
      "SELECT * FROM utilisateurs WHERE lower(email)=lower($1) OR code_eleve=$1 LIMIT 1",
      [identifiant]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).send(page("Connexion",
        "<section class='card'><h2>Connexion impossible</h2><p>Identifiant ou mot de passe incorrect.</p><a class='btn' href='/connexion'>Réessayer</a></section>"));
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
        "<section class='card'><h2>Connexion impossible</h2><p>Identifiant ou mot de passe incorrect.</p><a class='btn' href='/connexion'>Réessayer</a></section>"));
    }

    const role = String(user.role || "").toUpperCase();
    if (!rolesAdmin.includes(role) && !["ELEVE", "PARENT"].includes(role)) {
      return res.status(403).send("Rôle de compte non autorisé.");
    }

    await new Promise((resolve, reject) =>
      req.session.regenerate(err => err ? reject(err) : resolve())
    );

    req.session.user = {
      id: user.id, nom: user.nom, prenom: user.prenom,
      role, classe_id: user.classe_id
    };
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");

    req.session.save(err => {
      if (err) {
        console.error(err);
        return res.status(500).send("Erreur de session.");
      }
      res.redirect(rolesAdmin.includes(role) ? "/admin" : "/espace-eleve");
    });
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur de connexion.");
  }
});

app.get("/deconnexion", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("lekolsid");
    res.redirect("/");
  });
});

// ROUTE ESPACE ÉLÈVE
app.get("/espace-eleve", requireStudent, async (req, res) => {
  const id = req.session.user.id;
  try {
    const er = await pool.query(`
      SELECT u.id,u.nom,u.prenom,u.code_eleve,u.email,u.classe_id,c.nom AS nom_classe
      FROM utilisateurs u LEFT JOIN classes c ON c.id=u.classe_id
      WHERE u.id=$1 AND u.role IN ('ELEVE','PARENT')`, [id]);

    if (!er.rows.length) return res.status(404).send("Compte élève introuvable.");
    const student = er.rows[0];

    const [pr, dr, nr, mr, hr] = await Promise.all([
      pool.query("SELECT statut,date_presence,remarque FROM presences WHERE eleve_id=$1 ORDER BY date_presence DESC LIMIT 200", [id]),
      student.classe_id
        ? pool.query("SELECT matiere,description,date_pour FROM devoirs WHERE classe_id=$1 ORDER BY date_pour ASC LIMIT 100", [student.classe_id])
        : Promise.resolve({ rows: [] }),
      pool.query("SELECT matiere,note,periode,date_saisie FROM notes WHERE eleve_id=$1 ORDER BY date_saisie DESC LIMIT 200", [id]),
      pool.query("SELECT id,sujet,contenu,date_envoi FROM messages WHERE destinataire_id=$1 ORDER BY date_envoi DESC LIMIT 100", [id]),
      student.classe_id
        ? pool.query("SELECT jour,creneau,titre,description FROM horaires WHERE classe_id=$1 ORDER BY id ASC", [student.classe_id])
        : Promise.resolve({ rows: [] })
    ]);

    const count = s => pr.rows.filter(p => p.statut === s).length;
    const presenceRows = pr.rows.map(p =>
      `<tr><td>${dateFr(p.date_presence)}</td><td>${h(p.statut)}</td><td>${h(p.remarque || "—")}</td></tr>`
    ).join("");

    const devoirRows = dr.rows.map(d =>
      `<article class="announcement"><h3>${h(d.matiere)}</h3><p>${h(d.description)}</p><small>À rendre le ${dateFr(d.date_pour)}</small></article>`
    ).join("") || "<p class='muted'>Aucun devoir affiché.</p>";

    const horaireRows = hr.rows.map(item =>
      `<tr><td><b>${h(item.jour)}</b> (${h(item.creneau)})</td><td><b>${h(item.titre)}</b><br><small>${h(item.description || "")}</small></td></tr>`
    ).join("") || "<tr><td colspan='2'>Aucun horaire publié pour ta classe.</td></tr>";

    const noteRows = nr.rows.map(n =>
      `<tr><td>${h(n.matiere)}</td><td><b>${h(n.note)} / 100</b></td><td>${h(n.periode)}</td><td>${dateFr(n.date_saisie)}</td></tr>`
    ).join("");

    const messageRows = mr.rows.map(m =>
      `<article class="message"><b>${h(m.sujet)}</b><p>${h(m.contenu).replace(/\n/g, "<br>")}</p><small>${dateFr(m.date_envoi)}</small></article>`
    ).join("") || "<p class='muted'>Aucun message reçu.</p>";

    const body = `<div data-user="true"></div>
      <section class="card"><h2>Bonjour ${h(student.prenom)} ${h(student.nom)} 👋</h2>
      <p>Code élève : <b>${h(student.code_eleve || "—")}</b> · Classe : <b>${h(student.nom_classe || "Non assignée")}</b></p></section>
      <div class="grid">
        <div class="stat"><strong>${count("PRESENT")}</strong>Présences</div>
        <div class="stat"><strong>${count("ABSENT")}</strong>Absences</div>
        <div class="stat"><strong>${count("RETARD")}</strong>Retards</div>
      </div>
      <section class="card"><h2>⏰ Emploi du temps de la classe</h2><div class="tablewrap"><table>
        <thead><tr><th>Jour & Créneau</th><th>Matière & Détails</th></tr></thead>
        <tbody>${horaireRows}</tbody>
      </table></div></section>
      <section class="card"><h2>📚 Devoirs et leçons</h2>${devoirRows}</section>
      <section class="card"><h2>📊 Notes</h2><div class="tablewrap"><table>
        <thead><tr><th>Matière</th><th>Note</th><th>Période</th><th>Date</th></tr></thead>
        <tbody>${noteRows || "<tr><td colspan='4'>Aucune note.</td></tr>"}</tbody>
      </table></div></section>
      <section class="card"><h2>📅 Présences et retards</h2><div class="tablewrap"><table>
        <thead><tr><th>Date</th><th>Statut</th><th>Remarque</th></tr></thead>
        <tbody>${presenceRows || "<tr><td colspan='3'>Aucune présence enregistrée.</td></tr>"}</tbody>
      </table></div></section>
      <section class="card"><h2>✉️ Messages de la direction</h2>${messageRows}</section>
      <section class="card"><h2>🔐 Mon profil</h2>
        <form method="post" action="/profil">${csrfField(req)}
        <label>Email de contact</label><input type="email" name="email" maxlength="254" value="${h(student.email || "")}">
        <label>Nouveau mot de passe (laisser vide pour ne pas changer)</label>
        <input type="password" name="password" minlength="8" maxlength="200" autocomplete="new-password">
        <button type="submit">Mettre à jour</button></form>
      </section>`;

    res.send(page("Espace élève", body));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement espace élève.");
  }
});

app.post("/profil", requireStudent, async (req, res) => {
  const email = String(req.body.email || "").trim() || null;
  const password = String(req.body.password || "");
  if (password && password.length < 8) {
    return res.status(400).send("Le nouveau mot de passe doit contenir au moins 8 caractères.");
  }
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query("UPDATE utilisateurs SET email=$1,mot_de_passe=$2 WHERE id=$3",
        [email, hash, req.session.user.id]);
    } else {
      await pool.query("UPDATE utilisateurs SET email=$1 WHERE id=$2",
        [email, req.session.user.id]);
    }
    res.redirect("/espace-eleve");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur mise à jour du profil.");
  }
});

// ROUTE ADMIN PRINCIPALE
app.get("/admin", requireAdmin, async (req, res) => {
  try {
    const [classes, annonces, students, presences, notes, messages] =
      await Promise.all([
        pool.query("SELECT id,nom,niveau FROM classes ORDER BY nom"),
        pool.query("SELECT id,titre,contenu,date_publication,publie_par FROM annonces ORDER BY date_publication DESC LIMIT 100"),
        pool.query(`
          SELECT u.id,u.nom,u.prenom,u.code_eleve,u.classe_id,
                 c.nom AS nom_classe
          FROM utilisateurs u
          LEFT JOIN classes c ON c.id=u.classe_id
          WHERE u.role='ELEVE'
          ORDER BY u.id DESC LIMIT 500
        `),
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE statut='PRESENT') AS presents,
            COUNT(*) FILTER (WHERE statut='ABSENT') AS absents,
            COUNT(*) FILTER (WHERE statut='RETARD') AS retards
          FROM presences WHERE date_presence=CURRENT_DATE
        `),
        pool.query("SELECT COUNT(*) AS total FROM notes"),
        pool.query("SELECT id,sujet,contenu,date_envoi,destinataire_id FROM messages ORDER BY date_envoi DESC LIMIT 50")
      ]);

    const studentOptions = students.rows.map(s =>
      `<option value="${s.id}">${h(s.nom)} ${h(s.prenom)} — ${h(s.code_eleve)} (${h(s.nom_classe || "Sans classe")})</option>`
    ).join("");

    const classOptions = classes.rows.map(c =>
      `<option value="${c.id}">${h(c.nom)} (${h(c.niveau || "")})</option>`
    ).join("");

    const studentRows = students.rows.map(s =>
      `<tr><td><b>${h(s.code_eleve)}</b></td><td>${h(s.nom)} ${h(s.prenom)}</td><td>${h(s.nom_classe || "Non assignée")}</td></tr>`
    ).join("");

    const announcementRows = annonces.rows.map(a => `
      <tr>
        <td><b>${h(a.titre)}</b><br><small>${h(a.contenu)}</small></td>
        <td>${dateFr(a.date_publication)}</td>
        <td>
          <form method="post" action="/admin/annonce/supprimer/${a.id}">
            ${csrfField(req)}
            <button class="btn danger" type="submit">Supprimer</button>
          </form>
        </td>
      </tr>
    `).join("");

    const messageRows = messages.rows.map(m => `
      <tr>
        <td>${h(m.sujet)}</td>
        <td>${h(m.destinataire_id)}</td>
        <td>${dateFr(m.date_envoi)}</td>
        <td>
          <form method="post" action="/admin/message/supprimer/${m.id}">
            ${csrfField(req)}
            <button class="btn danger" type="submit">Supprimer</button>
          </form>
        </td>
      </tr>
    `).join("");

    const stats = presences.rows[0];

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>⚙️ Administration — LEKOL S&amp;H</h2>
        <p>Connecté en tant que <b>${h(req.session.user.role)}</b>.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:15px;">
          <a class="btn" href="/admin/appel">📝 Prise d'appel par classe</a>
          <a class="btn secondary" href="/admin/horaires">⏰ Gestion des horaires</a>
        </div>
      </section>

      <div class="grid">
        <div class="stat"><strong>${students.rows.length}</strong>Élèves listés</div>
        <div class="stat"><strong>${h(stats.presents || 0)}</strong>Présents aujourd'hui</div>
        <div class="stat"><strong>${h(stats.absents || 0)}</strong>Absents aujourd'hui</div>
        <div class="stat"><strong>${h(notes.rows[0].total || 0)}</strong>Notes enregistrées</div>
      </div>

      <section class="card">
        <h2>➕ Inscrire un élève</h2>
        <form method="post" action="/admin/eleve">
          ${csrfField(req)}
          <div class="grid">
            <div><label>Nom</label><input name="nom" required maxlength="100"></div>
            <div><label>Prénom</label><input name="prenom" required maxlength="100"></div>
          </div>
          <label>Classe</label>
          <select name="classe_id" required>
            <option value="">Choisir une classe</option>${classOptions}
          </select>
          <label>Email (facultatif)</label>
          <input type="email" name="email" maxlength="254">
          <label>Mot de passe initial</label>
          <input type="password" name="password" required minlength="8" maxlength="200" value="ecole2026">
          <button type="submit">Créer le compte élève & Générer son Code</button>
        </form>
      </section>

      <section class="card">
        <h2>📊 Ajouter une note</h2>
        <form method="post" action="/admin/note">
          ${csrfField(req)}
          <label>Élève</label>
          <select name="eleve_id" required>
            <option value="">Choisir un élève</option>${studentOptions}
          </select>
          <label>Matière</label>
          <input name="matiere" required maxlength="100">
          <div class="grid">
            <div>
              <label>Note sur 100</label>
              <input type="number" name="note" min="0" max="100" step="0.5" required>
            </div>
            <div>
              <label>Période</label>
              <input name="periode" required maxlength="100" placeholder="Ex. 1er contrôle">
            </div>
          </div>
          <button type="submit">Enregistrer la note</button>
        </form>
      </section>

      <section class="card">
        <h2>📢 Publier une annonce</h2>
        <form method="post" action="/admin/annonce">
          ${csrfField(req)}
          <label>Titre</label><input name="titre" required maxlength="200">
          <label>Contenu</label><textarea name="contenu" required maxlength="10000"></textarea>
          <button type="submit">Publier</button>
        </form>
        <div class="tablewrap"><table>
          <thead><tr><th>Annonce</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>${announcementRows || "<tr><td colspan='3'>Aucune annonce</td></tr>"}</tbody>
        </table></div>
      </section>

      <section class="card">
        <h2>✉️ Écrire à un élève ou parent</h2>
        <form method="post" action="/admin/message">
          ${csrfField(req)}
          <label>Destinataire</label>
          <select name="destinataire_id" required>
            <option value="">Choisir un compte</option>${studentOptions}
          </select>
          <label>Sujet</label><input name="sujet" required maxlength="200">
          <label>Message</label><textarea name="contenu" required maxlength="10000"></textarea>
          <button type="submit">Envoyer le message</button>
        </form>
        <h3>Messages récents</h3>
        <div class="tablewrap"><table>
          <thead><tr><th>Sujet</th><th>ID destinataire</th><th>Date</th><th>Action</th></tr></thead>
          <tbody>${messageRows || "<tr><td colspan='4'>Aucun message</td></tr>"}</tbody>
        </table></div>
      </section>

      <section class="card">
        <h2>👩‍🎓 Liste des élèves</h2>
        <label>Rechercher par nom, code ou classe</label>
        <input id="search" placeholder="Commencer à taper...">
        <div class="tablewrap"><table id="students">
          <thead><tr><th>Code élève</th><th>Nom & Prénom</th><th>Classe</th></tr></thead>
          <tbody>${studentRows || "<tr><td colspan='3'>Aucun élève</td></tr>"}</tbody>
        </table></div>
      </section>

      <section class="card">
        <h2>📈 Rapports scolaires</h2>
        <p>Présents : <b>${h(stats.presents || 0)}</b> ·
        Absents : <b>${h(stats.absents || 0)}</b> ·
        Retards : <b>${h(stats.retards || 0)}</b></p>
        <a class="btn secondary" href="/admin/rapport.csv">Exporter les présences CSV</a>
      </section>

      <script>
      document.getElementById("search").addEventListener("input", function() {
        const q = this.value.toLowerCase();
        document.querySelectorAll("#students tbody tr").forEach(row => {
          row.style.display = row.innerText.toLowerCase().includes(q) ? "" : "none";
        });
      });
      </script>`;

    res.send(page("Administration", body));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement admin. Vérifie la base de données.");
  }
});

// ROUTE : PRISE D'APPEL PAR CLASSE (AVEC RADIO BUTTONS)
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

      if (students.rows.length === 0) {
        studentRows = `<tr><td colspan='2'>Aucun élève dans cette classe.</td></tr>`;
      } else {
        studentRows = students.rows.map(s => `
          <tr>
            <td><b>${h(s.nom)} ${h(s.prenom)}</b><br><small>${h(s.code_eleve)}</small></td>
            <td>
              <label style="display:inline-block;margin-right:15px;"><input type="radio" name="statut_${s.id}" value="PRESENT" checked> Présent</label>
              <label style="display:inline-block;margin-right:15px;"><input type="radio" name="statut_${s.id}" value="ABSENT"> Absent</label>
              <label style="display:inline-block;"><input type="radio" name="statut_${s.id}" value="RETARD"> Retard</label>
            </td>
          </tr>
        `).join("");
      }
    }

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>📝 Liste d'appel par classe</h2>
        <p><a class="btn secondary" href="/admin">← Retour au tableau de bord</a></p>
        <form method="get" action="/admin/appel">
          <label>Sélectionner la classe</label>
          <select name="classe_id" onchange="this.form.submit()" required>
            <option value="">-- Choisir une classe --</option>${classOptions}
          </select>
          <label>Date de l'appel</label>
          <input type="date" name="date" value="${dateAppel}" onchange="this.form.submit()" required>
        </form>
      </section>

      ${classeId ? `
      <section class="card">
        <h2>Faire l'appel pour la date du ${dateFr(dateAppel)}</h2>
        <form method="post" action="/admin/appel/valider">
          ${csrfField(req)}
          <input type="hidden" name="classe_id" value="${classeId}">
          <input type="hidden" name="date_presence" value="${dateAppel}">
          <div class="tablewrap"><table>
            <thead><tr><th>Élève</th><th>Statut de présence</th></tr></thead>
            <tbody>${studentRows}</tbody>
          </table></div>
          <br>
          <button type="submit">Enregistrer l'appel de la classe</button>
        </form>
      </section>` : ""}`;

    res.send(page("Prise d'appel", body));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement prise d'appel.");
  }
});

app.post("/admin/appel/valider", requireAdmin, async (req, res) => {
  const datePresence = String(req.body.date_presence || today());
  const classeId = Number(req.body.classe_id);

  if (!Number.isInteger(classeId) || !/^\d{4}-\d{2}-\d{2}$/.test(datePresence)) {
    return res.status(400).send("Données invalides.");
  }

  try {
    const students = await pool.query(
      "SELECT id FROM utilisateurs WHERE role='ELEVE' AND classe_id=$1",
      [classeId]
    );

    for (const s of students.rows) {
      const statut = req.body[`statut_${s.id}`] || "PRESENT";
      if (["PRESENT", "ABSENT", "RETARD"].includes(statut)) {
        await pool.query("DELETE FROM presences WHERE eleve_id=$1 AND date_presence=$2", [s.id, datePresence]);
        await pool.query(
          "INSERT INTO presences (eleve_id, statut, date_presence) VALUES ($1, $2, $3)",
          [s.id, statut, datePresence]
        );
      }
    }

    res.redirect(`/admin/appel?classe_id=${classeId}&date=${datePresence}`);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur enregistrement de l'appel.");
  }
});

// ROUTE : GESTION DES HORAIRES
app.get("/admin/horaires", requireAdmin, async (req, res) => {
  try {
    const [classes, horaires] = await Promise.all([
      pool.query("SELECT id, nom, niveau FROM classes ORDER BY nom"),
      pool.query(`
        SELECT h.id, h.titre, h.description, h.jour, h.creneau, c.nom AS nom_classe 
        FROM horaires h 
        LEFT JOIN classes c ON c.id = h.classe_id 
        ORDER BY h.id DESC
      `)
    ]);

    const classOptions = classes.rows.map(c => 
      `<option value="${c.id}">${h(c.nom)} (${h(c.niveau || "")})</option>`
    ).join("");

    const horaireRows = horaires.rows.map(item => `
      <tr>
        <td><b>${h(item.nom_classe)}</b></td>
        <td>${h(item.jour)} (${h(item.creneau)})</td>
        <td><b>${h(item.titre)}</b><br><small>${h(item.description)}</small></td>
        <td>
          <form method="post" action="/admin/horaires/supprimer/${item.id}">
            ${csrfField(req)}
            <button class="btn danger" type="submit">Supprimer</button>
          </form>
        </td>
      </tr>
    `).join("");

    const body = `<div data-user="true"></div>
      <section class="card">
        <h2>⏰ Gestion des Horaires & Emplois du Temps</h2>
        <p><a class="btn secondary" href="/admin">← Retour au tableau de bord</a></p>
      </section>

      <section class="card">
        <h2>Ajouter un cours / horaire</h2>
        <form method="post" action="/admin/horaires">
          ${csrfField(req)}
          <label>Classe</label>
          <select name="classe_id" required>
            <option value="">Choisir une classe</option>${classOptions}
          </select>
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
            <div>
              <label>Créneau horaire</label>
              <input name="creneau" required placeholder="Ex. 08:00 - 09:30" maxlength="100">
            </div>
          </div>
          <label>Matière / Titre</label>
          <input name="titre" required placeholder="Ex. Mathématiques" maxlength="200">
          <label>Description / Professeur</label>
          <textarea name="description" placeholder="Ex. Salle 3, avec Prof. Jean" maxlength="500"></textarea>
          <button type="submit">Enregistrer l'horaire</button>
        </form>
      </section>

      <section class="card">
        <h2>Emplois du temps enregistrés</h2>
        <div class="tablewrap"><table>
          <thead><tr><th>Classe</th><th>Jour & Heure</th><th>Matière / Détails</th><th>Action</th></tr></thead>
          <tbody>${horaireRows || "<tr><td colspan='4'>Aucun horaire enregistré.</td></tr>"}</tbody>
        </table></div>
      </section>`;

    res.send(page("Horaires", body));
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur chargement horaires.");
  }
});

app.post("/admin/horaires", requireAdmin, async (req, res) => {
  const classeId = Number(req.body.classe_id);
  const titre = String(req.body.titre || "").trim();
  const description = String(req.body.description || "").trim();
  const jour = String(req.body.jour || "").trim();
  const creneau = String(req.body.creneau || "").trim();

  if (!Number.isInteger(classeId) || classeId < 1 || !titre || !jour || !creneau) {
    return res.status(400).send("Données horaires invalides.");
  }

  try {
    await pool.query(
      "INSERT INTO horaires (classe_id, titre, description, jour, creneau) VALUES ($1, $2, $3, $4, $5)",
      [classeId, titre, description, jour, creneau]
    );
    res.redirect("/admin/horaires");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur enregistrement horaire.");
  }
});

app.post("/admin/horaires/supprimer/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).send("ID invalide.");
  try {
    await pool.query("DELETE FROM horaires WHERE id=$1", [id]);
    res.redirect("/admin/horaires");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur suppression horaire.");
  }
});

// ACTIONS POST ADMIN DIVERSES
app.post("/admin/eleve", requireAdmin, async (req, res) => {
  const nom = String(req.body.nom || "").trim();
  const prenom = String(req.body.prenom || "").trim();
  const email = String(req.body.email || "").trim() || null;
  const password = String(req.body.password || "");
  const classeId = Number(req.body.classe_id);

  if (!nom || !prenom || !Number.isInteger(classeId) || classeId < 1 ||
      password.length < 8 || password.length > 200) {
    return res.status(400).send("Données invalides. Le mot de passe doit contenir au moins 8 caractères.");
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    let code = null;

    for (let i = 0; i < 10; i++) {
      const candidate = "S&H-" + crypto.randomInt(1000, 10000);
      const exists = await pool.query(
        "SELECT 1 FROM utilisateurs WHERE code_eleve=$1", [candidate]
      );
      if (!exists.rowCount) {
        code = candidate;
        break;
      }
    }

    if (!code) return res.status(500).send("Impossible de générer un code unique. Réessaie.");

    await pool.query(
      `INSERT INTO utilisateurs
       (nom,prenom,email,code_eleve,mot_de_passe,role,classe_id)
       VALUES ($1,$2,$3,$4,$5,'ELEVE',$6)`,
      [nom, prenom, email, code, hash, classeId]
    );

    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur inscription.");
  }
});

app.post("/admin/note", requireAdmin, async (req, res) => {
  const id = Number(req.body.eleve_id);
  const matiere = String(req.body.matiere || "").trim();
  const note = Number(req.body.note);
  const periode = String(req.body.periode || "").trim();

  if (!Number.isInteger(id) || id < 1 || !matiere || matiere.length > 100 ||
      !Number.isFinite(note) || note < 0 || note > 100 ||
      !periode || periode.length > 100) {
    return res.status(400).send("Données de note invalides.");
  }

  try {
    const check = await pool.query(
      "SELECT 1 FROM utilisateurs WHERE id=$1 AND role='ELEVE'", [id]
    );
    if (!check.rowCount) return res.status(400).send("Élève introuvable.");

    await pool.query(
      "INSERT INTO notes (eleve_id,matiere,note,periode) VALUES ($1,$2,$3,$4)",
      [id, matiere, note, periode]
    );
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur enregistrement note.");
  }
});

app.post("/admin/annonce", requireAdmin, async (req, res) => {
  const titre = String(req.body.titre || "").trim();
  const contenu = String(req.body.contenu || "").trim();

  if (!titre || !contenu || titre.length > 200 || contenu.length > 10000) {
    return res.status(400).send("Annonce invalide.");
  }

  try {
    await pool.query(
      "INSERT INTO annonces (titre,contenu,publie_par) VALUES ($1,$2,$3)",
      [titre, contenu, `Direction - ${req.session.user.nom || "LEKOL S&H"}`]
    );
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur ajout annonce.");
  }
});

app.post("/admin/annonce/supprimer/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).send("ID invalide.");

  try {
    await pool.query("DELETE FROM annonces WHERE id=$1", [id]);
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur suppression annonce.");
  }
});

app.post("/admin/message", requireAdmin, async (req, res) => {
  const id = Number(req.body.destinataire_id);
  const sujet = String(req.body.sujet || "").trim();
  const contenu = String(req.body.contenu || "").trim();

  if (!Number.isInteger(id) || id < 1 || !sujet || !contenu ||
      sujet.length > 200 || contenu.length > 10000) {
    return res.status(400).send("Message invalide.");
  }

  try {
    const check = await pool.query(
      "SELECT 1 FROM utilisateurs WHERE id=$1 AND role IN ('ELEVE','PARENT')", [id]
    );
    if (!check.rowCount) return res.status(400).send("Destinataire introuvable.");

    await pool.query(
      "INSERT INTO messages (expediteur_id,destinataire_id,sujet,contenu) VALUES ($1,$2,$3,$4)",
      [req.session.user.id, id, sujet, contenu]
    );
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur envoi message.");
  }
});

app.post("/admin/message/supprimer/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).send("ID invalide.");

  try {
    await pool.query("DELETE FROM messages WHERE id=$1", [id]);
    res.redirect("/admin");
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur suppression message.");
  }
});

app.get("/admin/rapport.csv", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT u.code_eleve,u.nom,u.prenom,c.nom AS classe,
             p.date_presence,p.statut,p.remarque
      FROM presences p
      JOIN utilisateurs u ON u.id=p.eleve_id
      LEFT JOIN classes c ON c.id=u.classe_id
      ORDER BY p.date_presence DESC LIMIT 5000
    `);

    const csvCell = value =>
      '"' + String(value ?? "").replace(/"/g, '""') + '"';

    const csv = [
      "Code élève,Nom,Prénom,Classe,Date,Statut,Remarque",
      ...rows.map(r => [
        r.code_eleve, r.nom, r.prenom, r.classe,
        dateFr(r.date_presence), r.statut, r.remarque
      ].map(csvCell).join(","))
    ].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition",
      'attachment; filename="rapport-presences-lekol.csv"');
    res.send("\uFEFF" + csv);
  } catch (e) {
    console.error(e);
    res.status(500).send("Erreur export CSV.");
  }
});

// GESTION DES ERREURS ET 404
app.use((req, res) => {
  res.status(404).send(page("Page introuvable",
    "<section class='card'><h2>Page introuvable</h2><p>Cette page n'existe pas.</p><a class='btn' href='/'>Retour à l'accueil</a></section>"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send("Une erreur serveur est survenue.");
});

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Connexion PostgreSQL établie.");
    app.listen(port, () => console.log(`🚀 LEKOL S&H écoute sur le port ${port}`));
  } catch (e) {
    console.error("❌ Connexion PostgreSQL impossible:", e.message);
    process.exit(1);
  }
}

start();
