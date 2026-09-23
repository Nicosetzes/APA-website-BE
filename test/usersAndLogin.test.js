const assert = require("node:assert/strict")
const test = require("node:test")

const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")
const { createGetUsers } = require("../controller/getUsers")
const { createPostLogin } = require("../controller/postLogin")

const createResponse = () => ({
    statusCode: null,
    body: null,
    status(code) {
        this.statusCode = code
        return this
    },
    json(body) {
        this.body = body
        return this
    },
    send(body) {
        this.body = body
        return this
    },
})

const runValidation = (schema, request) =>
    new Promise((resolve) => {
        validateRequest(schema)(request, {}, (error) => {
            resolve(error)
        })
    })

const USER = {
    _id: "630abc35b2e0801cf5448429",
    nickname: "Nico",
    password: "hashed",
    role: "superadmin",
}

const createLoginController = (overrides = {}) =>
    createPostLogin({
        retrieveUserByUserName: async () => USER,
        comparePassword: async () => true,
        signToken: () => "signed-token",
        ...overrides,
    })

test("users listing maps ids and nicknames", async () => {
    const controller = createGetUsers({
        retrieveAllUsers: async () => [
            { _id: "1", nickname: "Nico", password: "hashed" },
            { _id: "2", nickname: "Santi", password: "hashed" },
        ],
    })
    const response = createResponse()

    await controller({}, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, [
        { id: "1", name: "Nico" },
        { id: "2", name: "Santi" },
    ])
})

test("users listing propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetUsers({
        retrieveAllUsers: async () => {
            throw expectedError
        },
    })

    await assert.rejects(controller({}, createResponse()), expectedError)
})

test("login returns the session contract on valid credentials", async () => {
    let receivedEmail
    let receivedPayload
    const controller = createLoginController({
        retrieveUserByUserName: async (email) => {
            receivedEmail = email
            return USER
        },
        signToken: (payload) => {
            receivedPayload = payload
            return "signed-token"
        },
    })
    const response = createResponse()

    await controller(
        { body: { email: "nico@apa.com", password: "secret" } },
        response
    )

    assert.equal(receivedEmail, "nico@apa.com")
    assert.deepEqual(receivedPayload, { id: USER._id, name: "Nico" })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, {
        auth: true,
        token: "signed-token",
        user: {
            id: USER._id,
            nickname: "Nico",
            role: "superadmin",
        },
        message: "Bienvenid@ Nico",
    })
})

test("login defaults the role to user", async () => {
    const controller = createLoginController({
        retrieveUserByUserName: async () => ({
            _id: "1",
            nickname: "Santi",
            password: "hashed",
        }),
    })
    const response = createResponse()

    await controller(
        { body: { email: "santi@apa.com", password: "secret" } },
        response
    )

    assert.equal(response.body.user.role, "user")
})

test("login answers the same 401 for unknown user and wrong password", async () => {
    const unknownUser = createLoginController({
        retrieveUserByUserName: async () => null,
        comparePassword: async () => false,
    })
    const wrongPassword = createLoginController({
        comparePassword: async () => false,
    })

    const errors = []

    for (const controller of [unknownUser, wrongPassword]) {
        await assert.rejects(
            controller(
                { body: { email: "nico@apa.com", password: "bad" } },
                createResponse()
            ),
            (error) => {
                errors.push({
                    status: error.status,
                    code: error.code,
                    message: error.message,
                })
                return true
            }
        )
    }

    assert.equal(errors.length, 2)
    assert.deepEqual(errors[0], errors[1])
    assert.equal(errors[0].status, 401)
    assert.equal(errors[0].code, "INVALID_CREDENTIALS")
})

test("login hashes against a dummy when the user does not exist", async () => {
    const comparedHashes = []
    const controller = createLoginController({
        retrieveUserByUserName: async () => null,
        comparePassword: async (_password, hash) => {
            comparedHashes.push(hash)
            return false
        },
    })

    await assert.rejects(
        controller(
            { body: { email: "ghost@apa.com", password: "secret" } },
            createResponse()
        ),
        (error) => error.code === "INVALID_CREDENTIALS"
    )

    // Se compara igual, para no filtrar por tiempo si el email existe.
    assert.equal(comparedHashes.length, 1)
    assert.ok(comparedHashes[0].startsWith("$2b$"))
})

test("login propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createLoginController({
        retrieveUserByUserName: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller(
            { body: { email: "nico@apa.com", password: "secret" } },
            createResponse()
        ),
        expectedError
    )
})

test("users listing validation rejects query and body", async () => {
    assert.equal(
        await runValidation(schemas.getUsers, {
            params: {},
            query: {},
            body: {},
        }),
        undefined
    )

    const error = await runValidation(schemas.getUsers, {
        params: {},
        query: { query: "nico" },
        body: {},
    })

    assert.ok(error)
    assert.equal(error.status, 400)
    assert.equal(error.code, "VALIDATION_ERROR")
})
