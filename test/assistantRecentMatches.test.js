process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const {
    DEFAULT_RECENT_MATCHES_LIMIT,
    MAX_RECENT_MATCHES_LIMIT,
    buildPlayerMatchesViewPath,
} = require("../config/assistant")
const {
    PROJECTION,
    buildRecentMatchesFilter,
} = require("../dao/findRecentMatchesForAssistant")
const matchesModel = require("../dao/models/matches")
const tournamentsModel = require("../dao/models/tournaments")
const usersModel = require("../dao/models/users")
const { RECAP_SECRET_HEADER } = require("../middleware/requireRecapSecret")
const {
    createGetAssistantRecentMatches,
} = require("../controller/getAssistantRecentMatches")
const retrieveAssistantRecentMatches = require("../service/retrieveAssistantRecentMatches")
const { buildRecentMatchesSummary, clampLimit } = retrieveAssistantRecentMatches
const requestSchemas = require("../validation/requestSchemas")

const SECRET = "test-recap-secret"
const NOW = new Date("2026-10-26T12:00:00.000Z")
const CUP_ID = "bbbbbbbbbbbbbbbbbbbbbbbb"

const NICO = { id: "u-nico", name: "Nico" }
const MAX = { id: "u-max", name: "Max" }
const LEO = { id: "u-leo", name: "Leo" }

const users = [NICO, MAX, LEO].map(({ id, name }) => ({
    id,
    nickname: name,
}))

const cup = { _id: CUP_ID, name: "Copa APA", format: "playoff" }

let sequence = 0

// Cambio de rating de Nico en cada partido, por id de partido: lo lee el
// `addRatingChanges` de los tests (los partidos sin entrada quedan en null).
const NICO_CHANGES = new Map()

// Partido jugado de Nico contra `rival` (Max por defecto), con Nico de local
// salvo que se pida lo contrario.
const mkMatch = ({
    nicoGoals,
    rivalGoals,
    rival = MAX,
    nicoIsP1 = true,
    playedAt = "2026-10-20T20:00:00.000Z",
    playedAtPrecision = "exact",
    type = "regular",
    group,
    playoffId,
    leg,
    valid,
    outcome,
    nicoChange,
    tournament = { id: CUP_ID, name: "Copa APA" },
} = {}) => {
    sequence += 1

    const id = String(sequence).padStart(24, "0")
    const p1 = nicoIsP1 ? NICO : rival
    const p2 = nicoIsP1 ? rival : NICO

    if (nicoChange !== undefined) NICO_CHANGES.set(id, nicoChange)

    return {
        _id: id,
        tournament,
        type,
        ...(group === undefined ? {} : { group }),
        ...(playoffId === undefined ? {} : { playoff_id: playoffId }),
        ...(leg === undefined ? {} : { leg }),
        ...(valid === undefined ? {} : { valid }),
        playerP1: { id: p1.id, name: p1.name },
        teamP1: { id: 1, name: `${p1.name} FC` },
        scoreP1: nicoIsP1 ? nicoGoals : rivalGoals,
        playerP2: { id: p2.id, name: p2.name },
        teamP2: { id: 2, name: `${p2.name} FC` },
        scoreP2: nicoIsP1 ? rivalGoals : nicoGoals,
        ...(playedAt === null ? {} : { playedAt: new Date(playedAt) }),
        ...(playedAtPrecision ? { playedAtPrecision } : {}),
        ...(outcome ? { outcome } : {}),
    }
}

// Decorador como el del controller: agrega `ratingChange: {p1, p2}` según el
// cambio de Nico y el lado en el que jugó. Sin dato queda `null`.
const decorate = async (matches) =>
    matches.map((match) => {
        const change = NICO_CHANGES.get(match._id)

        if (change === undefined) return { ...match, ratingChange: null }

        const nicoIsP1 = match.playerP1.id === NICO.id

        return {
            ...match,
            ratingChange: nicoIsP1
                ? { p1: change, p2: -change, ratingVersion: "2.0" }
                : { p1: -change, p2: change, ratingVersion: "2.0" },
        }
    })

const run = (matches, filters = {}, overrides = {}) =>
    retrieveAssistantRecentMatches(
        { player: NICO.id, ...filters },
        {
            findAllUsers: async () => users,
            findRecentMatchesForAssistant: async () => matches,
            findTournamentsForAssistant: async () => [cup],
            addRatingChanges: decorate,
            now: () => NOW,
            ...overrides,
        }
    )

// Un día distinto por partido, el índice 0 es el más viejo.
const day = (index) => new Date(Date.UTC(2026, 0, index + 1, 20)).toISOString()

