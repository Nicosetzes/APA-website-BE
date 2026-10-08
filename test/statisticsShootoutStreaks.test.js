const assert = require("node:assert/strict")
const test = require("node:test")

const { createGetStatistics } = require("../controller/getStatistics")
const {
    SHOOTOUT_STREAK_TYPES,
    getShootoutResult,
} = require("../controller/getStatistics/domain/streaks")

const NICO = { id: "630abc35b2e0801cf5448429", name: "Nico" }
const SANTI = { id: "630abc35b2e0801cf544842a", name: "Santi" }
const JUAN = { id: "630abc35b2e0801cf544842b", name: "Juan" }
const PEDRO = { id: "630abc35b2e0801cf544842c", name: "Pedro" }
const USERS = [NICO, SANTI, JUAN, PEDRO]

const KEY = "most_penalty_shootout_wins_in_a_row"

const TOURNAMENT = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Copa" }
const TEAMS = new Map([
    [NICO.id, { id: "10", name: "Racing" }],
    [SANTI.id, { id: "20", name: "Boca" }],
    [JUAN.id, { id: "30", name: "River" }],
    [PEDRO.id, { id: "40", name: "Independiente" }],
])

const day = (n) => `2026-01-${String(n).padStart(2, "0")}T12:00:00.000Z`

const match = (p1, scoreP1, p2, scoreP2, date, extra = {}) => ({
    playerP1: p1,
    teamP1: TEAMS.get(p1.id),
    scoreP1,
    playerP2: p2,
    teamP2: TEAMS.get(p2.id),
    scoreP2,
    outcome: {
        draw: scoreP1 === scoreP2,
        penalties: false,
        playerThatWon: scoreP1 >= scoreP2 ? p1 : p2,
        playerThatLost: scoreP1 >= scoreP2 ? p2 : p1,
    },
    tournament: TOURNAMENT,
    type: "regular",
    playedAt: date,
    playedAtPrecision: "exact",
    ...extra,
})

const playoff = (p1, scoreP1, p2, scoreP2, date, extra = {}) =>
    match(p1, scoreP1, p2, scoreP2, date, {
        type: "playoff",
        playoff_id: 13,
        ...extra,
    })

// Empate en los 90 definido por penales a favor de `winner`.
const shootout = (p1, p2, winner, date, extra = {}) =>
    playoff(p1, 1, p2, 1, date, {
        outcome: {
            draw: true,
            penalties: true,
            playerThatWon: winner,
            playerThatLost: winner.id === p1.id ? p2 : p1,
            scoreFromTeamThatWon: 4,
            scoreFromTeamThatLost: 3,
        },
        ...extra,
    })

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

// Los partidos van del más nuevo al más viejo, como los devuelven los services.
const runStatistics = async (matchesNewestFirst) => {
    const controller = createGetStatistics({
        retrieveAllUsers: async () => USERS,
        retrieveAllMatches: async () => matchesNewestFirst,
        retrieveTournamentsForStatistics: async () => [],
    })
    const response = createResponse()

    await controller({ query: {} }, response)

    assert.equal(response.statusCode, 200)
    return response.body
}

const holderOf = (entry, playerId) =>
    entry?.players.find((player) => player.id === playerId)

test("getShootoutResult only resolves matches decided by penalties", () => {
    const decided = shootout(NICO, SANTI, NICO, day(1))
    assert.equal(getShootoutResult(decided, NICO.id), "W")
    assert.equal(getShootoutResult(decided, SANTI.id), "L")

    assert.equal(getShootoutResult(playoff(NICO, 2, SANTI, 0), NICO.id), null)
    assert.equal(getShootoutResult(match(NICO, 1, SANTI, 1), NICO.id), null)
    // Sin ganador registrado no hay tanda que contar.
    const unknown = shootout(NICO, SANTI, NICO, day(1))
    unknown.outcome = { draw: true, penalties: true }
    assert.equal(getShootoutResult(unknown, NICO.id), null)
})

