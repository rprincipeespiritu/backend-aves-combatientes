const PG_VARIABLES = {
  host: "PGHOST",
  port: "PGPORT",
  database: "PGDATABASE",
  user: "PGUSER",
  password: "PGPASSWORD",
};

function configurePostgres(db, env = process.env) {
  if (db?.kind !== "postgres") return;
  const credentials = db.credentials ||= {};
  credentials.host ||= credentials.hostname;
  credentials.database ||= credentials.dbname;
  credentials.user ||= credentials.username;
  for (const [key, variable] of Object.entries(PG_VARIABLES)) {
    // Explicit CAP values win; resolve the legacy pg profile placeholders too.
    if (credentials[key] == null || credentials[key] === "" || credentials[key] === `{env:${variable}}`) {
      credentials[key] = env[variable];
    }
  }
  if (env.NODE_ENV === "production") {
    const missing = ["host", "database", "user", "password"].filter((key) => !credentials[key]);
    if (missing.length) {
      throw new Error(`Faltan credenciales PostgreSQL: ${missing.map((key) => PG_VARIABLES[key]).join(", ")}. Configuralas en el backend de Railway o usa CDS_REQUIRES_DB_CREDENTIALS.`);
    }
    if (typeof credentials.password !== "string") {
      throw new Error("La contrasena PostgreSQL debe ser texto. Usa PGPASSWORD o CDS_REQUIRES_DB_CREDENTIALS como JSON.");
    }
  }
}

module.exports = { configurePostgres };