// ---------------------------------------------------------------------------
// Orden, fecha y perspectiva del jugador consultado
// ---------------------------------------------------------------------------

test("the matches go from the newest to the oldest, undated ones last", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 1,
            rivalGoals: 0,
            playedAt: "2026-10-01T20:00:00Z",
        }),
        mkMatch({
            nicoGoals: 2,
            rivalGoals: 0,
            playedAt: null,
            playedAtPrecision: null,
        }),
        mkMatch({
            nicoGoals: 3,
            rivalGoals: 0,
            playedAt: "2026-10-15T20:00:00Z",
        }),
    ])

    assert.deepEqual(
        result.matches.map(({ score }) => score),
        ["3-0", "1-0", "2-0"]
    )
    // Sin fecha, el partido sale sin `playedOn` (campo omitido).
    assert.equal("playedOn" in result.matches[2], false)
})

test("the date is the Argentine day, respecting the saved precision", async () => {
    const result = await run([
        // 02:00Z es todavía el día anterior en Argentina (UTC-3).
        mkMatch({
            nicoGoals: 1,
            rivalGoals: 0,
            playedAt: "2026-10-21T02:00:00Z",
        }),
        mkMatch({
            nicoGoals: 1,
            rivalGoals: 0,
            playedAt: "2022-11-15T12:00:00Z",
            playedAtPrecision: "month",
        }),
    ])

    assert.deepEqual(
        result.matches.map(({ playedOn }) => playedOn),
        ["2026-10-20", "2022-11"]
    )
})

test("every match is seen from the queried player, as home or away", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 3,
            rivalGoals: 1,
            playedAt: day(0),
        }),
        mkMatch({
            nicoGoals: 0,
            rivalGoals: 2,
            nicoIsP1: false,
            rival: LEO,
            playedAt: day(1),
        }),
        mkMatch({
            nicoGoals: 2,
            rivalGoals: 2,
            nicoIsP1: false,
            playedAt: day(2),
        }),
    ])

    assert.deepEqual(result.player, { name: "Nico" })
    assert.deepEqual(
        result.matches.map(
            ({
                score,
                result: outcome,
                opponent,
                playerTeam,
                opponentTeam,
            }) => ({
                score,
                outcome,
                opponent,
                playerTeam,
                opponentTeam,
            })
        ),
        [
            {
                score: "2-2",
                outcome: "draw",
                opponent: "Max",
                playerTeam: "Nico FC",
                opponentTeam: "Max FC",
            },
            {
                score: "0-2",
                outcome: "loss",
                opponent: "Leo",
                playerTeam: "Nico FC",
                opponentTeam: "Leo FC",
            },
            {
                score: "3-1",
                outcome: "win",
                opponent: "Max",
                playerTeam: "Nico FC",
                opponentTeam: "Max FC",
            },
        ]
    )
    assert.deepEqual(result.record, {
        matches: 3,
        wins: 1,
        draws: 1,
        losses: 1,
    })
})

test("the opponent name falls back to the one stored in the match", async () => {
    const result = await run(
        [
            mkMatch({
                nicoGoals: 1,
                rivalGoals: 0,
                rival: { id: "u-viejo", name: "Viejo" },
            }),
        ],
        {}
    )

    assert.equal(result.matches[0].opponent, "Viejo")
})

test("a match decided by penalties is a draw, with the shootout reported apart", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 1,
            rivalGoals: 1,
            type: "playoff",
            playoffId: 31,
            playedAt: day(0),
            outcome: {
                draw: true,
                penalties: true,
                playerThatWon: { id: MAX.id, name: "Max" },
                scoreFromTeamThatWon: 5,
                scoreFromTeamThatLost: 4,
            },
        }),
        mkMatch({
            nicoGoals: 0,
            rivalGoals: 0,
            type: "playoff",
            playoffId: 30,
            playedAt: day(1),
            outcome: {
                draw: true,
                penalties: true,
                playerThatWon: { id: NICO.id, name: "Nico" },
                scoreFromTeamThatWon: 3,
                scoreFromTeamThatLost: 2,
            },
        }),
    ])

    assert.equal(result.record.draws, 2)
    assert.equal(result.record.wins, 0)
    assert.equal(result.record.losses, 0)
    assert.deepEqual(
        result.matches.map(({ result: outcome, shootout }) => [
            outcome,
            shootout,
        ]),
        [
            ["draw", { winner: "Nico", score: "3-2" }],
            ["draw", { winner: "Max", score: "5-4" }],
        ]
    )
    assert.match(result.criterion, /penales/)
})

