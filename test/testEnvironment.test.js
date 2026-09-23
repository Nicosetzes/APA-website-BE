const assert = require("node:assert/strict")
const test = require("node:test")

const usersModel = require("../dao/models/users")
const schemas = require("../validation/requestSchemas")
const { TEST_USERS } = require("../scripts/testEnvironment")

test("los usuarios de prueba cubren los dos roles", () => {
    const roles = new Set(TEST_USERS.map((user) => user.role))

    assert.equal(roles.has("superadmin"), true)
    assert.equal(roles.has("user"), true)
})

test("los usuarios de prueba pasan el schema real de login", () => {
    // Joi valida el TLD contra la lista de la IANA: un fixture con `.local` o
    // `.test` crea usuarios que después no pueden loguearse.
    for (const user of TEST_USERS) {
        const { error } = schemas.login.body.validate({
            email: user.email,
            password: user.password,
        })

        assert.equal(
            error,
            undefined,
            `${user.email} no pasa el schema de login: ${error?.message}`
        )
    }
})

test("los usuarios de prueba cumplen las restricciones del modelo", () => {
    for (const user of TEST_USERS) {
        const candidate = new usersModel({
            email: user.email,
            password: "$2b$10$" + "x".repeat(53),
            nickname: user.nickname,
            role: user.role,
        })

        assert.equal(candidate.validateSync(), undefined)
    }
})