test("won shootouts extend the streak and a lost one breaks it", async () => {
    const body = await runStatistics([
        shootout(NICO, SANTI, NICO, day(5)),
        shootout(JUAN, NICO, JUAN, day(4)),
        shootout(NICO, PEDRO, NICO, day(3)),
        shootout(SANTI, NICO, NICO, day(2)),
        shootout(NICO, JUAN, NICO, day(1)),
    ])

    const record = body.records[KEY]
    assert.equal(record.count, 3)
    assert.equal(record.players.length, 1)
    const nico = record.players[0]
    assert.equal(nico.id, NICO.id)
    assert.equal(nico.isActive, false)
    assert.equal(nico.startDate, day(1))
    assert.equal(nico.endDate, day(3))
    assert.equal(nico.startMatch.result, "W")
    assert.equal(nico.endMatch.result, "W")
    assert.deepEqual(nico.endMatch.penalties, {
        won: true,
        goalsFor: 4,
        goalsAgainst: 3,
    })
    // La tanda perdida es el corte, con el resultado de la tanda.
    assert.equal(nico.breakMatch.date, day(4))
    assert.equal(nico.breakMatch.result, "L")
    assert.equal(nico.breakMatch.goalsFor, 1)
    assert.equal(nico.breakMatch.goalsAgainst, 1)
    assert.deepEqual(nico.breakMatch.penalties, {
        won: false,
        goalsFor: 3,
        goalsAgainst: 4,
    })

    // La vigente de Nico es de 1: no llega al mínimo.
    assert.equal(holderOf(body.activeStreaks[KEY], NICO.id), undefined)
})

test("matches not decided by penalties neither extend nor break the streak", async () => {
    const body = await runStatistics([
        match(NICO, 0, SANTI, 3, day(8)),
        shootout(NICO, SANTI, NICO, day(7)),
        match(NICO, 2, JUAN, 2, day(6)),
        playoff(NICO, 3, PEDRO, 0, day(5)),
        playoff(NICO, 0, PEDRO, 2, day(4)),
        match(NICO, 1, SANTI, 1, day(3), { type: "playin" }),
        shootout(JUAN, NICO, NICO, day(2)),
        shootout(NICO, PEDRO, PEDRO, day(1)),
    ])

    const nico = holderOf(body.records[KEY], NICO.id)
    assert.equal(body.records[KEY].count, 2)
    assert.equal(nico.startDate, day(2))
    assert.equal(nico.endDate, day(7))
    // Incluye la última tanda de Nico aunque después jugó y perdió.
    assert.equal(nico.isActive, true)
    assert.equal(nico.breakMatch, null)

    const active = body.activeStreaks[KEY]
    assert.equal(active.count, 2)
    assert.deepEqual(
        active.players.map((player) => player.id),
        [NICO.id]
    )
    assert.equal(active.players[0].startMatch.date, day(2))
    assert.equal(active.players[0].endMatch.date, day(7))

    // Sin ninguna tanda no hay racha, aunque haya empates y victorias.
    const none = await runStatistics([
        playoff(NICO, 2, SANTI, 0, day(3)),
        playoff(NICO, 2, SANTI, 0, day(2)),
        match(NICO, 1, SANTI, 1, day(1)),
    ])
    assert.equal(none.records[KEY], null)
    assert.equal(none.activeStreaks[KEY], null)
})

test("a closed streak is broken by the next shootout, skipping other matches", async () => {
    const body = await runStatistics([
        shootout(SANTI, NICO, SANTI, day(5)),
        playoff(NICO, 2, JUAN, 0, day(4)),
        match(NICO, 1, PEDRO, 1, day(3)),
        shootout(NICO, JUAN, NICO, day(2)),
        shootout(PEDRO, NICO, NICO, day(1)),
    ])

    const nico = holderOf(body.records[KEY], NICO.id)
    assert.equal(nico.isActive, false)
    assert.equal(nico.endDate, day(2))
    assert.equal(nico.breakMatch.date, day(5))
    assert.equal(nico.breakMatch.result, "L")
    assert.equal(nico.breakMatch.penalties.won, false)
    assert.equal(holderOf(body.activeStreaks[KEY], NICO.id), undefined)
})