test("a draw without penalties has no shootout", async () => {
    const result = await run([mkMatch({ nicoGoals: 2, rivalGoals: 2 })])

    assert.equal("shootout" in result.matches[0], false)
})

test("invalid and incomplete matches are left out and reported", async () => {
    const result = await run([
        mkMatch({ nicoGoals: 2, rivalGoals: 0 }),
        mkMatch({ nicoGoals: 5, rivalGoals: 0, valid: false }),
        mkMatch({ nicoGoals: undefined, rivalGoals: 1 }),
    ])

    assert.equal(result.totalMatches, 1)
    assert.equal(result.returned, 1)
    assert.equal(result.record.matches, 1)
    assert.deepEqual(result.excluded, { invalid: 1, incomplete: 1 })
    assert.ok(result.notes.some((note) => note.includes("inválido")))
})

test("the round of a playoff, the group and the leg come with the match", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 2,
            rivalGoals: 1,
            type: "playoff",
            playoffId: 17,
            leg: 1,
            playedAt: day(1),
        }),
        mkMatch({
            nicoGoals: 2,
            rivalGoals: 1,
            group: "A",
            playedAt: day(0),
        }),
    ])
    const [playoff, regular] = result.matches

    assert.deepEqual(playoff, {
        playedOn: "2026-01-02",
        tournament: "Copa APA",
        stage: "playoff",
        round: "round_of_16",
        leg: 1,
        opponent: "Max",
        playerTeam: "Nico FC",
        opponentTeam: "Max FC",
        score: "2-1",
        result: "win",
        ratingChange: null,
    })
    assert.equal(regular.group, "A")
    assert.equal("round" in regular, false)
})

// ---------------------------------------------------------------------------
// Límite
// ---------------------------------------------------------------------------

test("the limit defaults to 10, caps at 20 and totalMatches counts every match", async () => {
    const matches = Array.from({ length: 30 }, (_, index) =>
        mkMatch({ nicoGoals: 1, rivalGoals: 0, playedAt: day(index) })
    )

    const byDefault = await run(matches)
    const capped = await run(matches, { limit: 500 })
    const few = await run(matches, { limit: 3 })

    assert.equal(DEFAULT_RECENT_MATCHES_LIMIT, 10)
    assert.equal(MAX_RECENT_MATCHES_LIMIT, 20)
    assert.equal(byDefault.totalMatches, 30)
    assert.equal(byDefault.returned, 10)
    assert.equal(byDefault.matches.length, 10)
    assert.equal(capped.returned, 20)
    assert.equal(few.returned, 3)
    // El recorte son los más nuevos.
    assert.equal(few.matches[0].playedOn, "2026-01-30")
    assert.equal(clampLimit(undefined), 10)
    assert.equal(clampLimit("x"), 10)
    assert.equal(clampLimit(0), 1)
    assert.equal(clampLimit(-4), 1)
    assert.equal(clampLimit(3), 3)
    assert.equal(clampLimit(99), 20)
})

test("the record is computed over the returned matches, not over every match", async () => {
    const matches = [
        ...Array.from({ length: 5 }, (_, index) =>
            mkMatch({ nicoGoals: 0, rivalGoals: 1, playedAt: day(index) })
        ),
        ...Array.from({ length: 3 }, (_, index) =>
            mkMatch({ nicoGoals: 2, rivalGoals: 0, playedAt: day(10 + index) })
        ),
    ]
    const result = await run(matches, { limit: 4 })

    assert.equal(result.totalMatches, 8)
    assert.deepEqual(result.record, {
        matches: 4,
        wins: 3,
        draws: 0,
        losses: 1,
    })
})

test("the rating changes are requested only for the returned matches", async () => {
    const requested = []
    const matches = Array.from({ length: 8 }, (_, index) =>
        mkMatch({ nicoGoals: 1, rivalGoals: 0, playedAt: day(index) })
    )

    await run(
        matches,
        { limit: 3 },
        {
            addRatingChanges: async (list) => {
                requested.push(list.length)
                return list
            },
        }
    )

    assert.deepEqual(requested, [3])
})

// ---------------------------------------------------------------------------
// Rating del jugador consultado
// ---------------------------------------------------------------------------

