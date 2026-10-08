const assert = require("node:assert/strict")
const test = require("node:test")

const { createGetStatistics } = require("../controller/getStatistics")
const {
    getKnockoutResult,
} = require("../controller/getStatistics/domain/streaks")

const NICO = { id: "630abc35b2e0801cf5448429", name: "Nico" }
const SANTI = { id: "630abc35b2e0801cf544842a", name: "Santi" }
const JUAN = { id: "630abc35b2e0801cf544842b", name: "Juan" }
const PEDRO = { id: "630abc35b2e0801cf544842c", name: "Pedro" }
const USERS = [NICO, SANTI, JUAN, PEDRO]

const TOURNAMENT = { id: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Liga" }
const TEAMS = new Map([
    [NICO.id, { id: "10", name: "Racing" }],
    [SANTI.id, { id: "20", name: "Boca" }],
    [JUAN.id, { id: "30", name: "River" }],
    [PEDRO.id, { id: "40", name: "Independiente" }],
])

const KNOCKOUT_KEYS = [
    "most_knockout_wins_in_a_row",
    "most_knockout_unbeaten_in_a_row",
]

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
const shootout = (p1, p2, winner, date) =>
    playoff(p1, 1, p2, 1, date, {
        outcome: {
            draw: true,
            penalties: true,
            playerThatWon: winner,
            playerThatLost: winner.id === p1.id ? p2 : p1,
            scoreFromTeamThatWon: 4,
            scoreFromTeamThatLost: 3,
        },
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

test("getKnockoutResult turns a decided shootout into W/L and keeps the rest", () => {
    const decided = shootout(NICO, SANTI, NICO, day(1))
    assert.equal(getKnockoutResult("D", decided, NICO.id), "W")
    assert.equal(getKnockoutResult("D", decided, SANTI.id), "L")

    const leg1 = playoff(NICO, 1, SANTI, 1, day(1))
    assert.equal(getKnockoutResult("D", leg1, NICO.id), "D")
    assert.equal(
        getKnockoutResult("W", playoff(NICO, 2, SANTI, 0), NICO.id),
        "W"
    )
})

test("a shootout is a knockout win for the winner and a loss for the loser", async () => {
    const decided = shootout(NICO, SANTI, NICO, day(4))
    const body = await runStatistics([
        decided,
        playoff(NICO, 2, JUAN, 0, day(3)),
        playoff(SANTI, 2, PEDRO, 0, day(2)),
        playoff(SANTI, 2, PEDRO, 0, day(1)),
    ])

    const wins = body.records.most_knockout_wins_in_a_row
    assert.equal(wins.count, 2)
    assert.deepEqual(
        wins.players.map((player) => [player.id, player.isActive]),
        [
            [NICO.id, true],
            [SANTI.id, false],
        ]
    )

    const nico = holderOf(wins, NICO.id)
    assert.equal(nico.startDate, day(3))
    assert.equal(nico.endDate, day(4))
    assert.equal(nico.endMatch.result, "W")
    assert.deepEqual(nico.endMatch.penalties, {
        won: true,
        goalsFor: 4,
        goalsAgainst: 3,
    })
    assert.equal(nico.breakMatch, null)

    // La tanda le corta a Santi las dos rachas mata-mata.
    const santi = holderOf(wins, SANTI.id)
    assert.equal(santi.endDate, day(2))
    assert.equal(santi.breakMatch.date, day(4))
    assert.equal(santi.breakMatch.result, "L")
    const santiUnbeaten = holderOf(
        body.records.most_knockout_unbeaten_in_a_row,
        SANTI.id
    )
    assert.equal(santiUnbeaten.isActive, false)
    assert.equal(santiUnbeaten.breakMatch.result, "L")

    assert.deepEqual(
        body.activeStreaks.most_knockout_wins_in_a_row.players.map(
            (player) => player.id
        ),
        [NICO.id]
    )

    // Las rachas generales siguen viendo la tanda como empate.
    const draws = body.records.most_draws_in_a_row
    assert.equal(holderOf(draws, NICO.id).endMatch.result, "D")
    assert.equal(holderOf(draws, SANTI.id).endMatch.result, "D")
    assert.equal(body.records.most_wins_in_a_row.count, 2)
    assert.equal(holderOf(body.records.most_wins_in_a_row, NICO.id), undefined)
})

test("regular matches neither extend nor break knockout streaks", async () => {
    const body = await runStatistics([
        playoff(NICO, 2, SANTI, 0, day(3)),
        match(NICO, 0, SANTI, 1, day(2)),
        playoff(NICO, 2, SANTI, 0, day(1)),
    ])

    const nico = body.records.most_knockout_wins_in_a_row.players[0]
    assert.equal(body.records.most_knockout_wins_in_a_row.count, 2)
    assert.equal(nico.id, NICO.id)
    assert.equal(nico.isActive, true)
    assert.equal(nico.startDate, day(1))
    assert.equal(nico.endDate, day(3))
    assert.equal(body.records.most_wins_in_a_row.count, 1)
})

test("a drawn first leg without penalties is a knockout draw", async () => {
    const body = await runStatistics([
        playoff(NICO, 2, SANTI, 0, day(3), { leg: 2 }),
        playoff(NICO, 1, SANTI, 1, day(2), { leg: 1 }),
        playoff(NICO, 2, SANTI, 0, day(1)),
    ])

    const wins = body.records.most_knockout_wins_in_a_row
    assert.equal(wins.count, 1)
    assert.equal(wins.players[0].id, NICO.id)
    assert.equal(wins.players[0].isActive, true)
    assert.equal(body.activeStreaks.most_knockout_wins_in_a_row, null)

    const unbeaten = holderOf(
        body.records.most_knockout_unbeaten_in_a_row,
        NICO.id
    )
    assert.equal(body.records.most_knockout_unbeaten_in_a_row.count, 3)
    assert.equal(unbeaten.isActive, true)
    assert.equal(unbeaten.startDate, day(1))
    assert.equal(unbeaten.endDate, day(3))
})

test("a knockout streak is active when it holds the latest knockout match, even after a regular one", async () => {
    const body = await runStatistics([
        match(NICO, 0, SANTI, 1, day(4)),
        playoff(NICO, 2, SANTI, 0, day(3)),
        playoff(NICO, 2, SANTI, 0, day(2)),
        playoff(NICO, 0, SANTI, 1, day(1)),
    ])

    const nico = holderOf(body.records.most_knockout_wins_in_a_row, NICO.id)
    assert.equal(nico.isActive, true)
    assert.equal(nico.breakMatch, null)
    assert.equal(body.activeStreaks.most_knockout_wins_in_a_row.count, 2)

    // La general sí la corta el regular más reciente.
    const general = holderOf(body.records.most_wins_in_a_row, NICO.id)
    assert.equal(general.isActive, false)
    assert.equal(general.breakMatch.date, day(4))
})

test("a closed knockout streak is broken by the next knockout match, skipping regulars", async () => {
    const body = await runStatistics([
        playoff(NICO, 0, SANTI, 1, day(5)),
        match(NICO, 2, SANTI, 0, day(4)),
        match(NICO, 2, SANTI, 0, day(3)),
        playoff(NICO, 2, SANTI, 0, day(2)),
        playoff(NICO, 2, SANTI, 0, day(1)),
    ])

    const nico = holderOf(body.records.most_knockout_wins_in_a_row, NICO.id)
    assert.equal(body.records.most_knockout_wins_in_a_row.count, 2)
    assert.equal(nico.isActive, false)
    assert.equal(nico.endDate, day(2))
    assert.equal(nico.breakMatch.date, day(5))
    assert.equal(nico.breakMatch.type, "playoff")
    assert.equal(nico.breakMatch.result, "L")
    assert.equal(
        holderOf(body.activeStreaks.most_knockout_wins_in_a_row, NICO.id),
        undefined
    )
})

test("active knockout streaks need at least two matches", async () => {
    const body = await runStatistics([
        playoff(NICO, 2, SANTI, 0, day(2)),
        playoff(NICO, 0, SANTI, 1, day(1)),
    ])

    assert.equal(body.records.most_knockout_wins_in_a_row.count, 1)
    assert.equal(body.activeStreaks.most_knockout_wins_in_a_row, null)
    assert.equal(body.activeStreaks.most_knockout_unbeaten_in_a_row, null)
})

test("play-in matches count as knockout matches", async () => {
    const body = await runStatistics([
        match(NICO, 2, SANTI, 0, day(2), { type: "playin" }),
        playoff(NICO, 2, SANTI, 0, day(1)),
    ])

    assert.equal(body.records.most_knockout_wins_in_a_row.count, 2)
    assert.equal(body.activeStreaks.most_knockout_wins_in_a_row.count, 2)
    assert.equal(
        body.activeStreaks.most_knockout_wins_in_a_row.players[0].startMatch
            .type,
        "playoff"
    )
})

// Quita `type` de los partidos de los poseedores: es lo único que cambia al
// pasar los mismos partidos de mata-mata a regulares.
const withoutMatchType = (entries) =>
    JSON.parse(JSON.stringify(entries), (key, value) =>
        key === "type" ? undefined : value
    )

const pickExisting = (section) =>
    Object.fromEntries(
        Object.entries(section).filter(([key]) => !KNOCKOUT_KEYS.includes(key))
    )

test("the 8 existing streak types are unchanged by knockout matches", async () => {
    const build = (asKnockout) =>
        [
            shootout(NICO, SANTI, NICO, day(9)),
            playoff(NICO, 2, JUAN, 0, day(8)),
            match(NICO, 3, PEDRO, 3, day(7)),
            shootout(SANTI, PEDRO, PEDRO, day(6)),
            playoff(JUAN, 0, SANTI, 1, day(5), { leg: 1 }),
            playoff(JUAN, 1, SANTI, 1, day(4)),
            match(NICO, 1, SANTI, 0, day(3)),
            playoff(PEDRO, 4, NICO, 0, day(2)),
            match(JUAN, 2, PEDRO, 0, day(1)),
        ].map((entry) => (asKnockout ? entry : { ...entry, type: "regular" }))

    const knockout = await runStatistics(build(true))
    const regular = await runStatistics(build(false))

    assert.deepEqual(
        withoutMatchType(pickExisting(knockout.records)),
        withoutMatchType(pickExisting(regular.records))
    )
    assert.deepEqual(
        withoutMatchType(pickExisting(knockout.activeStreaks)),
        withoutMatchType(pickExisting(regular.activeStreaks))
    )
    assert.deepEqual(knockout.players, regular.players)
    assert.deepEqual(knockout.leaderboards, regular.leaderboards)

    // Sin mata-mata no hay rachas mata-mata.
    for (const key of KNOCKOUT_KEYS) {
        assert.equal(regular.records[key], null)
        assert.ok(knockout.records[key])
    }
})
