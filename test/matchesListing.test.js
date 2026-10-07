const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const matchesModel = require("../dao/models/matches")
const validateRequest = require("../middleware/validateRequest")
const schemas = require("../validation/requestSchemas")
const { createGetMatches } = require("../controller/getMatches")

const withServer = async (app, callback) => {
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const { port } = server.address()
        await callback(`http://127.0.0.1:${port}`)
    } finally {
        server.close()
        await once(server, "close")
    }
}

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

const runValidation = (schema, request) =>
    new Promise((resolve) => {
        validateRequest(schema)(request, {}, (error) => {
            resolve(error)
        })
    })

test("matches listing controller forwards every filter and preserves payload", async () => {
    let received
    const payload = {
        matches: [{ _id: "match" }],
        totalMatches: 1,
        totalPages: 1,
        currentPage: 0,
    }
    const controller = createGetMatches({
        retrieveMatches: async (filters) => {
            received = filters
            return payload
        },
    })
    const response = createResponse()
    const filters = {
        page: 2,
        teamName: "Racing",
        player1: "aaaaaaaaaaaaaaaaaaaaaaaa",
        player2: "bbbbbbbbbbbbbbbbbbbbbbbb",
        tournamentId: "cccccccccccccccccccccccc",
        type: "playoff",
        playoffRound: "final",
        outcome: "win",
        goalDiffOp: "lte",
        goalDiffVal: 3,
        totalGoalsOp: "gte",
        totalGoalsVal: 5,
        player1GoalsOp: "eq",
        player1GoalsVal: 2,
        player1ConcededOp: "lte",
        player1ConcededVal: 1,
        player1Team: "Brasil",
        opponentTeam: "Boca",
        dateFrom: "2025-01-01",
        dateTo: "2025-01-31",
        played: true,
    }

    await controller({ query: { ...filters } }, response)

    assert.deepEqual(received, filters)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body, payload)
})

test("matches listing controller propagates persistence failures", async () => {
    const expectedError = new Error("Mongo failed")
    const controller = createGetMatches({
        retrieveMatches: async () => {
            throw expectedError
        },
    })

    await assert.rejects(
        controller({ query: {} }, createResponse()),
        expectedError
    )
})

test("matches listing validation applies page and goalDiffOp defaults", async () => {
    const request = { query: {}, body: {} }

    const error = await runValidation(schemas.getMatches, request)

    assert.equal(error, undefined)
    assert.equal(request.query.page, 1)
    assert.equal(request.query.goalDiffOp, "gte")
    assert.equal(request.query.totalGoalsOp, "gte")
    assert.equal(request.query.player1GoalsOp, "gte")
    assert.equal(request.query.player1ConcededOp, "gte")
})

test("matches listing validation converts goal, team and round filters", async () => {
    const request = {
        query: {
            player1GoalsOp: "eq",
            player1GoalsVal: "3",
            player1ConcededVal: "0",
            totalGoalsVal: "30",
            player1Team: "  Brasil ",
            opponentTeam: "",
            playoffRound: "quarterfinal",
        },
        body: {},
    }

    const error = await runValidation(schemas.getMatches, request)

    assert.equal(error, undefined)
    assert.equal(request.query.player1GoalsVal, 3)
    assert.equal(request.query.player1ConcededVal, 0)
    assert.equal(request.query.totalGoalsVal, 30)
    assert.equal(request.query.player1Team, "Brasil")
    assert.equal(request.query.opponentTeam, "")
    assert.equal(request.query.playoffRound, "quarterfinal")
})

test("matches listing validation converts page, goal difference and played", async () => {
    const request = {
        query: { page: "3", goalDiffVal: "2", played: "false" },
        body: {},
    }

    const error = await runValidation(schemas.getMatches, request)

    assert.equal(error, undefined)
    assert.equal(request.query.page, 3)
    assert.equal(request.query.goalDiffVal, 2)
    assert.equal(request.query.played, false)
})

test("matches listing validation keeps historical all/empty filters", async () => {
    const request = {
        query: {
            player1: "all",
            player2: "",
            tournamentId: "all",
            type: "all",
            outcome: "all",
            teamName: "",
            goalDiffVal: "",
        },
        body: {},
    }

    const error = await runValidation(schemas.getMatches, request)

    assert.equal(error, undefined)
    assert.equal(request.query.player1, "all")
    assert.equal(request.query.goalDiffVal, "")
})