test("ratingChange is the queried player's, with sign, whichever side he played", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 2,
            rivalGoals: 0,
            nicoChange: 4.5,
            playedAt: day(0),
        }),
        mkMatch({
            nicoGoals: 2,
            rivalGoals: 0,
            nicoIsP1: false,
            nicoChange: 3.2,
            playedAt: day(1),
        }),
        mkMatch({
            nicoGoals: 0,
            rivalGoals: 1,
            nicoChange: -6.1,
            playedAt: day(2),
        }),
        mkMatch({
            nicoGoals: 0,
            rivalGoals: 1,
            nicoIsP1: false,
            nicoChange: -2.4,
            playedAt: day(3),
        }),
    ])

    assert.deepEqual(
        result.matches.map(({ ratingChange }) => ratingChange),
        [-2.4, -6.1, 3.2, 4.5]
    )
})

test("a match without rating data has ratingChange null, always present", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 1,
            rivalGoals: 0,
            nicoChange: 2.5,
            playedAt: day(0),
        }),
        mkMatch({ nicoGoals: 1, rivalGoals: 0, playedAt: day(1) }),
    ])

    assert.equal("ratingChange" in result.matches[0], true)
    assert.equal(result.matches[0].ratingChange, null)
    assert.equal(result.matches[1].ratingChange, 2.5)
    assert.equal(result.withoutRatingChange, 1)
    assert.ok(
        result.notes.some((note) =>
            note.includes("1 de 2 partido(s) no tienen")
        )
    )
})

test("without the rating decorator every match has ratingChange null", async () => {
    const result = await run(
        [mkMatch({ nicoGoals: 1, rivalGoals: 0, nicoChange: 3 })],
        {},
        { addRatingChanges: undefined }
    )

    assert.equal(result.matches[0].ratingChange, null)
    assert.equal(result.ratingChangeTotal, null)
    assert.equal(result.withoutRatingChange, 1)
})

// ---------------------------------------------------------------------------
// Resumen: total, mayor pérdida y mayor ganancia
// ---------------------------------------------------------------------------

test("the real question: the biggest loss of the last 5 and the tie goes to the newest", async () => {
    // De la más nueva a la más vieja: +4, -8.5, -2, +1, -8.5.
    const changes = [-8.5, 1, -2, -8.5, 4]
    const rivals = [MAX, LEO, MAX, LEO, MAX]
    const result = await run(
        changes.map((nicoChange, index) =>
            mkMatch({
                nicoGoals: nicoChange > 0 ? 2 : 0,
                rivalGoals: nicoChange > 0 ? 0 : 2,
                rival: rivals[index],
                nicoChange,
                playedAt: day(index),
            })
        ),
        { limit: 5 }
    )

    assert.deepEqual(result.biggestRatingLoss, {
        playedOn: "2026-01-04",
        tournament: "Copa APA",
        opponent: "Leo",
        score: "0-2",
        result: "loss",
        points: -8.5,
    })
    assert.deepEqual(result.biggestRatingGain, {
        playedOn: "2026-01-05",
        tournament: "Copa APA",
        opponent: "Max",
        score: "2-0",
        result: "win",
        points: 4,
    })
    assert.equal(result.ratingChangeTotal, -14)
    assert.equal(result.withoutRatingChange, 0)
})

test("the total is rounded and counts only the matches with data", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 1,
            rivalGoals: 0,
            nicoChange: 0.1,
            playedAt: day(0),
        }),
        mkMatch({
            nicoGoals: 1,
            rivalGoals: 0,
            nicoChange: 0.2,
            playedAt: day(1),
        }),
        mkMatch({ nicoGoals: 1, rivalGoals: 0, playedAt: day(2) }),
    ])

    assert.equal(result.ratingChangeTotal, 0.3)
    assert.equal(result.withoutRatingChange, 1)
})

test("with no losses the biggest loss is null and the gain is still reported", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 1,
            rivalGoals: 0,
            nicoChange: 2,
            playedAt: day(0),
        }),
        mkMatch({
            nicoGoals: 3,
            rivalGoals: 0,
            nicoChange: 5,
            playedAt: day(1),
        }),
    ])

    assert.equal(result.biggestRatingLoss, null)
    assert.equal(result.biggestRatingGain.points, 5)
})

test("with no wins of points the biggest gain is null", async () => {
    const result = await run([
        mkMatch({
            nicoGoals: 0,
            rivalGoals: 1,
            nicoChange: -2,
            playedAt: day(0),
        }),
    ])

    assert.equal(result.biggestRatingGain, null)
    assert.equal(result.biggestRatingLoss.points, -2)
})

test("a change of zero is neither a loss nor a gain", async () => {
    const result = await run([
        mkMatch({ nicoGoals: 1, rivalGoals: 1, nicoChange: 0 }),
    ])

    assert.equal(result.biggestRatingLoss, null)
    assert.equal(result.biggestRatingGain, null)
    assert.equal(result.ratingChangeTotal, 0)
    assert.equal(result.withoutRatingChange, 0)
})

