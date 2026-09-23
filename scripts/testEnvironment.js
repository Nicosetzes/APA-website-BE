/*
 * Fixtures compartidos por los scripts que escriben.
 *
 * El allowlist de bases vive en `config/databaseSafety.js`, porque también lo
 * usa el arranque del server.
 */

const {
    isTestDatabaseName,
    KNOWN_PRODUCTION_DATABASE_NAMES,
    TEST_DATABASE_NAME_PATTERN,
} = require("../config/databaseSafety")

// Contraseñas deliberadamente públicas: sólo existen en la base de pruebas.
//
// El dominio usa un TLD real a propósito. El schema de login valida el email
// con Joi, que verifica el TLD contra la lista de la IANA, así que `.local` y
// `.test` son rechazados aunque el modelo de users los acepte.
const TEST_USERS = [
    {
        email: "superadmin@apa-dev.dev",
        password: "apa-dev-superadmin",
        nickname: "DevSuperadmin",
        role: "superadmin",
    },
    {
        email: "jugador1@apa-dev.dev",
        password: "apa-dev-jugador1",
        nickname: "DevJugadorUno",
        role: "user",
    },
    {
        email: "jugador2@apa-dev.dev",
        password: "apa-dev-jugador2",
        nickname: "DevJugadorDos",
        role: "user",
    },
    {
        email: "jugador3@apa-dev.dev",
        password: "apa-dev-jugador3",
        nickname: "DevJugadorTres",
        role: "user",
    },
]

// Equipos reales del catálogo de football-database, para que los logos del FE
// resuelvan igual que en producción.
const TEST_TEAMS = [
    { id: "435", name: "Racing Club" },
    { id: "451", name: "Boca Juniors" },
    { id: "460", name: "Independiente" },
]

module.exports = {
    KNOWN_PRODUCTION_DATABASE_NAMES,
    TEST_DATABASE_NAME_PATTERN,
    TEST_TEAMS,
    TEST_USERS,
    isTestDatabaseName,
}