test("matches listing validation rejects invalid filters with canonical error", async () => {
    const invalidRequests = [
        // La paginación es base 1: page 0 dejó de ser válida.
        { query: { page: 0 }, body: {} },
        { query: { page: -1 }, body: {} },
        { query: { page: 99999 }, body: {} },
        { query: { type: "friendly" }, body: {} },
        { query: { outcome: "victory" }, body: {} },
        { query: { goalDiffOp: "gt" }, body: {} },
        { query: { goalDiffVal: 500 }, body: {} },
        { query: { player1GoalsOp: "gt" }, body: {} },
        { query: { player1GoalsVal: -1 }, body: {} },
        { query: { player1GoalsVal: 25 }, body: {} },
        { query: { player1GoalsVal: "1.5" }, body: {} },
        // Retirado por redundante con player1ConcededVal.
        { query: { player2GoalsVal: 1 }, body: {} },
        { query: { player1ConcededVal: 25 }, body: {} },
        { query: { totalGoalsVal: 49 }, body: {} },
        { query: { totalGoalsOp: "neq" }, body: {} },
        { query: { player1Team: "x".repeat(101) }, body: {} },
        { query: { playoffRound: "octavos" }, body: {} },
        { query: { dateFrom: "2025-02-30" }, body: {} },
        { query: { dateTo: "31-01-2025" }, body: {} },
        { query: { player1: "not-an-id" }, body: {} },
        { query: { unexpected: "1" }, body: {} },
    ]

    for (const request of invalidRequests) {
        const error = await runValidation(schemas.getMatches, request)

        assert.ok(
            error,
            `expected rejection for ${JSON.stringify(request.query)}`
        )
        assert.equal(error.status, 400)
        assert.equal(error.code, "VALIDATION_ERROR")
        assert.ok(Array.isArray(error.details))
    }
})

test("matches route accepts a real FE query string and rejects unknown filters", async (t) => {
    const originalAggregate = matchesModel.aggregate
    const originalCountDocuments = matchesModel.countDocuments
    let receivedFilter

    t.after(() => {
        matchesModel.aggregate = originalAggregate
        matchesModel.countDocuments = originalCountDocuments
    })

    matchesModel.aggregate = async (pipeline) => {
        receivedFilter = pipeline[0].$match
        return []
    }
    matchesModel.countDocuments = async () => 0

    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected" }),
    })

    await withServer(app, async (baseUrl) => {
        const validResponse = await globalThis.fetch(
            `${baseUrl}/api/matches?page=1&type=knockout&goalDiffOp=lte&goalDiffVal=2&dateFrom=2025-01-01&tournamentId=all`
        )

        assert.equal(validResponse.status, 200)
        assert.deepEqual(await validResponse.json(), {
            matches: [],
            totalMatches: 0,
            totalPages: 0,
            currentPage: 1,
        })
        assert.ok(Array.isArray(receivedFilter.$and))

        const invalidResponse = await globalThis.fetch(
            `${baseUrl}/api/matches?unexpected=1`
        )

        assert.equal(invalidResponse.status, 400)
        assert.equal(
            (await invalidResponse.json()).error.code,
            "VALIDATION_ERROR"
        )
    })
})

const { isDeepStrictEqual } = require("node:util")
const tournamentsModel = require("../dao/models/tournaments")

// Ejecuta el DAO real con los modelos mockeados y devuelve las condiciones del
// $and que arma para Mongo.
const captureFindMatchesFilter = async (filters, tournaments = []) => {
    const findMatches = require("../dao/findMatches")
    const originalAggregate = matchesModel.aggregate
    const originalCountDocuments = matchesModel.countDocuments
    const originalTournamentsFind = tournamentsModel.find
    let receivedFilter

    matchesModel.aggregate = async (pipeline) => {
        receivedFilter = pipeline[0].$match
        return []
    }
    matchesModel.countDocuments = async () => 0
    tournamentsModel.find = () => ({ lean: async () => tournaments })

    try {
        await findMatches(filters)
    } finally {
        matchesModel.aggregate = originalAggregate
        matchesModel.countDocuments = originalCountDocuments
        tournamentsModel.find = originalTournamentsFind
    }

    return receivedFilter.$and
}

const assertHasCondition = (conditions, expected) => {
    assert.ok(
        conditions.some((condition) => isDeepStrictEqual(condition, expected)),
        `expected condition ${JSON.stringify(expected)}`
    )
}

const PLAYER_A = "aaaaaaaaaaaaaaaaaaaaaaaa"
const PLAYER_B = "bbbbbbbbbbbbbbbbbbbbbbbb"
const NUMERIC_SCORES = {
    scoreP1: { $type: "number" },
    scoreP2: { $type: "number" },
}