test("with no rating data at all the summary has no total, loss or gain", async () => {
    const result = await run([
        mkMatch({ nicoGoals: 1, rivalGoals: 0, playedAt: day(0) }),
        mkMatch({ nicoGoals: 0, rivalGoals: 1, playedAt: day(1) }),
    ])

    assert.equal(result.ratingChangeTotal, null)
    assert.equal(result.biggestRatingLoss, null)
    assert.equal(result.biggestRatingGain, null)
    assert.equal(result.withoutRatingChange, 2)
    assert.deepEqual(result.record, {
        matches: 2,
        wins: 1,
        draws: 0,
        losses: 1,
    })
})

test("draws count in the record and a draw can carry rating points", () => {
    const summary = buildRecentMatchesSummary([
        { result: "draw", ratingChange: -1.2, score: "1-1" },
        { result: "win", ratingChange: null, score: "2-0" },
        { result: "loss", ratingChange: -0.5, score: "0-1" },
    ])

    assert.deepEqual(summary.record, {
        matches: 3,
        wins: 1,
        draws: 1,
        losses: 1,
    })
    assert.equal(summary.biggestRatingLoss.result, "draw")
    assert.equal(summary.biggestRatingLoss.points, -1.2)
    assert.equal(summary.ratingChangeTotal, -1.7)
    assert.equal(summary.withoutRatingChange, 1)
    assert.deepEqual(buildRecentMatchesSummary([]), {
        record: { matches: 0, wins: 0, draws: 0, losses: 0 },
        ratingChangeTotal: null,
        withoutRatingChange: 0,
        biggestRatingLoss: null,
        biggestRatingGain: null,
    })
})

// ---------------------------------------------------------------------------
// Sin ids, sin partidos, jugador inexistente y enlace
// ---------------------------------------------------------------------------

test("the visible answer has no Mongo ids: only viewPath carries the player id", async () => {
    const matches = [
        mkMatch({
            nicoGoals: 1,
            rivalGoals: 0,
            nicoChange: 1,
            playedAt: day(0),
        }),
        mkMatch({
            nicoGoals: 0,
            rivalGoals: 1,
            nicoChange: -1,
            playedAt: day(1),
        }),
    ]
    const result = await run(matches)
    const { viewPath, ...visible } = result
    const text = JSON.stringify(visible)

    assert.ok(viewPath.includes(NICO.id))

    for (const match of result.matches) {
        assert.equal("matchId" in match, false)
        assert.equal("tournamentId" in match, false)
    }
    for (const id of [...matches.map((m) => m._id), CUP_ID, NICO.id, MAX.id]) {
        assert.equal(text.includes(id), false, id)
    }
})

test("a player without matches gets an empty answer with a clear note", async () => {
    const result = await run([])

    assert.equal(result.totalMatches, 0)
    assert.equal(result.returned, 0)
    assert.deepEqual(result.matches, [])
    assert.equal(result.biggestRatingLoss, null)
    assert.equal(result.ratingChangeTotal, null)
    assert.ok(
        result.notes.some((note) => note.includes("no tiene partidos jugados"))
    )
})

test("an empty filtered answer does not say the player has never played", async () => {
    const result = await run([], { stage: "playoff" })

    assert.ok(result.notes.some((note) => note.includes("con ese filtro")))
    assert.ok(
        !result.notes.some((note) =>
            note.endsWith("no tiene partidos jugados.")
        )
    )
})

test("an unknown player is not an error: the answer says so and nothing is read", async () => {
    let read = false
    const result = await run(
        [],
        { player: "u-fantasma" },
        {
            findRecentMatchesForAssistant: async () => {
                read = true
                return []
            },
        }
    )

    assert.equal(read, false)
    assert.equal(result.player, null)
    assert.equal(result.record, null)
    assert.deepEqual(result.unknownPlayers, ["u-fantasma"])
    assert.deepEqual(result.matches, [])
    assert.ok(result.notes[0].includes("u-fantasma"))
})

test("the answer links to the match listing filtered by the player", async () => {
    const result = await run([])

    assert.equal(result.viewPath, `/matches?player1=${NICO.id}`)
    assert.equal(buildPlayerMatchesViewPath("a b"), "/matches?player1=a%20b")
    assert.equal(
        buildPlayerMatchesViewPath("a&b", {
            stage: "playoff",
            tournamentId: CUP_ID,
        }),
        `/matches?player1=a%26b&type=playoff&tournamentId=${CUP_ID}`
    )
})

