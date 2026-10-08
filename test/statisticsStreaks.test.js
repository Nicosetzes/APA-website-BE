const assert = require("node:assert/strict")
const test = require("node:test")

const { createGetStatistics } = require("../controller/getStatistics")
const {
    aggregatePlayers,
} = require("../controller/getStatistics/domain/playerAggregation")
const {
    buildPlayersOutput,
} = require("../controller/getStatistics/domain/rankings")
const {
    formatStreakMatch,
} = require("../controller/getStatistics/domain/records")

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

const day = (n) => `2026-01-${String(n).padStart(2, "0")}T12:00:00.000Z`

// `date` null simula un partido sin `playedAt`.
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
    },
    tournament: TOURNAMENT,
    type: "regular",
    ...(date ? { playedAt: date, playedAtPrecision: "exact" } : {}),
    ...extra,
})

const win = (date, extra) => match(NICO, 2, SANTI, 0, date, extra)
const draw = (date, extra) => match(NICO, 1, SANTI, 1, date, extra)
const loss = (date, extra) => match(NICO, 0, SANTI, 1, date, extra)

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

test("streak records tell closed streaks from active ones with their range", async () => {
    const body = await runStatistics([
        win(day(6)),
        win(day(5)),
        loss(day(4)),
        win(day(3)),
        win(day(2)),
        win(day(1)),
    ])

    const record = body.records.most_wins_in_a_row
    assert.equal(record.count, 3)
    assert.equal(record.players.length, 1)
    const nico = record.players[0]
    assert.equal(nico.id, NICO.id)
    assert.equal(nico.name, "Nico")
    assert.equal(nico.isActive, false)
    assert.equal(nico.startDate, day(1))
    assert.equal(nico.endDate, day(3))
    assert.equal(nico.date, day(3))
    assert.equal(nico.startMatch.date, day(1))
    assert.equal(nico.endMatch.date, day(3))

    const losses = body.records.most_losses_in_a_row
    assert.equal(losses.count, 3)
    assert.equal(losses.players[0].id, SANTI.id)
    assert.equal(losses.players[0].isActive, false)

    const active = body.activeStreaks.most_wins_in_a_row
    assert.equal(active.count, 2)
    assert.equal(active.players.length, 1)
    assert.equal(active.players[0].id, NICO.id)
    assert.equal(active.players[0].isActive, true)
    assert.equal(active.players[0].startDate, day(5))
    assert.equal(active.players[0].endDate, day(6))
})

test("an active streak is flagged as such in records when it is the longest", async () => {
    const body = await runStatistics([
        win(day(5)),
        win(day(4)),
        win(day(3)),
        loss(day(2)),
        win(day(1)),
    ])

    const nico = body.records.most_wins_in_a_row.players[0]
    assert.equal(body.records.most_wins_in_a_row.count, 3)
    assert.equal(nico.isActive, true)
    assert.equal(nico.startDate, day(3))
    assert.equal(nico.endDate, day(5))
    assert.deepEqual(body.activeStreaks.most_wins_in_a_row, {
        count: 3,
        players: [nico],
    })
})

test("per player ties prefer the active streak", async () => {
    const body = await runStatistics([
        win(day(5)),
        win(day(4)),
        loss(day(3)),
        win(day(2)),
        win(day(1)),
    ])

    const nico = body.records.most_wins_in_a_row.players[0]
    assert.equal(body.records.most_wins_in_a_row.count, 2)
    assert.equal(nico.isActive, true)
    assert.equal(nico.startDate, day(4))
    assert.equal(nico.endDate, day(5))
})

test("per player ties without an active streak prefer the oldest", async () => {
    const body = await runStatistics([
        loss(day(7)),
        win(day(6)),
        win(day(5)),
        loss(day(4)),
        win(day(3)),
        win(day(2)),
        loss(day(1)),
    ])

    const nico = body.records.most_wins_in_a_row.players[0]
    assert.equal(body.records.most_wins_in_a_row.count, 2)
    assert.equal(nico.isActive, false)
    assert.equal(nico.startDate, day(2))
    assert.equal(nico.endDate, day(3))
    assert.equal(
        holderOf(body.activeStreaks.most_wins_in_a_row, NICO.id),
        undefined
    )
})