test("findMatches filters goals of player1 by the side they played", async () => {
    const conditions = await captureFindMatchesFilter({
        player1: PLAYER_A,
        player2: PLAYER_B,
        player1GoalsOp: "eq",
        player1GoalsVal: 3,
    })

    assertHasCondition(conditions, {
        $or: [
            { "playerP1.id": PLAYER_A, scoreP1: { $eq: 3 } },
            { "playerP2.id": PLAYER_A, scoreP2: { $eq: 3 } },
        ],
    })
})

test("findMatches escapes the text of the general team search", async () => {
    const conditions = await captureFindMatchesFilter({ teamName: "Real (M.)" })

    assertHasCondition(conditions, {
        $or: [
            { "teamP1.name": { $regex: "Real \\(M\\.\\)", $options: "i" } },
            { "teamP2.name": { $regex: "Real \\(M\\.\\)", $options: "i" } },
        ],
    })
})

test("findMatches computes goal difference from the scores so draws count as 0", async () => {
    const conditions = await captureFindMatchesFilter({
        goalDiffOp: "eq",
        goalDiffVal: 0,
    })

    assertHasCondition(conditions, {
        ...NUMERIC_SCORES,
        $expr: {
            $eq: [{ $abs: { $subtract: ["$scoreP1", "$scoreP2"] } }, 0],
        },
    })
    assert.equal(
        JSON.stringify(conditions).includes("scoringDifference"),
        false
    )
})

test("findMatches filters total goals of the match", async () => {
    const conditions = await captureFindMatchesFilter({
        totalGoalsOp: "gte",
        totalGoalsVal: 8,
    })

    assertHasCondition(conditions, {
        ...NUMERIC_SCORES,
        $expr: { $gte: [{ $add: ["$scoreP1", "$scoreP2"] }, 8] },
    })
})

test("findMatches filters goals conceded and teams from player1's perspective", async () => {
    const conditions = await captureFindMatchesFilter({
        player1: PLAYER_A,
        player1ConcededOp: "eq",
        player1ConcededVal: 0,
        player1Team: "Brasil",
        opponentTeam: "Real (Madrid)",
    })

    assertHasCondition(conditions, {
        $or: [
            { "playerP1.id": PLAYER_A, scoreP2: { $eq: 0 } },
            { "playerP2.id": PLAYER_A, scoreP1: { $eq: 0 } },
        ],
    })
    assertHasCondition(conditions, {
        $or: [
            {
                "playerP1.id": PLAYER_A,
                "teamP1.name": { $regex: "Brasil", $options: "i" },
            },
            {
                "playerP2.id": PLAYER_A,
                "teamP2.name": { $regex: "Brasil", $options: "i" },
            },
        ],
    })
    // El texto se escapa: los paréntesis no se interpretan como regex.
    assertHasCondition(conditions, {
        $or: [
            {
                "playerP1.id": PLAYER_A,
                "teamP2.name": { $regex: "Real \\(Madrid\\)", $options: "i" },
            },
            {
                "playerP2.id": PLAYER_A,
                "teamP1.name": { $regex: "Real \\(Madrid\\)", $options: "i" },
            },
        ],
    })
})

// Evalúa una condición plana de Mongo (`"a.b.c": valor`) contra un documento.
const matchesFlatCondition = (condition, document) =>
    Object.entries(condition).every(
        ([path, expected]) =>
            path
                .split(".")
                .reduce(
                    (value, key) => (value == null ? value : value[key]),
                    document
                ) === expected
    )

const OUTCOME_KEYS = [
    "outcome.draw",
    "outcome.penalties",
    "outcome.playerThatWon.id",
    "outcome.playerThatLost.id",
]

// La condición de resultado que arma el DAO: la única con claves `outcome.*`.
const outcomeConditionFor = async (outcome) => {
    const conditions = await captureFindMatchesFilter({
        player1: PLAYER_A,
        outcome,
    })
    const found = conditions.filter((condition) =>
        Object.keys(condition).some((key) => OUTCOME_KEYS.includes(key))
    )
    assert.equal(found.length, 1, `one outcome condition for ${outcome}`)
    return found[0]
}

const outcomeDocument = ({ draw, penalties = false, winner, loser }) => ({
    valid: true,
    outcome: {
        draw,
        penalties,
        playerThatWon: winner ? { id: winner } : null,
        playerThatLost: loser ? { id: loser } : null,
    },
})

