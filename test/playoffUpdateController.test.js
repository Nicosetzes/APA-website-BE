const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createPostPlayoffUpdateByTournamentId,
    validatePlayoffState,
} = require("../controller/postPlayoffUpdateByTournamentId")

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
})

const createController = (overrides = {}) =>
    createPostPlayoffUpdateByTournamentId({
        retrieveTournamentById: async () => ({
            id: "tournament",
            name: "Tournament",
            format: "world_cup",
        }),
        retrievePlayoffMatchesByTournamentId: async () => [
            { playoff_id: 1, played: false },
        ],
        generatePlayoffUpdate: async () => ({ created: [], updated: [] }),
        withTransaction: (work) => work({ id: "session" }),
        ...overrides,
    })

const request = {
    params: { tournament: "tournament" },
    body: { round: 2 },
}

test("playoff update returns canonical tournament not-found", async () => {
    const controller = createController({
        retrieveTournamentById: async () => null,
    })

    const error = await controller(request, createResponse()).catch(
        (caughtError) => caughtError
    )

    assert.equal(error.status, 404)
    assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
})

test("playoff update rejects unsupported formats", async () => {
    for (const format of ["league", "champions_league"]) {
        const controller = createController({
            retrieveTournamentById: async () => ({
                id: "tournament",
                name: "Tournament",
                format,
            }),
        })
        const error = await controller(request, createResponse()).catch(
            (caughtError) => caughtError
        )

        assert.equal(error.status, 422)
        assert.equal(error.code, "PLAYOFF_UPDATE_UNSUPPORTED")
    }
})

test("playoff update reports an absent bracket as not ready", async () => {
    const controller = createController({
        retrievePlayoffMatchesByTournamentId: async () => [],
    })

    const error = await controller(request, createResponse()).catch(
        (caughtError) => caughtError
    )

    assert.equal(error.status, 409)
    assert.equal(error.code, "PLAYOFF_NOT_READY")
})

test("supported formats use their explicit bracket size and one session", async () => {
    const formats = new Map([
        ["playoff", 32],
        ["world_cup_2026", 32],
        ["world_cup", 16],
        ["league_playin_playoff", 16],
        ["super_cup", 16],
    ])

    for (const [format, expectedSize] of formats) {
        const session = { id: format }
        const received = []
        const controller = createController({
            retrieveTournamentById: async (...args) => {
                received.push(["tournament", args.at(-1)])
                return { id: "tournament", name: "Tournament", format }
            },
            retrievePlayoffMatchesByTournamentId: async (...args) => {
                received.push(["matches", args.at(-1)])
                return [{ playoff_id: 1, played: false }]
            },
            generatePlayoffUpdate: async (...args) => {
                received.push(["generate", args.at(-1), args[2]])
                return { created: [], updated: [] }
            },
            withTransaction: (work) => work(session),
        })

        await controller(request, createResponse())

        assert.deepEqual(
            received.map(([name, options]) => [name, options.session]),
            [
                ["tournament", session],
                ["matches", session],
                ["generate", session],
            ]
        )
        assert.equal(received[2][2], expectedSize)
    }
})

test("playoff update preserves changed and no-op response shapes", async () => {
    const changedResponse = createResponse()
    const changed = createController({
        generatePlayoffUpdate: async () => ({
            created: [{ _id: "created" }],
            updated: [{ _id: "updated" }],
        }),
    })
    await changed(request, changedResponse)

    assert.equal(changedResponse.statusCode, 200)
    assert.equal(changedResponse.body.matches.length, 2)
    assert.match(changedResponse.body.message, /\(2\)$/)

    const noOpResponse = createResponse()
    await createController()(request, noOpResponse)
    assert.deepEqual(noOpResponse.body, {
        matches: [],
        message: "No hay partidos nuevos para generar",
    })
})

test("playoff state rejects duplicate IDs and invalid played outcomes", () => {
    assert.throws(
        () =>
            validatePlayoffState(
                [
                    { playoff_id: 1, played: false },
                    { playoff_id: 1, played: false },
                ],
                16
            ),
        (error) => error.code === "PLAYOFF_DATA_INVALID"
    )
    assert.throws(
        () => validatePlayoffState([{ playoff_id: 1, played: true }], 16),
        (error) => error.code === "PLAYOFF_DATA_INVALID"
    )
})

test("generator failures propagate before sending a response", async () => {
    const expectedError = new Error("generation failed")
    const controller = createController({
        generatePlayoffUpdate: async () => {
            throw expectedError
        },
    })
    const response = createResponse()

    await assert.rejects(controller(request, response), expectedError)
    assert.equal(response.statusCode, null)
})