test("holders across players are sorted active first, then by start date", async () => {
    const body = await runStatistics([
        match(SANTI, 3, PEDRO, 0, day(9)),
        match(SANTI, 3, PEDRO, 0, day(8)),
        match(NICO, 0, JUAN, 1, day(7)),
        match(NICO, 3, JUAN, 0, day(4)),
        match(NICO, 3, JUAN, 0, day(3)),
    ])

    const record = body.records.most_wins_in_a_row
    assert.equal(record.count, 2)
    assert.deepEqual(
        record.players.map((player) => [player.id, player.isActive]),
        [
            [SANTI.id, true],
            [NICO.id, false],
        ]
    )

    const closed = await runStatistics([
        match(SANTI, 0, PEDRO, 1, day(9)),
        match(NICO, 0, JUAN, 1, day(8)),
        match(SANTI, 3, PEDRO, 0, day(6)),
        match(SANTI, 3, PEDRO, 0, day(5)),
        match(NICO, 3, JUAN, 0, day(4)),
        match(NICO, 3, JUAN, 0, null),
    ])

    // Nico empezó antes, pero sin fecha registrada: va al final.
    assert.deepEqual(
        closed.records.most_wins_in_a_row.players.map((player) => [
            player.id,
            player.startDate,
        ]),
        [
            [SANTI.id, day(5)],
            [NICO.id, null],
        ]
    )
})

test("a one match streak starts and ends on the same match", async () => {
    const body = await runStatistics([draw(day(2)), win(day(1))])

    const nico = body.records.most_wins_in_a_row.players[0]
    assert.equal(body.records.most_wins_in_a_row.count, 1)
    assert.equal(nico.isActive, false)
    assert.equal(nico.startDate, day(1))
    assert.equal(nico.endDate, day(1))
    assert.deepEqual(nico.startMatch, nico.endMatch)
    assert.equal(nico.breakMatch.date, day(2))
    assert.equal(nico.breakMatch.result, "D")
})

test("closed streaks expose the match that broke them", async () => {
    const body = await runStatistics([
        loss(day(5)),
        win(day(4)),
        draw(day(3)),
        win(day(2)),
    ])

    const unbeaten = body.records.most_unbeaten_in_a_row
    assert.equal(unbeaten.count, 3)
    const nico = holderOf(unbeaten, NICO.id)
    assert.equal(nico.isActive, false)
    assert.equal(nico.startDate, day(2))
    assert.equal(nico.endDate, day(4))
    assert.equal(nico.endMatch.date, day(4))
    assert.deepEqual(nico.breakMatch, formatStreakMatch(loss(day(5)), NICO.id))
    assert.equal(nico.breakMatch.result, "L")

    const goals = await runStatistics([
        match(NICO, 1, SANTI, 0, day(5)),
        match(NICO, 2, SANTI, 0, day(4)),
        match(NICO, 3, SANTI, 1, day(3)),
        match(NICO, 2, SANTI, 2, day(2)),
    ])

    const g2 = goals.records.most_consecutive_matches_scoring_2_plus_goals
    assert.equal(g2.count, 3)
    const scorer = holderOf(g2, NICO.id)
    assert.equal(scorer.isActive, false)
    assert.equal(scorer.endMatch.goalsFor, 2)
    assert.equal(scorer.breakMatch.date, day(5))
    assert.equal(scorer.breakMatch.goalsFor, 1)
    assert.equal(scorer.breakMatch.goalsAgainst, 0)
    assert.equal(scorer.breakMatch.result, "W")
})

test("active streaks have no break match", async () => {
    const body = await runStatistics([
        win(day(4)),
        win(day(3)),
        win(day(2)),
        loss(day(1)),
    ])

    const nico = body.records.most_wins_in_a_row.players[0]
    assert.equal(nico.isActive, true)
    assert.equal(nico.breakMatch, null)
    assert.equal(nico.endMatch.date, day(4))
    for (const entry of Object.values(body.activeStreaks)) {
        for (const holder of entry?.players || []) {
            assert.equal(holder.breakMatch, null)
        }
    }
})