const OUTCOME_FIXTURES = {
    regularWin: outcomeDocument({
        draw: false,
        winner: PLAYER_A,
        loser: PLAYER_B,
    }),
    regularLoss: outcomeDocument({
        draw: false,
        winner: PLAYER_B,
        loser: PLAYER_A,
    }),
    regularDraw: outcomeDocument({ draw: true }),
    // Las tandas se guardan como empate con ganador.
    shootoutWin: outcomeDocument({
        draw: true,
        penalties: true,
        winner: PLAYER_A,
        loser: PLAYER_B,
    }),
    shootoutLoss: outcomeDocument({
        draw: true,
        penalties: true,
        winner: PLAYER_B,
        loser: PLAYER_A,
    }),
    // Final `valid: false` entre dos equipos del mismo jugador.
    samePlayerFinal: {
        ...outcomeDocument({ draw: false, winner: PLAYER_A, loser: PLAYER_A }),
        valid: false,
    },
}

const matchingFixtures = (condition) =>
    Object.entries(OUTCOME_FIXTURES)
        .filter(([, document]) => matchesFlatCondition(condition, document))
        .map(([name]) => name)

test("findMatches outcome=winIncludingPenalties matches any win of player1, shootouts included", async () => {
    const condition = await outcomeConditionFor("winIncludingPenalties")

    assert.deepEqual(condition, { "outcome.playerThatWon.id": PLAYER_A })
    assert.deepEqual(matchingFixtures(condition), [
        "regularWin",
        "shootoutWin",
        "samePlayerFinal",
    ])
})

test("findMatches keeps win, draw, loss and penalties outcome conditions unchanged", async () => {
    const expected = {
        win: {
            condition: {
                "outcome.draw": false,
                "outcome.playerThatWon.id": PLAYER_A,
            },
            matches: ["regularWin", "samePlayerFinal"],
        },
        draw: {
            condition: { "outcome.draw": true },
            matches: ["regularDraw", "shootoutWin", "shootoutLoss"],
        },
        loss: {
            condition: {
                "outcome.draw": false,
                "outcome.playerThatLost.id": PLAYER_A,
            },
            matches: ["regularLoss", "samePlayerFinal"],
        },
        penalties: {
            condition: { "outcome.penalties": true },
            matches: ["shootoutWin", "shootoutLoss"],
        },
    }

    for (const [outcome, { condition, matches }] of Object.entries(expected)) {
        const received = await outcomeConditionFor(outcome)
        assert.deepEqual(received, condition, outcome)
        assert.deepEqual(matchingFixtures(received), matches, outcome)
    }
})

test("findMatches ignores outcome=winIncludingPenalties without player1", async () => {
    const conditions = await captureFindMatchesFilter({
        player1: "all",
        outcome: "winIncludingPenalties",
    })

    assert.equal(JSON.stringify(conditions).includes("outcome."), false)
})

test("matches listing validation accepts the streak link filters", async () => {
    const request = {
        query: {
            player1: PLAYER_A,
            type: "playoff",
            playoffRound: "final",
            outcome: "winIncludingPenalties",
            player1GoalsOp: "gte",
            player1GoalsVal: "3",
            player1ConcededOp: "eq",
            player1ConcededVal: "0",
            dateFrom: "2019-07-20",
            dateTo: "2022-07-03",
            page: "1",
        },
        body: {},
    }

    const error = await runValidation(schemas.getMatches, request)

    assert.equal(error, undefined)
    assert.equal(request.query.outcome, "winIncludingPenalties")
})

test("findMatches ignores player-dependent filters when their player is not selected", async () => {
    const withoutPlayers = await captureFindMatchesFilter({
        player1: "all",
        player2: PLAYER_B,
        player1GoalsVal: 2,
        player1ConcededVal: 1,
        player1Team: "Brasil",
        opponentTeam: "Boca",
    })

    const serialized = JSON.stringify(withoutPlayers)
    assert.equal(serialized.includes("scoreP"), false)
    assert.equal(serialized.includes("team"), false)
    assert.equal(serialized.includes(PLAYER_B), false)
})

test("findMatches maps the playoff round to playoff_id ranges per tournament format", async () => {
    const tournaments = [
        { _id: "t-playoff", format: "playoff" },
        { _id: "t-world-cup-2026", format: "world_cup_2026" },
        { _id: "t-league", format: "league_playin_playoff" },
        { _id: "t-champions", format: "champions_league" },
    ]

    const conditions = await captureFindMatchesFilter(
        { type: "playoff", playoffRound: "semifinal" },
        tournaments
    )

    assertHasCondition(conditions, {
        type: "playoff",
        $or: [
            {
                "tournament.id": { $in: ["t-playoff", "t-world-cup-2026"] },
                playoff_id: { $in: [29, 30, "29", "30"] },
            },
            {
                "tournament.id": { $in: ["t-league"] },
                playoff_id: { $in: [13, 14, "13", "14"] },
            },
            {
                "tournament.id": { $in: ["t-champions"] },
                playoff_id: { $in: [25, 26, 27, 28, "25", "26", "27", "28"] },
            },
        ],
    })
})