test("the stage and tournament reach the query and are echoed in the answer", async () => {
    const queries = []
    const result = await run(
        [],
        { stage: "playoff", tournamentId: CUP_ID },
        {
            findRecentMatchesForAssistant: async (query) => {
                queries.push(query)
                return []
            },
        }
    )

    assert.deepEqual(queries, [
        { player: NICO.id, stage: "playoff", tournamentId: CUP_ID },
    ])
    assert.deepEqual(result.filters, {
        stage: "playoff",
        tournamentId: CUP_ID,
    })
    assert.equal(
        result.viewPath,
        `/matches?player1=${NICO.id}&type=playoff&tournamentId=${CUP_ID}`
    )
})

test("without filters the answer says so", async () => {
    const result = await run([])

    assert.deepEqual(result.filters, { stage: null, tournamentId: null })
})

test("tournaments are only looked up for valid ids of the returned matches", async () => {
    const lookups = []

    await run(
        [
            mkMatch({ nicoGoals: 1, rivalGoals: 0, playedAt: day(1) }),
            mkMatch({
                nicoGoals: 1,
                rivalGoals: 0,
                playedAt: day(0),
                tournament: { id: "id-historico", name: "Viejo" },
            }),
            // Fuera del recorte: su torneo no se busca.
            mkMatch({
                nicoGoals: 1,
                rivalGoals: 0,
                playedAt: day(-5),
                tournament: { id: "cccccccccccccccccccccccc", name: "Otro" },
            }),
        ],
        { limit: 2 },
        {
            findTournamentsForAssistant: async (query) => {
                lookups.push(query)
                return [cup]
            },
        }
    )

    assert.deepEqual(lookups, [{ tournamentIds: [CUP_ID] }])
})

// ---------------------------------------------------------------------------
// Consulta a Mongo y schema
// ---------------------------------------------------------------------------

test("the Mongo filter matches the player on either side and keeps legacy played matches", () => {
    assert.deepEqual(buildRecentMatchesFilter({ player: "a" }), {
        $and: [
            { played: { $ne: false } },
            { $or: [{ "playerP1.id": "a" }, { "playerP2.id": "a" }] },
        ],
    })
    assert.deepEqual(
        buildRecentMatchesFilter({
            player: "a",
            stage: "playoff",
            tournamentId: CUP_ID,
        }).$and.slice(2),
        [{ type: "playoff" }, { "tournament.id": CUP_ID }]
    )
    for (const field of ["valid", "outcome", "playedAt", "playedAtPrecision"]) {
        assert.ok(PROJECTION.split(" ").includes(field), field)
    }
})

const validateQuery = (query) =>
    requestSchemas.getAssistantRecentMatches.query.validate(query)

test("the schema applies the default limit and requires the player", () => {
    const { value, error } = validateQuery({ player: "a" })

    assert.equal(error, undefined)
    assert.deepEqual(value, {
        player: "a",
        limit: DEFAULT_RECENT_MATCHES_LIMIT,
    })
    // Un límite mayor al máximo no es error: lo ajusta el servicio.
    assert.equal(validateQuery({ player: "a", limit: "500" }).error, undefined)
    assert.equal(
        validateQuery({ player: "a", stage: "playin", tournamentId: CUP_ID })
            .error,
        undefined
    )

    const invalid = [
        {},
        { player: "" },
        { player: "a", limit: "0" },
        { player: "a", limit: "x" },
        { player: "a", stage: "final" },
        { player: "a", tournamentId: "abc" },
        { player: "a", playerB: "b" },
        { player: "a", opponent: "b" },
        { player: "a", page: "1" },
    ]

    for (const query of invalid) {
        assert.ok(validateQuery(query).error, JSON.stringify(query))
    }
})

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

const respondTo = async (handler, query) => {
    let payload
    await handler(
        { query },
        {
            status: () => ({
                json: (body) => {
                    payload = body
                },
            }),
        }
    )
    return payload
}

test("the controller wraps the result and passes the filters and the rating decorator", async () => {
    const calls = []
    const handler = createGetAssistantRecentMatches({
        retrieveAssistantRecentMatches: async (filters, dependencies) => {
            calls.push([filters, dependencies])
            return { record: { matches: 0 } }
        },
        retrieveRatingChanges: async () => ({ changes: new Map() }),
        readModelEnabled: () => true,
    })
    const payload = await respondTo(handler, { player: "a", limit: 5 })

    assert.deepEqual(payload, {
        success: true,
        data: { record: { matches: 0 } },
    })
    assert.deepEqual(calls[0][0], {
        player: "a",
        stage: undefined,
        tournamentId: undefined,
        limit: 5,
    })
    assert.equal(typeof calls[0][1].addRatingChanges, "function")
})