test("break matches without playedAt keep a null date", async () => {
    const body = await runStatistics([loss(null), win(day(2)), win(day(1))])

    const nico = body.records.most_wins_in_a_row.players[0]
    assert.equal(body.records.most_wins_in_a_row.count, 2)
    assert.equal(nico.isActive, false)
    assert.equal(nico.endDate, day(2))
    assert.equal(nico.breakMatch.date, null)
    assert.equal(nico.breakMatch.result, "L")
})

test("active streaks need at least two matches", async () => {
    const body = await runStatistics([win(day(2)), loss(day(1))])

    assert.equal(body.activeStreaks.most_wins_in_a_row, null)
    assert.equal(body.activeStreaks.most_losses_in_a_row, null)
    assert.equal(body.activeStreaks.most_unbeaten_in_a_row, null)
    // `records` conserva las de un partido; el FE las filtra.
    assert.equal(body.records.most_wins_in_a_row.count, 1)

    const longer = await runStatistics([win(day(3)), win(day(2)), loss(day(1))])
    assert.equal(longer.activeStreaks.most_wins_in_a_row.count, 2)
    assert.equal(longer.activeStreaks.most_wins_in_a_row.players[0].id, NICO.id)
    assert.equal(longer.activeStreaks.most_losses_in_a_row.count, 2)
})

test("streaks touching matches without playedAt have a null start date", async () => {
    const body = await runStatistics([win(day(3)), win(null), win(null)])

    const nico = body.records.most_wins_in_a_row.players[0]
    assert.equal(body.records.most_wins_in_a_row.count, 3)
    assert.equal(nico.isActive, true)
    assert.equal(nico.startDate, null)
    assert.equal(nico.startMatch.date, null)
    assert.equal(nico.endDate, day(3))
    assert.equal(nico.date, day(3))

    const undated = await runStatistics([win(null)])
    const holder = undated.records.most_wins_in_a_row.players[0]
    assert.equal(holder.startDate, null)
    assert.equal(holder.endDate, null)
    assert.equal(holder.date, null)
})

test("unbeaten streaks count wins and draws until the first loss", async () => {
    const body = await runStatistics([
        win(day(5)),
        draw(day(4)),
        win(day(3)),
        loss(day(2)),
        draw(day(1)),
    ])

    const record = body.records.most_unbeaten_in_a_row
    const nico = holderOf(record, NICO.id)
    assert.equal(record.count, 3)
    assert.equal(record.players.length, 1)
    assert.equal(nico.isActive, true)
    assert.equal(nico.startDate, day(3))
    assert.equal(nico.endDate, day(5))

    const santi = holderOf(body.activeStreaks.most_unbeaten_in_a_row, SANTI.id)
    assert.equal(santi, undefined)
})

test("active streaks hold the current streak per type even if it is not the record", async () => {
    const body = await runStatistics([
        // Juan dejó de jugar hace mucho: su racha sigue vigente.
        match(NICO, 1, SANTI, 0, day(20)),
        match(NICO, 2, SANTI, 0, day(19)),
        match(SANTI, 2, NICO, 0, day(18)),
        match(SANTI, 2, NICO, 0, day(17)),
        match(SANTI, 2, NICO, 0, day(16)),
        match(JUAN, 2, PEDRO, 2, day(2)),
        match(JUAN, 1, PEDRO, 1, day(1)),
    ])

    const { activeStreaks, records } = body

    assert.equal(records.most_wins_in_a_row.count, 3)
    assert.equal(records.most_wins_in_a_row.players[0].id, SANTI.id)

    assert.equal(activeStreaks.most_wins_in_a_row.count, 2)
    assert.deepEqual(
        activeStreaks.most_wins_in_a_row.players.map((player) => player.id),
        [NICO.id]
    )
    assert.equal(activeStreaks.most_losses_in_a_row.count, 2)
    assert.equal(activeStreaks.most_losses_in_a_row.players[0].id, SANTI.id)
    assert.equal(activeStreaks.most_draws_in_a_row.count, 2)
    assert.deepEqual(
        activeStreaks.most_draws_in_a_row.players.map((player) => [
            player.id,
            player.isActive,
            player.startDate,
            player.endDate,
        ]),
        [
            [JUAN.id, true, day(1), day(2)],
            [PEDRO.id, true, day(1), day(2)],
        ]
    )
    assert.equal(activeStreaks.most_clean_sheets_in_a_row.count, 2)
    assert.equal(
        activeStreaks.most_clean_sheets_in_a_row.players[0].id,
        NICO.id
    )
    assert.equal(
        activeStreaks.most_consecutive_matches_scoring_3_plus_goals,
        null
    )
    assert.equal(activeStreaks.most_unbeaten_in_a_row.count, 2)
    assert.deepEqual(
        activeStreaks.most_unbeaten_in_a_row.players.map((player) => player.id),
        [JUAN.id, PEDRO.id, NICO.id]
    )
})