// Los links de las rachas por torneo usan `playoffRound=semifinal|final`.
test("findMatches maps semifinal and final for every bracket format in use", async () => {
    const tournaments = [
        { _id: "t-world-cup", format: "world_cup" },
        { _id: "t-super-cup", format: "super_cup" },
        { _id: "t-playoff", format: "playoff" },
        { _id: "t-world-cup-2026", format: "world_cup_2026" },
        { _id: "t-champions", format: "champions_league" },
    ]

    const semis = await captureFindMatchesFilter(
        { type: "playoff", playoffRound: "semifinal" },
        tournaments
    )
    assertHasCondition(semis, {
        type: "playoff",
        $or: [
            {
                "tournament.id": { $in: ["t-world-cup", "t-super-cup"] },
                playoff_id: { $in: [13, 14, "13", "14"] },
            },
            {
                "tournament.id": { $in: ["t-playoff", "t-world-cup-2026"] },
                playoff_id: { $in: [29, 30, "29", "30"] },
            },
            {
                "tournament.id": { $in: ["t-champions"] },
                playoff_id: { $in: [25, 26, 27, 28, "25", "26", "27", "28"] },
            },
        ],
    })

    // Las dos piernas de una llave de ida y vuelta comparten `playoff_id`, así
    // que el rango de ids las incluye sin condición sobre `leg`.
    const finals = await captureFindMatchesFilter(
        { type: "playoff", playoffRound: "final" },
        tournaments
    )
    assertHasCondition(finals, {
        type: "playoff",
        $or: [
            {
                "tournament.id": { $in: ["t-world-cup", "t-super-cup"] },
                playoff_id: { $in: [15, "15"] },
            },
            {
                "tournament.id": { $in: ["t-playoff", "t-world-cup-2026"] },
                playoff_id: { $in: [31, "31"] },
            },
            {
                "tournament.id": { $in: ["t-champions"] },
                playoff_id: { $in: [29, "29"] },
            },
        ],
    })
    assert.equal(JSON.stringify(finals).includes("leg"), false)
})

// Evaluador mínimo de las condiciones de ronda: igualdad, `$in` y `$or`.
const matchesRoundCondition = (condition, document) =>
    Object.entries(condition).every(([key, expected]) => {
        if (key === "$or") {
            return expected.some((branch) =>
                matchesRoundCondition(branch, document)
            )
        }
        const value = key
            .split(".")
            .reduce((current, part) => current?.[part], document)
        if (expected && typeof expected === "object" && "$in" in expected) {
            return expected.$in.includes(value)
        }
        return value === expected
    })

// Partidos de playoff de cada formato en prod, con todos sus `playoff_id`.
const ROUND_TOURNAMENTS = [
    { _id: "t-league", format: "league_playin_playoff" },
    { _id: "t-world-cup", format: "world_cup" },
    { _id: "t-playoff", format: "playoff", playoffMode: "single" },
    { _id: "t-world-cup-2026", format: "world_cup_2026" },
    { _id: "t-two-legged", format: "playoff", playoffMode: "two_legged" },
    { _id: "t-champions", format: "champions_league" },
]

const playoffMatch = (tournamentId, playoffId, extra = {}) => ({
    _id: `${tournamentId}#${playoffId}#${extra.leg ?? "-"}`,
    type: "playoff",
    tournament: { id: tournamentId },
    playoff_id: playoffId,
    ...extra,
})

const range = (from, to) =>
    Array.from({ length: to - from + 1 }, (_, index) => from + index)

const ROUND_MATCHES = [
    ...range(1, 15).map((id) => playoffMatch("t-league", id)),
    // Un playin con el mismo id que una semi no es de playoff.
    { ...playoffMatch("t-league", 13), _id: "t-league#playin", type: "playin" },
    ...range(1, 15).map((id) => playoffMatch("t-world-cup", id)),
    ...range(1, 31).map((id) => playoffMatch("t-playoff", id)),
    ...range(1, 31).map((id) => playoffMatch("t-world-cup-2026", id)),
    // Ida, vuelta y desempate comparten `playoff_id`.
    ...range(25, 31).flatMap((id) =>
        [1, 2, 3].map((leg) => playoffMatch("t-two-legged", id, { leg }))
    ),
    // CL legacy: cada pierna es un id consecutivo; uno guardado como texto.
    ...range(17, 28).map((id) => playoffMatch("t-champions", id)),
    playoffMatch("t-champions", "29"),
]