test("ties prefer the active streak and holders sort active first", async () => {
    const body = await runStatistics([
        shootout(NICO, SANTI, NICO, day(8)),
        shootout(NICO, JUAN, NICO, day(7)),
        shootout(PEDRO, NICO, PEDRO, day(6)),
        shootout(NICO, SANTI, NICO, day(5)),
        shootout(JUAN, NICO, NICO, day(4)),
        shootout(PEDRO, SANTI, SANTI, day(3)),
        shootout(JUAN, SANTI, SANTI, day(2)),
    ])

    const record = body.records[KEY]
    assert.equal(record.count, 2)
    assert.deepEqual(
        record.players.map((player) => [
            player.id,
            player.isActive,
            player.startDate,
        ]),
        [
            [NICO.id, true, day(7)],
            [SANTI.id, false, day(2)],
        ]
    )
    assert.equal(holderOf(record, SANTI.id).breakMatch.date, day(5))
})

test("active shootout streaks need at least two shootouts", async () => {
    const body = await runStatistics([
        shootout(NICO, SANTI, NICO, day(2)),
        shootout(NICO, SANTI, SANTI, day(1)),
    ])

    assert.equal(body.records[KEY].count, 1)
    assert.equal(body.activeStreaks[KEY], null)
})

test("invalid or unplayed shootouts are ignored", async () => {
    const body = await runStatistics([
        shootout(NICO, SANTI, SANTI, day(3), { valid: false }),
        shootout(NICO, SANTI, SANTI, day(3), { played: false }),
        shootout(NICO, SANTI, NICO, day(2)),
        shootout(NICO, SANTI, NICO, day(1)),
    ])

    const nico = holderOf(body.activeStreaks[KEY], NICO.id)
    assert.equal(body.activeStreaks[KEY].count, 2)
    assert.equal(nico.isActive, true)
    assert.equal(nico.breakMatch, null)
})

test("the other streaks and aggregates are unchanged by the shootout streak", async () => {
    const matches = [
        shootout(NICO, SANTI, NICO, day(9)),
        playoff(NICO, 2, JUAN, 0, day(8)),
        match(NICO, 3, PEDRO, 3, day(7)),
        shootout(SANTI, PEDRO, PEDRO, day(6)),
        shootout(JUAN, NICO, NICO, day(5)),
        playoff(JUAN, 1, SANTI, 1, day(4)),
        match(NICO, 1, SANTI, 0, day(3)),
        shootout(PEDRO, NICO, PEDRO, day(2)),
        match(JUAN, 2, PEDRO, 0, day(1)),
    ]
    const withShootouts = await runStatistics(matches)

    // Misma pasada sin alimentar la racha de tandas.
    const predicate = SHOOTOUT_STREAK_TYPES.PS
    delete SHOOTOUT_STREAK_TYPES.PS
    let without
    try {
        without = await runStatistics(matches)
    } finally {
        SHOOTOUT_STREAK_TYPES.PS = predicate
    }

    const omit = (section) =>
        Object.fromEntries(
            Object.entries(section).filter(([key]) => key !== KEY)
        )

    assert.ok(withShootouts.records[KEY])
    assert.equal(without.records[KEY], null)
    assert.deepEqual(omit(withShootouts.records), omit(without.records))
    assert.deepEqual(
        omit(withShootouts.activeStreaks),
        omit(without.activeStreaks)
    )
    assert.deepEqual(withShootouts.players, without.players)
    assert.deepEqual(withShootouts.leaderboards, without.leaderboards)
    assert.deepEqual(
        withShootouts.decisiveMatchesStats,
        without.decisiveMatchesStats
    )
})