test("streak matches are summarized from the holder perspective", () => {
    const summary = formatStreakMatch(
        match(SANTI, 2, NICO, 2, day(1), {
            type: "playoff",
            outcome: {
                draw: true,
                penalties: true,
                playerThatWon: NICO,
                playerThatLost: SANTI,
                scoreFromTeamThatWon: 4,
                scoreFromTeamThatLost: 3,
            },
        }),
        NICO.id
    )

    assert.deepEqual(summary, {
        date: day(1),
        datePrecision: "exact",
        tournament: { id: TOURNAMENT.id, name: "Liga" },
        type: "playoff",
        team: { id: "10", name: "Racing" },
        opponent: { id: SANTI.id, name: "Santi" },
        opponentTeam: { id: "20", name: "Boca" },
        goalsFor: 2,
        goalsAgainst: 2,
        result: "D",
        penalties: { won: true, goalsFor: 4, goalsAgainst: 3 },
    })

    const opponentView = formatStreakMatch(
        match(SANTI, 2, NICO, 2, day(1), {
            outcome: {
                draw: true,
                penalties: true,
                playerThatWon: NICO,
                playerThatLost: SANTI,
                scoreFromTeamThatWon: 4,
                scoreFromTeamThatLost: 3,
            },
        }),
        SANTI.id
    )
    assert.deepEqual(opponentView.penalties, {
        won: false,
        goalsFor: 3,
        goalsAgainst: 4,
    })
    assert.equal(opponentView.team.name, "Boca")
    assert.equal(opponentView.opponent.name, "Nico")

    const regular = formatStreakMatch(loss(day(1)), NICO.id)
    assert.equal(regular.result, "L")
    assert.equal(regular.goalsFor, 0)
    assert.equal(regular.goalsAgainst, 1)
    assert.equal(regular.penalties, null)
})

test("penalty matches always expose the numeric shootout score", () => {
    const shootout = match(SANTI, 1, NICO, 1, day(1), {
        outcome: {
            draw: true,
            penalties: true,
            playerThatWon: NICO,
            playerThatLost: SANTI,
            scoreFromTeamThatWon: 5,
            scoreFromTeamThatLost: 4,
        },
    })

    assert.deepEqual(formatStreakMatch(shootout, NICO.id).penalties, {
        won: true,
        goalsFor: 5,
        goalsAgainst: 4,
    })
    assert.deepEqual(formatStreakMatch(shootout, SANTI.id).penalties, {
        won: false,
        goalsFor: 4,
        goalsAgainst: 5,
    })
})

// Implementación previa de victorias/empates/derrotas seguidas, para comparar.
const legacyLongestStreaks = (resultsNewestFirst) => {
    const max = { W: 0, D: 0, L: 0 }
    let prevType = null
    let prevLen = 0
    const finalize = () => {
        if (prevType && prevLen > max[prevType]) max[prevType] = prevLen
    }

    for (const result of resultsNewestFirst) {
        if (prevType === result) {
            prevLen += 1
        } else {
            finalize()
            prevType = result
            prevLen = 1
        }
    }
    finalize()

    return max
}

