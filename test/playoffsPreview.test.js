const assert = require("node:assert/strict")
const test = require("node:test")

const {
    createGetPlayoffsPreviewByTournamentId,
} = require("../controller/getPlayoffsPreviewByTournamentId")

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

const TOURNAMENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa"

const createTeams = () => [
    { team: { id: "a1" }, player: { id: "p1" }, group: "A" },
    { team: { id: "a2" }, player: { id: "p2" }, group: "A" },
    { team: { id: "b1" }, player: { id: "p3" }, group: "B" },
]

const createController = (overrides = {}) =>
    createGetPlayoffsPreviewByTournamentId({
        retrieveTournamentById: async () => ({
            id: TOURNAMENT_ID,
            name: "Mundial",
            format: "world_cup_2026",
            teams: createTeams(),
        }),
        orderMatchesFromTournamentById: async () => [],
        calculateGroupStagePlayoff: async () => ({
            playoffMatches: [{ playoff_id: 1 }],
            thirdsTable: [{ team: { id: "a2" }, rank: 1, qualified: true }],
        }),
        ...overrides,
    })

test("playoffs preview groups teams and returns bracket preview with thirds", async () => {
    let receivedArgs
    const controller = createController({
        calculateGroupStagePlayoff: async (...args) => {
            receivedArgs = args
            return {
                playoffMatches: [{ playoff_id: 1 }, { playoff_id: 2 }],
                thirdsTable: [{ team: { id: "a2" }, rank: 1 }],
            }
        },
    })
    const response = createResponse()

    await controller({ params: { tournament: TOURNAMENT_ID } }, response)

    const [groupedTeams, matches, format] = receivedArgs
    assert.deepEqual(Object.keys(groupedTeams).sort(), ["A", "B"])
    assert.equal(groupedTeams.A.length, 2)
    assert.equal(groupedTeams.B.length, 1)
    assert.deepEqual(matches, [])
    assert.equal(format, "world_cup_2026")

    assert.equal(response.statusCode, 200)
    assert.deepEqual(Object.keys(response.body), [
        "bracketPreview",
        "thirdsTable",
    ])
    assert.equal(response.body.bracketPreview.length, 2)
    assert.equal(response.body.thirdsTable[0].rank, 1)
})

test("playoffs preview answers 404 for a missing tournament", async () => {
    const controller = createController({
        retrieveTournamentById: async () => null,
    })
    const response = createResponse()

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, response),
        (error) => {
            assert.equal(error.status, 404)
            assert.equal(error.code, "TOURNAMENT_NOT_FOUND")
            return true
        }
    )
    assert.equal(response.statusCode, null)
})

test("playoffs preview answers 422 for formats without a group bracket", async () => {
    let calculated = false
    const controller = createController({
        retrieveTournamentById: async () => ({
            format: "league",
            teams: createTeams(),
        }),
        calculateGroupStagePlayoff: async () => {
            calculated = true
            return { playoffMatches: [], thirdsTable: [] }
        },
    })

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, createResponse()),
        (error) => {
            assert.equal(error.status, 422)
            assert.equal(error.code, "UNSUPPORTED_TOURNAMENT_FORMAT")
            return true
        }
    )
    assert.equal(calculated, false)
})

test("playoffs preview keeps the real supported formats", async () => {
    const supported = []

    for (const format of ["world_cup_2026", "super_cup"]) {
        const controller = createController({
            retrieveTournamentById: async () => ({
                format,
                teams: createTeams(),
            }),
        })
        const response = createResponse()

        await controller({ params: { tournament: TOURNAMENT_ID } }, response)
        supported.push(response.statusCode)
    }

    assert.deepEqual(supported, [200, 200])
})

test("playoffs preview propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createController({
        orderMatchesFromTournamentById: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller({ params: { tournament: TOURNAMENT_ID } }, createResponse()),
        expectedError
    )
})
