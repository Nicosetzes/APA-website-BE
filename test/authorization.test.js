const assert = require("node:assert/strict")
const test = require("node:test")
const jwt = require("jsonwebtoken")

const editsModel = require("../dao/models/edits")
const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const {
    isAuth,
    requireEditOwnership,
    requireMatchInTournament,
    requireTournamentAccess,
} = require("../router/auth")

const createResponse = () => ({
    headers: {},
    set(name, value) {
        this.headers[name] = value
        return this
    },
})

const runMiddleware = async (middleware, request) => {
    const response = createResponse()
    let allowed = false
    let error

    await middleware(request, response, (nextError) => {
        if (nextError) {
            error = nextError
        } else {
            allowed = true
        }
    })

    return { allowed, error, response }
}

test("authentication rejects missing credentials with 401", async () => {
    const result = await runMiddleware(isAuth, { headers: {} })

    assert.equal(result.allowed, false)
    assert.equal(result.error.status, 401)
    assert.equal(result.error.code, "INVALID_SESSION")
    assert.equal(result.response.headers["WWW-Authenticate"], "Bearer")
})

test("authentication loads the current role from the database", async (t) => {
    const originalFindById = usersModel.findById
    const originalSecret = process.env.TOKEN_SECRET
    t.after(() => {
        usersModel.findById = originalFindById
        process.env.TOKEN_SECRET = originalSecret
    })

    process.env.TOKEN_SECRET = "test-secret"
    usersModel.findById = () => ({
        select: () => ({
            lean: async () => ({
                _id: "111111111111111111111111",
                nickname: "Nico",
                role: "superadmin",
            }),
        }),
    })
    const token = jwt.sign(
        { id: "111111111111111111111111" },
        process.env.TOKEN_SECRET,
        { expiresIn: "1m" }
    )
    const request = { headers: { authorization: `Bearer ${token}` } }

    const result = await runMiddleware(isAuth, request)

    assert.equal(result.allowed, true)
    assert.deepEqual(request.user, {
        id: "111111111111111111111111",
        name: "Nico",
        role: "superadmin",
    })
})

test("tournament participants and superadmin are allowed, outsiders are denied", async (t) => {
    const originalFindById = tournamentsModel.findById
    t.after(() => {
        tournamentsModel.findById = originalFindById
    })

    tournamentsModel.findById = () => ({
        select: () => ({
            lean: async () => ({
                players: [{ id: "111111111111111111111111" }],
                teams: [],
            }),
        }),
    })

    const middleware = requireTournamentAccess()
    const createRequest = (user) => ({
        params: { tournament: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        user,
    })

    const participant = await runMiddleware(
        middleware,
        createRequest({ id: "111111111111111111111111", role: "user" })
    )
    const outsider = await runMiddleware(
        middleware,
        createRequest({ id: "222222222222222222222222", role: "user" })
    )
    const superadmin = await runMiddleware(
        middleware,
        createRequest({
            id: "222222222222222222222222",
            role: "superadmin",
        })
    )

    assert.equal(participant.allowed, true)
    assert.equal(outsider.allowed, false)
    assert.equal(outsider.error.status, 403)
    assert.equal(outsider.error.code, "FORBIDDEN")
    assert.equal(superadmin.allowed, true)
})

test("a match cannot be mutated through a different tournament", async (t) => {
    const originalFindById = matchesModel.findById
    t.after(() => {
        matchesModel.findById = originalFindById
    })

    matchesModel.findById = () => ({
        select: () => ({
            lean: async () => ({
                tournament: { id: "aaaaaaaaaaaaaaaaaaaaaaaa" },
            }),
        }),
    })

    const sameTournament = await runMiddleware(requireMatchInTournament, {
        params: {
            match: "bbbbbbbbbbbbbbbbbbbbbbbb",
            tournament: "aaaaaaaaaaaaaaaaaaaaaaaa",
        },
    })
    const otherTournament = await runMiddleware(requireMatchInTournament, {
        params: {
            match: "bbbbbbbbbbbbbbbbbbbbbbbb",
            tournament: "cccccccccccccccccccccccc",
        },
    })

    assert.equal(sameTournament.allowed, true)
    assert.equal(otherTournament.allowed, false)
    assert.equal(otherTournament.error.status, 404)
    assert.equal(otherTournament.error.code, "MATCH_NOT_FOUND")
})

test("edits can only be deleted by their owner or a superadmin", async (t) => {
    const originalFindById = editsModel.findById
    t.after(() => {
        editsModel.findById = originalFindById
    })

    editsModel.findById = async () => ({
        user: "111111111111111111111111",
    })

    const createRequest = (user) => ({
        params: { id: "aaaaaaaaaaaaaaaaaaaaaaaa" },
        user,
    })

    const owner = await runMiddleware(
        requireEditOwnership,
        createRequest({ id: "111111111111111111111111", role: "user" })
    )
    const outsider = await runMiddleware(
        requireEditOwnership,
        createRequest({ id: "222222222222222222222222", role: "user" })
    )
    const superadmin = await runMiddleware(
        requireEditOwnership,
        createRequest({
            id: "222222222222222222222222",
            role: "superadmin",
        })
    )

    assert.equal(owner.allowed, true)
    assert.equal(outsider.allowed, false)
    assert.equal(outsider.error.status, 403)
    assert.equal(superadmin.allowed, true)
})