const matchedIdsByTournament = (condition) => {
    const byTournament = {}
    for (const match of ROUND_MATCHES) {
        if (!matchesRoundCondition(condition, match)) continue
        const key = match.tournament.id
        byTournament[key] = byTournament[key] || []
        byTournament[key].push(
            match.leg ? `${match.playoff_id}/${match.leg}` : match.playoff_id
        )
    }
    return byTournament
}

test("playoffRound=semifinal returns the semis of every bracket format in prod", async () => {
    const conditions = await captureFindMatchesFilter(
        { type: "playoff", playoffRound: "semifinal" },
        ROUND_TOURNAMENTS
    )
    const roundCondition = conditions.find((condition) => condition.$or)

    assert.deepEqual(matchedIdsByTournament(roundCondition), {
        "t-league": [13, 14],
        "t-world-cup": [13, 14],
        "t-playoff": [29, 30],
        "t-world-cup-2026": [29, 30],
        "t-two-legged": ["29/1", "29/2", "29/3", "30/1", "30/2", "30/3"],
        "t-champions": [25, 26, 27, 28],
    })
})

test("playoffRound=final returns the final of every bracket format in prod", async () => {
    const conditions = await captureFindMatchesFilter(
        { type: "playoff", playoffRound: "final" },
        ROUND_TOURNAMENTS
    )
    const roundCondition = conditions.find((condition) => condition.$or)

    assert.deepEqual(matchedIdsByTournament(roundCondition), {
        "t-league": [15],
        "t-world-cup": [15],
        "t-playoff": [31],
        "t-world-cup-2026": [31],
        "t-two-legged": ["31/1", "31/2", "31/3"],
        "t-champions": ["29"],
    })
})

test("findMatches returns nothing for a round no bracket has, and ignores the round outside playoff", async () => {
    const tournaments = [{ _id: "t-league", format: "league_playin_playoff" }]

    const noBracket = await captureFindMatchesFilter(
        { type: "playoff", playoffRound: "round_of_32" },
        tournaments
    )
    const notPlayoff = await captureFindMatchesFilter(
        { type: "knockout", playoffRound: "final" },
        tournaments
    )

    assertHasCondition(noBracket, { _id: { $exists: false } })
    assert.equal(JSON.stringify(notPlayoff).includes("playoff_id"), false)
})

test("the final round range agrees with the final playoff_id of every format", () => {
    const {
        getFinalPlayoffId,
        getPlayoffRoundIdRange,
    } = require("../config/playoffFormats")
    const formats = [
        "champions_league",
        "league_playin_playoff",
        "playoff",
        "super_cup",
        "world_cup",
        "world_cup_2026",
        "club_world_cup",
    ]

    for (const format of formats) {
        const finalId = getFinalPlayoffId(format)
        assert.deepEqual(
            getPlayoffRoundIdRange(format, "final"),
            [finalId, finalId],
            format
        )
    }
})

test("public playoff history stays chronological while tournament history uses bracket order", async (t) => {
    const findMatches = require("../dao/findMatches")
    const originalAggregate = matchesModel.aggregate
    const originalCountDocuments = matchesModel.countDocuments
    const pipelines = []
    t.after(() => {
        matchesModel.aggregate = originalAggregate
        matchesModel.countDocuments = originalCountDocuments
    })
    matchesModel.aggregate = async (pipeline) => {
        pipelines.push(pipeline)
        return []
    }
    matchesModel.countDocuments = async () => 0

    await findMatches({ type: "playoff", page: 2 })
    await findMatches({ type: "playoff", tournamentId: "tournament" })

    assert.deepEqual(pipelines[0].slice(1), [
        {
            $addFields: {
                _sortPlayedAt: { $ifNull: ["$playedAt", "$updatedAt"] },
            },
        },
        { $sort: { _sortPlayedAt: -1, _id: -1 } },
        { $project: { _sortPlayedAt: 0 } },
        { $skip: 20 },
        { $limit: 20 },
    ])
    assert.deepEqual(pipelines[1].slice(1), [
        { $sort: { playoff_id: 1, leg: 1, _id: 1 } },
        { $skip: 0 },
        { $limit: 20 },
    ])
})

