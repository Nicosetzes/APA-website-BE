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

const TEST_USERS = [
    {
        email: "admin@admin.com",
        password: "admin123",
        nickname: "Nico - DEV",
        role: "superadmin",
    },
    {
        email: "user1@user.com",
        password: "user123",
        nickname: "Pedro - DEV",
        role: "user",
    },
    {
        email: "user2@user.com",
        password: "user123",
        nickname: "Pablo - DEV",
        role: "user",
    },
    {
        email: "user3@user.com",
        password: "user123",
        nickname: "Juan - DEV",
        role: "user",
    },
    {
        email: "user4@user.com",
        password: "user123",
        nickname: "Flor - DEV",
        role: "user",
    },
    {
        email: "user5@user.com",
        password: "user123",
        nickname: "Cami - DEV",
        role: "user",
    },
]

const TEST_TEAMS = [
    { id: "435", name: "River Plate" },
    { id: "436", name: "Racing Club" },
    { id: "451", name: "Boca Juniors" },
    { id: "453", name: "Independiente" },
    { id: "460", name: "San Lorenzo" },
    { id: "440", name: "Belgrano Cordoba" },
]

module.exports = {
    KNOWN_PRODUCTION_DATABASE_NAMES,
    TEST_DATABASE_NAME_PATTERN,
    TEST_TEAMS,
    TEST_USERS,
    isTestDatabaseName,
}