const createRandom = (seed) => {
    let state = seed
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648
        return state / 2147483648
    }
}

test("max W/D/L and longest_streak match the previous implementation", () => {
    for (const seed of [1, 7, 42, 2026]) {
        const random = createRandom(seed)
        const matches = Array.from({ length: 300 }, (_, index) =>
            match(
                NICO,
                Math.floor(random() * 3),
                SANTI,
                Math.floor(random() * 3),
                new Date(Date.UTC(2026, 0, 1) - index * 3600000).toISOString()
            )
        )
        const accumulators = aggregatePlayers({
            matches,
            registeredPlayers: [NICO, SANTI],
            playerNames: new Map([
                [NICO.id, NICO.name],
                [SANTI.id, SANTI.name],
            ]),
            allowedPlayerIds: null,
        })
        const players = buildPlayersOutput({
            accumulators,
            includeLongestStreak: true,
        })

        for (const accumulator of accumulators) {
            const isNico = accumulator.id === NICO.id
            const results = matches.map((entry) => {
                const goalsFor = isNico ? entry.scoreP1 : entry.scoreP2
                const goalsAgainst = isNico ? entry.scoreP2 : entry.scoreP1
                if (goalsFor > goalsAgainst) return "W"
                if (goalsFor < goalsAgainst) return "L"
                return "D"
            })
            const expected = legacyLongestStreaks(results)

            assert.deepEqual(
                {
                    W: accumulator._maxW,
                    D: accumulator._maxD,
                    L: accumulator._maxL,
                },
                expected,
                `seed ${seed}, player ${accumulator.name}`
            )

            const best = [
                { t: "W", v: expected.W },
                { t: "D", v: expected.D },
                { t: "L", v: expected.L },
            ].sort((a, b) => b.v - a.v)[0]
            const player = players.find(
                (entry) => entry.player.id === accumulator.id
            )
            assert.deepEqual(player.longest_streak, {
                type: best.t,
                length: best.v,
            })
            assert.equal(player.current_streak.type, results[0])
        }
    }
})

test("streaks, records and recent use playedAt with its precision and ignore updatedAt", async () => {
    const year2019 = "2019-06-01T00:00:00.000Z"
    const approx2022 = "2022-11-15T00:00:00.000Z"
    // updatedAt de la recarga manual: no debe aparecer en la respuesta.
    const reloadedAt = day(20)
    const body = await runStatistics([
        win(day(3)),
        win(approx2022, {
            scoreP1: 5,
            playedAtPrecision: "approx",
            updatedAt: reloadedAt,
        }),
        win(year2019, { playedAtPrecision: "year", updatedAt: reloadedAt }),
    ])

    const nico = holderOf(body.records.most_wins_in_a_row, NICO.id)
    assert.equal(nico.startDate, year2019)
    assert.equal(nico.startDatePrecision, "year")
    assert.equal(nico.endDate, day(3))
    assert.equal(nico.endDatePrecision, "exact")
    assert.equal(nico.date, day(3))
    assert.equal(nico.datePrecision, "exact")
    assert.equal(nico.startMatch.date, year2019)
    assert.equal(nico.startMatch.datePrecision, "year")

    const highest = body.records.highest_total_goals_match.match
    assert.equal(highest.date, approx2022)
    assert.equal(highest.datePrecision, "approx")

    const player = body.players.find((entry) => entry.player.id === NICO.id)
    assert.deepEqual(
        player.recent.map(({ date, datePrecision }) => [date, datePrecision]),
        [
            [year2019, "year"],
            [approx2022, "approx"],
            [day(3), "exact"],
        ]
    )
})

test("matches without tournament count in global streaks without breaking", async () => {
    const body = await runStatistics([
        win(day(3), { tournament: null }),
        win(day(2), { tournament: null }),
        win(day(1)),
    ])

    const record = body.records.most_wins_in_a_row
    assert.equal(record.count, 3)
    assert.equal(record.players[0].id, NICO.id)
    assert.equal(record.players[0].endMatch.tournament, null)
})