test("findMatches hydrates aggregate results and filters dates by playedAt ?? updatedAt", async (t) => {
    const findMatches = require("../dao/findMatches")
    const originalAggregate = matchesModel.aggregate
    const originalCountDocuments = matchesModel.countDocuments
    let pipeline
    let countFilter
    t.after(() => {
        matchesModel.aggregate = originalAggregate
        matchesModel.countDocuments = originalCountDocuments
    })
    const playedAt = new Date("2019-05-01T00:00:00.000Z")
    matchesModel.aggregate = async (received) => {
        pipeline = received
        return [
            {
                _id: "aaaaaaaaaaaaaaaaaaaaaaaa",
                played: true,
                playedAt,
                playedAtPrecision: "year",
            },
        ]
    }
    matchesModel.countDocuments = async (filter) => {
        countFilter = filter
        return 1
    }

    const result = await findMatches({
        dateFrom: "2019-01-01",
        dateTo: "2019-12-31",
    })

    assert.equal(result.matches.length, 1)
    assert.ok(result.matches[0] instanceof matchesModel)
    assert.equal(result.matches[0].playedAtPrecision, "year")
    assert.equal(
        result.matches[0].toJSON().playedAt.getTime(),
        playedAt.getTime()
    )
    assert.equal(result.totalMatches, 1)
    assert.equal(countFilter, pipeline[0].$match)

    const range = {
        $gte: new Date("2019-01-01T03:00:00.000Z"),
        $lt: new Date("2020-01-01T03:00:00.000Z"),
    }
    assertHasCondition(pipeline[0].$match.$and, {
        $or: [
            { playedAt: range },
            { playedAt: { $exists: false }, updatedAt: range },
        ],
    })
})

test("findMatches dateFrom/dateTo cover whole Argentina days, both inclusive", async (t) => {
    const findMatches = require("../dao/findMatches")
    const originalAggregate = matchesModel.aggregate
    const originalCountDocuments = matchesModel.countDocuments
    let countFilter
    t.after(() => {
        matchesModel.aggregate = originalAggregate
        matchesModel.countDocuments = originalCountDocuments
    })
    matchesModel.aggregate = async () => []
    matchesModel.countDocuments = async (filter) => {
        countFilter = filter
        return 0
    }

    // Los links de rachas mandan el mismo día en las dos puntas.
    await findMatches({ dateFrom: "2024-07-08", dateTo: "2024-07-08" })

    // 08/07 00:00 ART = 03:00 UTC; 08/07 23:59 ART = 09/07 02:59 UTC.
    const range = {
        $gte: new Date("2024-07-08T03:00:00.000Z"),
        $lt: new Date("2024-07-09T03:00:00.000Z"),
    }
    assertHasCondition(countFilter.$and, {
        $or: [
            { playedAt: range },
            { playedAt: { $exists: false }, updatedAt: range },
        ],
    })
})

// Mezcla partidos con y sin playedAt: la clave es `playedAt ?? updatedAt` y el
// desempate `_id` desc.
const MIXED_MATCHES = [
    {
        _id: "000000000000000000000001",
        updatedAt: new Date("2024-03-01T00:00:00Z"),
    },
    {
        _id: "000000000000000000000002",
        playedAt: new Date("2019-06-01T00:00:00Z"),
        updatedAt: new Date("2025-01-01T00:00:00Z"),
    },
    {
        _id: "000000000000000000000003",
        updatedAt: new Date("2024-03-01T00:00:00Z"),
    },
    {
        _id: "000000000000000000000004",
        playedAt: new Date("2024-06-01T00:00:00Z"),
        updatedAt: new Date("2020-01-01T00:00:00Z"),
    },
]
const MIXED_ORDER = [
    "000000000000000000000004",
    "000000000000000000000003",
    "000000000000000000000001",
    "000000000000000000000002",
]

const withStubbedFind = async (t, callback) => {
    const originalFind = matchesModel.find
    const calls = []
    t.after(() => {
        matchesModel.find = originalFind
    })
    matchesModel.find = (...args) => {
        calls.push(args)
        return Promise.resolve([...MIXED_MATCHES])
    }
    const result = await callback()
    return { result, calls }
}

test("findAllMatches orders mixed playedAt/updatedAt matches in JS", async (t) => {
    const findAllMatches = require("../dao/findAllMatches")
    const { result, calls } = await withStubbedFind(t, () => findAllMatches())

    assert.deepEqual(
        result.map(({ _id }) => _id),
        MIXED_ORDER
    )
    assert.match(calls[0][1], /\bplayedAt playedAtPrecision\b/)
    // Sin opciones el filtro es el de siempre: sólo jugados y válidos.
    assert.deepEqual(calls[0][0], {
        played: { $ne: false },
        valid: { $ne: false },
    })
    const fields = calls[0][1].split(" ")
    assert.equal(fields.includes("played"), false)
    assert.equal(fields.includes("valid"), false)
})