test("the controller's rating decorator never rejects: a failing read leaves ratingChange null", async () => {
    let addRatingChanges
    const handler = createGetAssistantRecentMatches({
        retrieveAssistantRecentMatches: async (_, dependencies) => {
            addRatingChanges = dependencies.addRatingChanges
            return {}
        },
        retrieveRatingChanges: async () => {
            throw new Error("mongo caído")
        },
        readModelEnabled: () => true,
        logger: { info() {}, warn() {} },
    })

    await respondTo(handler, { player: "a" })

    const decorated = await addRatingChanges([
        mkMatch({ nicoGoals: 1, rivalGoals: 0 }),
    ])

    assert.equal(decorated.length, 1)
    assert.equal(decorated[0].ratingChange, null)
})

test("the controller feeds the stored rating changes into the real service", async (t) => {
    const first = mkMatch({ nicoGoals: 2, rivalGoals: 0, playedAt: day(0) })
    const second = mkMatch({
        nicoGoals: 0,
        rivalGoals: 1,
        nicoIsP1: false,
        rival: LEO,
        playedAt: day(1),
    })

    t.mock.method(matchesModel, "find", () => ({
        lean: async () => [first, second],
    }))
    t.mock.method(tournamentsModel, "find", () => ({ lean: async () => [cup] }))
    t.mock.method(usersModel, "find", async () => users)

    const handler = createGetAssistantRecentMatches({
        retrieveRatingChanges: async ({ matchIds }) => {
            assert.deepEqual(matchIds.sort(), [first._id, second._id].sort())
            return {
                changes: new Map([
                    [first._id, { p1: 5, p2: -5 }],
                    // Nico jugó de visitante (P2): perdió 7.
                    [second._id, { p1: 7, p2: -7 }],
                ]),
            }
        },
        readModelEnabled: () => true,
        logger: { info() {}, warn() {} },
    })
    const { data } = await respondTo(handler, { player: NICO.id, limit: 10 })

    assert.deepEqual(
        data.matches.map(({ opponent, ratingChange }) => [
            opponent,
            ratingChange,
        ]),
        [
            ["Leo", -7],
            ["Max", 5],
        ]
    )
    assert.equal(data.ratingChangeTotal, -2)
    assert.equal(data.biggestRatingLoss.opponent, "Leo")
    assert.equal(data.biggestRatingGain.opponent, "Max")
})

// ---------------------------------------------------------------------------
// Ruta
// ---------------------------------------------------------------------------

const withApp = async (t, callback, options = {}) => {
    const previousSecret = process.env.RECAP_SECRET
    const previousReadModel = process.env.RATING_READ_MODEL
    process.env.RECAP_SECRET = SECRET
    // Sin lectura de ratings persistidos: el test no toca esas colecciones.
    process.env.RATING_READ_MODEL = "off"
    t.after(() => {
        if (previousSecret === undefined) delete process.env.RECAP_SECRET
        else process.env.RECAP_SECRET = previousSecret
        if (previousReadModel === undefined)
            delete process.env.RATING_READ_MODEL
        else process.env.RATING_READ_MODEL = previousReadModel
    })

    const state = { matches: [], reads: { matches: [], users: 0 }, ...options }

    t.mock.method(matchesModel, "find", (filter, projection) => {
        state.reads.matches.push([filter, projection])
        return { lean: async () => state.matches }
    })
    t.mock.method(tournamentsModel, "find", () => ({
        lean: async () => [cup],
    }))
    t.mock.method(usersModel, "find", async () => {
        state.reads.users += 1
        return users
    })

    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected", name: "apa_test" }),
    })
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const baseUrl = `http://127.0.0.1:${server.address().port}`
        await callback({ baseUrl, state })
    } finally {
        server.close()
        await once(server, "close")
    }
}

const get = (
    baseUrl,
    query = "",
    headers = { [RECAP_SECRET_HEADER]: SECRET }
) =>
    globalThis.fetch(`${baseUrl}/api/assistant/recent-matches${query}`, {
        headers,
    })