test("findAllMatches with includeAllPlayoffs adds every playoff match in the same query", async (t) => {
    const findAllMatches = require("../dao/findAllMatches")
    const { result, calls } = await withStubbedFind(t, () =>
        findAllMatches({ includeAllPlayoffs: true })
    )

    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0][0], {
        $or: [
            { played: { $ne: false }, valid: { $ne: false } },
            { type: "playoff" },
        ],
    })
    const fields = calls[0][1].split(" ")
    assert.ok(fields.includes("played"))
    assert.ok(fields.includes("valid"))
    assert.ok(fields.includes("playoff_id"))
    assert.deepEqual(
        result.map(({ _id }) => _id),
        MIXED_ORDER
    )
})

test("sortMatchesFromTournamentById orders mixed matches with and without group", async (t) => {
    const sortMatchesFromTournamentById = require("../dao/sortMatchesFromTournamentById")
    const { result, calls } = await withStubbedFind(t, async () => [
        await sortMatchesFromTournamentById("tournament", "A"),
        await sortMatchesFromTournamentById("tournament"),
    ])

    for (const matches of result) {
        assert.deepEqual(
            matches.map(({ _id }) => _id),
            MIXED_ORDER
        )
    }
    assert.deepEqual(calls[0][0], {
        "tournament.id": "tournament",
        played: true,
        type: "regular",
        group: "A",
    })
    assert.deepEqual(calls[1][0], {
        "tournament.id": "tournament",
        played: true,
        type: "regular",
    })
})

test("findPlayerMatchesByTournamentId orders mixed matches and projects playedAt", async (t) => {
    const findPlayerMatchesByTournamentId = require("../dao/findPlayerMatchesByTournamentId")
    const { result, calls } = await withStubbedFind(t, () =>
        findPlayerMatchesByTournamentId("tournament", "player")
    )

    assert.deepEqual(
        result.map(({ _id }) => _id),
        MIXED_ORDER
    )
    assert.match(calls[0][1], /\bplayedAt playedAtPrecision\b/)
})

test("fixture listing sorts played pages by playedAt ?? updatedAt and drops the helper", async (t) => {
    const findFixtureByTournamentId = require("../dao/findFixtureByTournamentId")
    const originalAggregate = matchesModel.aggregate
    let pipeline
    t.after(() => {
        matchesModel.aggregate = originalAggregate
    })
    matchesModel.aggregate = (received) => {
        pipeline = received
        return { option: async () => [{ data: [], totals: [], teamStats: [] }] }
    }

    await findFixtureByTournamentId("tournament", 1)

    assert.deepEqual(pipeline[1], {
        $addFields: {
            _sortPlayedAt: { $ifNull: ["$playedAt", "$updatedAt"] },
        },
    })
    assert.deepEqual(pipeline[2].$facet.data, [
        { $sort: { played: 1, group: 1, _sortPlayedAt: -1, _id: -1 } },
        { $skip: 0 },
        { $limit: 9 },
        { $project: { _sortPlayedAt: 0 } },
    ])
})

test("match teams returns unique, trimmed and sorted teams with their logo id", async () => {
    const { createGetMatchTeams } = require("../controller/getMatchTeams")
    const controller = createGetMatchTeams({
        retrieveMatchTeams: async () => [
            { id: 1, name: "Racing" },
            { id: 2, name: "Boca" },
            // Mismo nombre con espacios: se queda el primero.
            { id: 99, name: " Racing " },
            // Sin id primero y con id después: gana el que tiene escudo.
            { id: null, name: "Ávila" },
            { id: 3, name: "Ávila" },
            { name: "atlético" },
            { id: 4, name: "" },
            { id: 5, name: null },
            null,
        ],
    })
    const response = createResponse()

    await controller({}, response)

    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.body, [
        { id: null, name: "atlético" },
        { id: 3, name: "Ávila" },
        { id: 2, name: "Boca" },
        { id: 1, name: "Racing" },
    ])
})

test("match teams are grouped by name in Mongo over listed matches", async () => {
    const findMatchTeams = require("../dao/findMatchTeams")
    const originalAggregate = matchesModel.aggregate
    let pipeline

    matchesModel.aggregate = async (received) => {
        pipeline = received
        return [{ id: 1, name: "Racing" }]
    }

    try {
        assert.deepEqual(await findMatchTeams(), [{ id: 1, name: "Racing" }])
    } finally {
        matchesModel.aggregate = originalAggregate
    }

    assert.deepEqual(pipeline[0], {
        $match: { valid: { $ne: false }, played: { $ne: false } },
    })
    assert.deepEqual(pipeline.at(-2), {
        $group: { _id: "$teams.name", id: { $max: "$teams.id" } },
    })
})

test("match teams route rejects unexpected query params", async () => {
    const request = { params: {}, query: { q: "bra" }, body: {} }

    const error = await runValidation(schemas.getMatchTeams, request)

    assert.equal(error?.code, "VALIDATION_ERROR")
})