test("the recent-matches route rejects a missing or wrong secret without touching Mongo", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const query = `?player=${NICO.id}`
        const missing = await get(baseUrl, query, {})
        const wrong = await get(baseUrl, query, {
            [RECAP_SECRET_HEADER]: "nope",
        })

        for (const response of [missing, wrong]) {
            assert.equal(response.status, 401)
            assert.equal(
                (await response.json()).error.code,
                "INVALID_RECAP_SECRET"
            )
        }

        assert.equal(state.reads.matches.length, 0)
        assert.equal(state.reads.users, 0)
    })
})

test("the recent-matches route is closed when the secret is not configured", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        delete process.env.RECAP_SECRET

        const response = await get(baseUrl, `?player=${NICO.id}`)

        assert.equal(response.status, 503)
        assert.equal(
            (await response.json()).error.code,
            "RECAP_SECRET_NOT_CONFIGURED"
        )
        assert.equal(state.reads.matches.length, 0)
    })
})

test("the recent-matches route validates the query before reading", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const queries = [
            "",
            "?player=",
            `?player=${NICO.id}&limit=0`,
            `?player=${NICO.id}&limit=x`,
            `?player=${NICO.id}&stage=final`,
            `?player=${NICO.id}&tournamentId=abc`,
            `?player=${NICO.id}&opponent=${MAX.id}`,
            `?player=${NICO.id}&playerB=${MAX.id}`,
        ]

        for (const query of queries) {
            const response = await get(baseUrl, query)
            const body = await response.json()

            assert.equal(response.status, 400, query)
            assert.equal(body.error.code, "VALIDATION_ERROR", query)
        }

        assert.equal(state.reads.matches.length, 0)
        assert.equal(state.reads.users, 0)
    })
})

test("GET /api/assistant/recent-matches answers the matches, the summary and the link", async (t) => {
    await withApp(
        t,
        async ({ baseUrl, state }) => {
            const response = await get(
                baseUrl,
                `?player=${NICO.id}&stage=regular&tournamentId=${CUP_ID}&limit=1`
            )
            const body = await response.json()

            assert.equal(response.status, 200)
            assert.equal(body.success, true)
            assert.equal(body.data.player.name, "Nico")
            assert.equal(body.data.totalMatches, 2)
            assert.equal(body.data.returned, 1)
            assert.deepEqual(body.data.record, {
                matches: 1,
                wins: 0,
                draws: 0,
                losses: 1,
            })
            assert.equal(body.data.matches[0].score, "0-3")
            assert.equal(body.data.matches[0].result, "loss")
            // Read-model apagado: el campo se envía igual, en null.
            assert.equal(body.data.matches[0].ratingChange, null)
            assert.equal(body.data.withoutRatingChange, 1)
            assert.equal(body.data.biggestRatingLoss, null)
            assert.equal(
                body.data.viewPath,
                `/matches?player1=${NICO.id}&type=regular&tournamentId=${CUP_ID}`
            )
            assert.deepEqual(
                state.reads.matches[0][0],
                buildRecentMatchesFilter({
                    player: NICO.id,
                    stage: "regular",
                    tournamentId: CUP_ID,
                })
            )
        },
        {
            matches: [
                mkMatch({
                    nicoGoals: 2,
                    rivalGoals: 1,
                    playedAt: "2026-01-01T20:00:00Z",
                }),
                mkMatch({
                    nicoGoals: 0,
                    rivalGoals: 3,
                    playedAt: "2026-02-01T20:00:00Z",
                }),
            ],
        }
    )
})

test("the recent-matches route never returns more than the maximum", async (t) => {
    await withApp(
        t,
        async ({ baseUrl }) => {
            const body = await (
                await get(baseUrl, `?player=${NICO.id}&limit=500`)
            ).json()

            assert.equal(body.data.totalMatches, 25)
            assert.equal(body.data.returned, MAX_RECENT_MATCHES_LIMIT)
            assert.equal(body.data.matches.length, MAX_RECENT_MATCHES_LIMIT)
            assert.equal(body.data.withoutRatingChange, 20)
        },
        {
            matches: Array.from({ length: 25 }, (_, index) =>
                mkMatch({ nicoGoals: 1, rivalGoals: 0, playedAt: day(index) })
            ),
        }
    )
})

test("the recent-matches route answers 200 for an unknown player without reading matches", async (t) => {
    await withApp(t, async ({ baseUrl, state }) => {
        const response = await get(baseUrl, "?player=u-fantasma")
        const body = await response.json()

        assert.equal(response.status, 200)
        assert.equal(body.data.player, null)
        assert.deepEqual(body.data.unknownPlayers, ["u-fantasma"])
        assert.deepEqual(body.data.matches, [])
        assert.equal(state.reads.matches.length, 0)
    })
})
