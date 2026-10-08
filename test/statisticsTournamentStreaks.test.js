const assert = require("node:assert/strict")
const test = require("node:test")

const { createGetStatistics } = require("../controller/getStatistics")
const {
    createStreakState,
} = require("../controller/getStatistics/domain/streaks")
const {
    RANK_PHASE,
    applyTournamentStreaks,
    buildTournamentFacts,
} = require("../controller/getStatistics/domain/tournamentStreaks")
const {
    formatTournamentHolder,
} = require("../controller/getStatistics/domain/records")
const { comparePlayedAtDesc } = require("../utils/playedAt")

const NICO = { id: "630abc35b2e0801cf5448429", name: "Nico" }
const SANTI = { id: "630abc35b2e0801cf544842a", name: "Santi" }
const JUAN = { id: "630abc35b2e0801cf544842b", name: "Juan" }
const PEDRO = { id: "630abc35b2e0801cf544842c", name: "Pedro" }
const LUCAS = { id: "630abc35b2e0801cf544842d", name: "Lucas" }
const MATI = { id: "630abc35b2e0801cf544842e", name: "Mati" }
const FEDE = { id: "630abc35b2e0801cf544842f", name: "Fede" }
const USERS = [NICO, SANTI, JUAN, PEDRO, LUCAS, MATI, FEDE]

const TOURNAMENT_KEYS = [
    "most_consecutive_semifinals",
    "most_consecutive_finals",
    "most_consecutive_titles",
]
const KNOCKOUT_KEYS = [
    "most_knockout_wins_in_a_row",
    "most_knockout_unbeaten_in_a_row",
]

const tournamentId = (n) => n.toString(16).padStart(24, "0")
const yearDate = (year, month = 6) => new Date(Date.UTC(year, month - 1, 1))

// Torneo cerrado del año `year` (cierre el 1/6, inicio el 1/1).
const tournament = (year, overrides = {}) => ({
    _id: tournamentId(year),
    name: `Torneo ${year}`,
    format: "world_cup",
    ongoing: false,
    startedAt: yearDate(year, 1),
    startedAtPrecision: "exact",
    closedAt: yearDate(year),
    closedAtPrecision: "exact",
    players: [],
    legacy: false,
    ...overrides,
})

const ongoing = (year, overrides = {}) =>
    tournament(year, {
        ongoing: true,
        closedAt: undefined,
        closedAtPrecision: undefined,
        ...overrides,
    })

let sequence = 0
const side = (player) =>
    player ? { id: player.id, name: player.name } : { id: null }

// Partido jugado y válido dentro del torneo; `playedAt` antes del cierre.
const game = (t, type, playoffId, p1, scoreP1, p2, scoreP2, extra = {}) => {
    sequence += 1
    const decided = scoreP1 !== scoreP2
    const p1Won = scoreP1 > scoreP2
    const base = t.closedAt || t.startedAt
    return {
        _id: `m${String(sequence).padStart(6, "0")}`,
        playerP1: side(p1),
        teamP1: { id: `t1-${sequence}`, name: "Local" },
        scoreP1,
        playerP2: side(p2),
        teamP2: { id: `t2-${sequence}`, name: "Visitante" },
        scoreP2,
        outcome: decided
            ? {
                  draw: false,
                  penalties: false,
                  playerThatWon: side(p1Won ? p1 : p2),
                  playerThatLost: side(p1Won ? p2 : p1),
              }
            : { draw: true, penalties: false },
        tournament: { id: t._id, name: t.name },
        type,
        ...(playoffId === undefined ? {} : { playoff_id: playoffId }),
        played: true,
        valid: true,
        playedAt: new Date(base.getTime() - sequence * 60000),
        playedAtPrecision: "exact",
        ...extra,
    }
}

const ko = (t, playoffId, p1, scoreP1, p2, scoreP2, extra) =>
    game(t, "playoff", playoffId, p1, scoreP1, p2, scoreP2, extra)

// Slot pregenerado sin jugar: tiene `updatedAt` (posterior a todo) y no
// `playedAt`.
const slot = (t, playoffId, p1, p2, extra = {}) =>
    ko(t, playoffId, p1, null, p2, null, {
        played: false,
        outcome: undefined,
        playedAt: undefined,
        playedAtPrecision: undefined,
        updatedAt: yearDate(2099),
        ...extra,
    })

const regular = (t, p1, p2) => game(t, "regular", undefined, p1, 1, p2, 0)

// Bracket de 16 (world_cup): final 15, semis 13-14, cuartos 9-12. Los
// perdedores de cada ronda pierden con el campeón, el finalista o los
// semifinalistas, en ese orden.
const bracket = (t, { champion, finalist, semis = [], quarters = [] }) => {
    const list = []
    if (champion && finalist) list.push(ko(t, 15, champion, 2, finalist, 0))
    const semiWinners = [champion, finalist]
    semis.forEach((player, index) =>
        list.push(ko(t, 13 + index, semiWinners[index], 2, player, 0))
    )
    const quarterWinners = [champion, finalist, ...semis]
    quarters.forEach((player, index) =>
        list.push(ko(t, 9 + index, quarterWinners[index], 2, player, 0))
    )
    return list
}

const split = (all) => ({
    matches: all.filter((m) => m.played !== false && m.valid !== false),
    extraPlayoffMatches: all.filter(
        (m) => !(m.played !== false && m.valid !== false)
    ),
})

const factsFor = (tournaments, all) =>
    buildTournamentFacts({ ...split(all), tournaments })

const phasesOf = (fact) =>
    Object.fromEntries(
        [...fact.ranks].map(([id, rank]) => [
            USERS.find((user) => user.id === id)?.name ?? id,
            RANK_PHASE[rank],
        ])
    )

// Acumuladores con sólo el estado de rachas, como los de playerAggregation.
const streaksFor = (tournaments, all) => {
    const accumulators = USERS.map((user) => ({
        id: user.id,
        name: user.name,
        ...createStreakState(),
    }))
    applyTournamentStreaks({
        accumulators,
        facts: factsFor(tournaments, all),
    })
    return Object.fromEntries(accumulators.map((entry) => [entry.name, entry]))
}

const best = (accumulator, type) => ({
    count: accumulator[`_max${type}`],
    ...formatTournamentHolder(
        accumulator,
        `_max${type}`,
        accumulator[`_max${type}Active`]
    ),
})

const current = (accumulator, type) => accumulator[`_active${type}`]

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

const newestFirst = (all) => [...all].sort(comparePlayedAtDesc)

const runStatistics = async ({ matches, tournaments, ...dependencies }) => {
    const controller = createGetStatistics({
        retrieveAllUsers: async () => USERS,
        retrieveAllMatches: async () => newestFirst(matches),
        retrieveTournamentsForStatistics: async () => tournaments,
        ...dependencies,
    })
    const response = createResponse()
    await controller({ query: {}, requestId: "req-1" }, response)
    assert.equal(response.statusCode, 200)
    return response.body
}

// --- Fase alcanzada por formato -------------------------------------------

test("world_cup brackets: 9-12 quarters, 13-14 semis, 15 final and its winner", () => {
    const t = tournament(2020)
    const [fact] = factsFor(
        [t],
        [
            regular(t, MATI, LUCAS),
            game(t, "playin", 1, FEDE, 0, PEDRO, 1),
            ko(t, 9, JUAN, 2, PEDRO, 0),
            ko(t, 13, SANTI, 1, JUAN, 0),
            ko(t, 14, NICO, 3, LUCAS, 1),
            ko(t, 15, SANTI, 2, NICO, 1),
        ]
    )

    assert.deepEqual(phasesOf(fact), {
        Mati: "regular",
        Lucas: "semifinal",
        Fede: "playin",
        Pedro: "quarterfinal",
        Juan: "semifinal",
        Santi: "champion",
        Nico: "final",
    })
})

test("32 team playoff and world_cup_2026 brackets: 29-30 semis, 31 final", () => {
    for (const format of ["playoff", "world_cup_2026"]) {
        const t = tournament(2021, { format })
        const [fact] = factsFor(
            [t],
            [
                ko(t, 1, PEDRO, 2, MATI, 0),
                ko(t, 17, PEDRO, 2, FEDE, 0),
                ko(t, 25, JUAN, 2, PEDRO, 0),
                ko(t, 29, SANTI, 1, JUAN, 0),
                ko(t, 30, NICO, 1, LUCAS, 0),
                ko(t, 31, SANTI, 0, NICO, 1),
            ]
        )

        assert.deepEqual(
            phasesOf(fact),
            {
                Pedro: "quarterfinal",
                Mati: "round_of_32",
                Fede: "round_of_16",
                Juan: "semifinal",
                Santi: "final",
                Nico: "champion",
                Lucas: "semifinal",
            },
            format
        )
    }
})

test("two legged ties with leg share the playoff_id of their round", () => {
    const t = tournament(2022, { format: "playoff", playoffMode: "two_legged" })
    const [fact] = factsFor(
        [t],
        [
            ko(t, 25, PEDRO, 1, MATI, 1, { leg: 1 }),
            ko(t, 25, MATI, 1, PEDRO, 0, { leg: 2 }),
            ko(t, 29, JUAN, 1, SANTI, 1, { leg: 1 }),
            ko(t, 29, SANTI, 0, JUAN, 0, { leg: 2 }),
            ko(t, 29, SANTI, 2, JUAN, 1, { leg: 3 }),
            ko(t, 31, SANTI, 2, NICO, 0),
        ]
    )

    assert.deepEqual(phasesOf(fact), {
        Pedro: "quarterfinal",
        Mati: "quarterfinal",
        Juan: "semifinal",
        Santi: "champion",
        Nico: "final",
    })
})

test("legacy champions_league legs on {2k-1, 2k} fall in the same round", () => {
    const t = tournament(2019, { format: "champions_league", legacy: true })
    const [fact] = factsFor(
        [t],
        [
            ko(t, 1, MATI, 1, PEDRO, 0),
            ko(t, 2, PEDRO, 2, MATI, 0),
            ko(t, 17, PEDRO, 0, JUAN, 1),
            ko(t, 18, JUAN, 1, PEDRO, 1),
            ko(t, 23, FEDE, 0, LUCAS, 0),
            ko(t, 24, LUCAS, 1, FEDE, 0),
            ko(t, 25, JUAN, 0, SANTI, 1),
            ko(t, 26, SANTI, 1, JUAN, 1),
            ko(t, 27, LUCAS, 0, NICO, 2),
            ko(t, 28, NICO, 0, LUCAS, 1),
            ko(t, 29, SANTI, 1, NICO, 3),
        ]
    )

    assert.deepEqual(phasesOf(fact), {
        Mati: "round_of_16",
        Pedro: "quarterfinal",
        Juan: "semifinal",
        Fede: "quarterfinal",
        Lucas: "semifinal",
        Santi: "final",
        Nico: "champion",
    })
})

test("out of range playoff ids are not a bracket", () => {
    const outOfRange = tournament(2021)
    assert.deepEqual(
        factsFor([outOfRange], [ko(outOfRange, 40, NICO, 1, SANTI, 0)]),
        []
    )
})

// --- Rachas en torneos cerrados ---------------------------------------------

test("a closed tournament the player did not take part in neither breaks nor extends", () => {
    const t20 = tournament(2020)
    const t21 = tournament(2021)
    const t22 = tournament(2022)
    const players = streaksFor(
        [t20, t21, t22],
        [
            ...bracket(t20, {
                champion: SANTI,
                finalist: JUAN,
                semis: [NICO, PEDRO],
            }),
            ...bracket(t21, {
                champion: SANTI,
                finalist: JUAN,
                semis: [PEDRO, LUCAS],
            }),
            ...bracket(t22, {
                champion: SANTI,
                finalist: JUAN,
                semis: [NICO, LUCAS],
            }),
        ]
    )

    const nico = best(players.Nico, "T4")
    assert.equal(nico.count, 2)
    assert.equal(nico.isActive, true)
    assert.equal(nico.startTournament.id, t20._id)
    assert.equal(nico.endTournament.id, t22._id)
    assert.equal(nico.breakTournament, null)
    assert.equal(current(players.Nico, "T4"), 2)
    assert.equal(best(players.Santi, "T1").count, 3)
    assert.equal(best(players.Juan, "T2").count, 3)
    assert.equal(best(players.Juan, "T1").count, 0)
})

test("taking part without reaching the phase breaks the streak and shows the phase", () => {
    const t20 = tournament(2020)
    const t21 = tournament(2021)
    const t22 = tournament(2022)
    const base = [
        ...bracket(t20, { champion: SANTI, finalist: JUAN, semis: [NICO] }),
        ...bracket(t21, { champion: SANTI, finalist: JUAN, semis: [NICO] }),
    ]

    const quarters = streaksFor(
        [t20, t21, t22],
        [
            ...base,
            ...bracket(t22, {
                champion: SANTI,
                finalist: JUAN,
                quarters: [NICO],
            }),
        ]
    )
    const nico = best(quarters.Nico, "T4")
    assert.equal(nico.count, 2)
    assert.equal(nico.isActive, false)
    assert.equal(nico.startTournament.id, t20._id)
    assert.equal(nico.endTournament.id, t21._id)
    assert.equal(nico.breakTournament.id, t22._id)
    assert.equal(nico.breakTournament.phaseReached, "quarterfinal")
    assert.equal(nico.startDate, t20.closedAt)
    assert.equal(nico.endDate, t21.closedAt)
    assert.equal(current(quarters.Nico, "T4"), 0)

    // Sólo fase regular: no clasificó al playoff.
    const regularOnly = streaksFor(
        [t20, t21, t22],
        [
            ...base,
            ...bracket(t22, { champion: SANTI, finalist: JUAN }),
            regular(t22, NICO, PEDRO),
        ]
    )
    assert.equal(
        best(regularOnly.Nico, "T4").breakTournament.phaseReached,
        "regular"
    )

    // Play-in perdido: tampoco llegó al bracket.
    const playin = streaksFor(
        [t20, t21, t22],
        [
            ...base,
            ...bracket(t22, { champion: SANTI, finalist: JUAN }),
            game(t22, "playin", 1, PEDRO, 2, NICO, 0),
        ]
    )
    assert.equal(best(playin.Nico, "T4").breakTournament.phaseReached, "playin")
})

test("a registered player without valid matches took part and did not reach the phase", () => {
    const t20 = tournament(2020)
    const t21 = tournament(2021)
    const t22 = tournament(2022, { players: [side(NICO), side(SANTI)] })
    const players = streaksFor(
        [t20, t21, t22],
        [
            ...bracket(t20, { champion: SANTI, finalist: JUAN, semis: [NICO] }),
            ...bracket(t21, { champion: SANTI, finalist: JUAN, semis: [NICO] }),
            ...bracket(t22, { champion: SANTI, finalist: JUAN }),
        ]
    )

    const nico = best(players.Nico, "T4")
    assert.equal(nico.isActive, false)
    assert.equal(nico.breakTournament.id, t22._id)
    assert.equal(nico.breakTournament.phaseReached, "regular")
})

test("tournaments without playoff matches or with valid false are skipped for everyone", () => {
    const t20 = tournament(2020)
    const noPlayoff = tournament(2021, { legacy: true })
    const invalid = tournament(2022, { valid: false })
    const t23 = tournament(2023)
    const all = [
        ...bracket(t20, { champion: SANTI, finalist: JUAN, semis: [NICO] }),
        regular(noPlayoff, NICO, SANTI),
        ...bracket(invalid, {
            champion: SANTI,
            finalist: JUAN,
            quarters: [NICO],
        }),
        ...bracket(t23, { champion: SANTI, finalist: JUAN, semis: [NICO] }),
    ]

    assert.deepEqual(
        factsFor([t20, noPlayoff, invalid, t23], all).map((fact) => fact.id),
        [t23._id, t20._id]
    )
    const players = streaksFor([t20, noPlayoff, invalid, t23], all)
    assert.equal(best(players.Nico, "T4").count, 2)
    assert.equal(best(players.Nico, "T4").isActive, true)
})

test("a valid false final between two teams of the same player makes them champion", () => {
    const t21 = tournament(2021)
    const sle = tournament(2022, {
        name: "Superliga Europea 2022",
        outcome: { champion: { player: side(NICO) } },
    })
    const players = streaksFor(
        [t21, sle],
        [
            ...bracket(t21, { champion: NICO, finalist: SANTI, semis: [JUAN] }),
            ko(sle, 13, NICO, 2, JUAN, 0),
            ko(sle, 14, NICO, 1, PEDRO, 0),
            ko(sle, 15, NICO, 0, NICO, 0, {
                valid: false,
                outcome: { draw: true, penalties: false },
            }),
        ]
    )

    for (const type of ["T1", "T2", "T4"]) {
        const nico = best(players.Nico, type)
        assert.equal(nico.count, 2, type)
        assert.equal(nico.isActive, true, type)
        assert.equal(nico.endTournament.phaseReached, "champion", type)
    }
    assert.equal(best(players.Juan, "T4").count, 2)
    assert.equal(best(players.Juan, "T2").count, 0)
})

test("unassigned slot sides add no rank and do not complete a round", () => {
    const t = ongoing(2026)
    const [fact] = factsFor(
        [t],
        [
            ko(t, 9, NICO, 2, PEDRO, 0),
            slot(t, 13, NICO, null),
            slot(t, 14, null, undefined, { playerP2: { id: "" } }),
        ]
    )

    assert.deepEqual(phasesOf(fact), {
        Nico: "semifinal",
        Pedro: "quarterfinal",
    })
    assert.equal(fact.semisComplete, false)
    assert.equal(fact.finalAssigned, false)
})

test("in a closed tournament an assigned unplayed slot counts as reaching the round", () => {
    const t = tournament(2022)
    const [fact] = factsFor(
        [t],
        [ko(t, 9, NICO, 2, PEDRO, 0), slot(t, 13, NICO, SANTI)]
    )
    assert.equal(phasesOf(fact).Nico, "semifinal")
    assert.equal(phasesOf(fact).Santi, "semifinal")
    assert.equal(fact.lastPlayedAt.getTime() < yearDate(2099).getTime(), true)
})

test("an unplayed final does not define the champion: closed tournaments use the outcome", () => {
    const t = tournament(2022, {
        outcome: {
            champion: { player: side(SANTI) },
            finalist: { player: side(NICO) },
        },
    })
    const [fact] = factsFor([t], [slot(t, 15, NICO, SANTI)])
    assert.equal(fact.finalChampionFromMatch, null)
    assert.equal(phasesOf(fact).Santi, "champion")
    assert.equal(phasesOf(fact).Nico, "final")
})

test("a valid false semifinal walkover counts as reaching the semis for both", () => {
    const t = tournament(2022)
    const [fact] = factsFor(
        [t],
        [ko(t, 13, NICO, 3, SANTI, 0, { valid: false })]
    )
    assert.equal(phasesOf(fact).Nico, "semifinal")
    assert.equal(phasesOf(fact).Santi, "semifinal")
})

test("a final decided on penalties crowns playerThatWon", () => {
    const t = tournament(2022)
    const [fact] = factsFor(
        [t],
        [
            ko(t, 15, NICO, 1, SANTI, 1, {
                outcome: {
                    draw: true,
                    penalties: true,
                    playerThatWon: side(SANTI),
                    playerThatLost: side(NICO),
                },
            }),
        ]
    )
    assert.equal(fact.finalChampionFromMatch, SANTI.id)
    assert.equal(phasesOf(fact).Santi, "champion")
    assert.equal(phasesOf(fact).Nico, "final")
})

test("without a final the outcome champion is used only in closed tournaments", () => {
    const outcome = {
        champion: { player: side(NICO) },
        finalist: { player: side(SANTI) },
    }
    const closed = tournament(2022, { outcome })
    const [closedFact] = factsFor(
        [closed],
        [ko(closed, 13, NICO, 1, JUAN, 0), ko(closed, 14, SANTI, 1, PEDRO, 0)]
    )
    assert.equal(phasesOf(closedFact).Nico, "champion")
    assert.equal(phasesOf(closedFact).Santi, "final")

    const running = ongoing(2026, { outcome })
    const [runningFact] = factsFor(
        [running],
        [ko(running, 13, NICO, 1, JUAN, 0), ko(running, 14, SANTI, 1, PEDRO, 0)]
    )
    assert.equal(phasesOf(runningFact).Nico, "semifinal")
    assert.equal(phasesOf(runningFact).Santi, "semifinal")
})

test("closed tournaments are ordered by closedAt, then startedAt, then _id", () => {
    // `startedAt` y `_id` van al revés que `closedAt`.
    const a = tournament(2020, {
        _id: tournamentId(3),
        startedAt: yearDate(2030),
    })
    const b = tournament(2021, {
        _id: tournamentId(2),
        startedAt: yearDate(2029),
    })
    const c = tournament(2022, {
        _id: tournamentId(1),
        startedAt: yearDate(2010),
    })
    const all = [
        ...bracket(a, { champion: SANTI, finalist: JUAN, semis: [NICO] }),
        ...bracket(b, { champion: SANTI, finalist: JUAN, semis: [NICO] }),
        ...bracket(c, { champion: SANTI, finalist: JUAN, quarters: [NICO] }),
    ]
    assert.deepEqual(
        factsFor([a, b, c], all).map((fact) => fact.id),
        [c._id, b._id, a._id]
    )
    const nico = best(streaksFor([a, b, c], all).Nico, "T4")
    assert.equal(nico.count, 2)
    assert.equal(nico.isActive, false)
    assert.equal(nico.breakTournament.id, c._id)

    const sameClose = yearDate(2024)
    const older = tournament(2024, {
        _id: tournamentId(10),
        startedAt: yearDate(2018),
    })
    const newer = tournament(2025, {
        _id: tournamentId(9),
        closedAt: sameClose,
        startedAt: yearDate(2019),
    })
    const lowId = tournament(2026, {
        _id: tournamentId(7),
        closedAt: sameClose,
        startedAt: yearDate(2019),
    })
    const undated = tournament(2027, { closedAt: null })
    const tied = [older, newer, lowId, undated]
    assert.deepEqual(
        factsFor(
            tied,
            tied.flatMap((t) => bracket(t, { champion: SANTI, finalist: JUAN }))
        ).map((fact) => fact.id),
        [newer._id, lowId._id, older._id, undated._id]
    )
})

// --- Torneos en curso -------------------------------------------------------

// Dos torneos cerrados donde Nico fue campeón (T1, T2 y T4 en 2).
const nicoTitles = () => {
    const t24 = tournament(2024)
    const t25 = tournament(2025)
    return {
        tournaments: [t24, t25],
        matches: [
            ...bracket(t24, { champion: NICO, finalist: SANTI }),
            ...bracket(t25, { champion: NICO, finalist: SANTI }),
        ],
    }
}

test("an ongoing tournament where the player reached the semis extends and activates T4", () => {
    const history = nicoTitles()
    const running = ongoing(2026)
    const runningMatches = [ko(running, 13, NICO, 1, JUAN, 0)]
    const players = streaksFor(
        [...history.tournaments, running],
        [...history.matches, ...runningMatches]
    )

    const nico = best(players.Nico, "T4")
    assert.equal(nico.count, 3)
    assert.equal(nico.isActive, true)
    assert.equal(nico.endTournament.id, running._id)
    assert.equal(nico.endTournament.ongoing, true)
    assert.equal(nico.endTournament.phaseReached, "semifinal")
    assert.deepEqual(nico.endDate, runningMatches[0].playedAt)
    assert.equal(nico.endDatePrecision, "exact")
    // T2 y T1 todavía no se definen: se saltean, siguen activas en 2.
    assert.equal(best(players.Nico, "T2").count, 2)
    assert.equal(best(players.Nico, "T2").isActive, true)
    assert.equal(
        best(players.Nico, "T2").endTournament.id,
        history.tournaments[1]._id
    )
    assert.equal(best(players.Nico, "T1").isActive, true)

    // Asignado a un slot de semis sin jugar también es haber llegado.
    const assigned = streaksFor(
        [...history.tournaments, running],
        [
            ...history.matches,
            ko(running, 9, NICO, 1, PEDRO, 0),
            slot(running, 13, NICO, null),
        ]
    )
    assert.equal(best(assigned.Nico, "T4").count, 3)
    assert.equal(best(assigned.Nico, "T4").isActive, true)
})

test("ongoing semis that are not fully drawn skip the tournament for T4", () => {
    const history = nicoTitles()
    const running = ongoing(2026)
    const players = streaksFor(
        [...history.tournaments, running],
        [
            ...history.matches,
            // Nico ya quedó afuera en cuartos, pero el cuadro de semis no está.
            ko(running, 9, JUAN, 2, NICO, 0),
            slot(running, 13, JUAN, null),
        ]
    )

    const nico = best(players.Nico, "T4")
    assert.equal(nico.count, 2)
    assert.equal(nico.isActive, true)
    assert.equal(nico.breakTournament, null)
    assert.equal(current(players.Nico, "T4"), 2)
})

test("complete ongoing semis without the player break T4 with the phase so far", () => {
    const history = nicoTitles()
    const running = ongoing(2026)
    const players = streaksFor(
        [...history.tournaments, running],
        [
            ...history.matches,
            ko(running, 9, JUAN, 2, NICO, 0),
            slot(running, 13, JUAN, SANTI),
            slot(running, 14, PEDRO, LUCAS),
        ]
    )

    const nico = best(players.Nico, "T4")
    assert.equal(nico.count, 2)
    assert.equal(nico.isActive, false)
    assert.equal(nico.breakTournament.id, running._id)
    assert.equal(nico.breakTournament.ongoing, true)
    assert.equal(nico.breakTournament.phaseReached, "quarterfinal")
    assert.equal(nico.breakTournament.closedAt, null)
    assert.equal(current(players.Nico, "T4"), 0)
    // La final todavía no está asignada: T2 y T1 se saltean.
    assert.equal(best(players.Nico, "T2").isActive, true)
    assert.equal(best(players.Nico, "T1").isActive, true)
})

test("an ongoing final drawn without the player breaks T2; a half drawn one skips it", () => {
    const history = nicoTitles()
    const running = ongoing(2026)
    const semis = [
        ko(running, 13, SANTI, 2, NICO, 0),
        ko(running, 14, JUAN, 2, PEDRO, 0),
    ]

    const drawn = streaksFor(
        [...history.tournaments, running],
        [...history.matches, ...semis, slot(running, 15, SANTI, JUAN)]
    )
    const t2 = best(drawn.Nico, "T2")
    assert.equal(t2.isActive, false)
    assert.equal(t2.breakTournament.phaseReached, "semifinal")
    assert.equal(t2.breakTournament.ongoing, true)
    assert.equal(best(drawn.Nico, "T4").count, 3)
    assert.equal(best(drawn.Nico, "T4").isActive, true)

    const halfDrawn = streaksFor(
        [...history.tournaments, running],
        [...history.matches, ...semis, slot(running, 15, SANTI, null)]
    )
    assert.equal(best(halfDrawn.Nico, "T2").isActive, true)
    assert.equal(best(halfDrawn.Nico, "T2").count, 2)
})

test("an ongoing final played and lost breaks T1; an unplayed one skips it", () => {
    const history = nicoTitles()
    const running = ongoing(2026)
    const semis = [ko(running, 13, NICO, 2, JUAN, 0)]

    const lost = streaksFor(
        [...history.tournaments, running],
        [...history.matches, ...semis, ko(running, 15, SANTI, 2, NICO, 1)]
    )
    const t1 = best(lost.Nico, "T1")
    assert.equal(t1.count, 2)
    assert.equal(t1.isActive, false)
    assert.equal(t1.breakTournament.phaseReached, "final")
    assert.equal(best(lost.Nico, "T2").count, 3)
    assert.equal(best(lost.Nico, "T2").isActive, true)
    assert.equal(best(lost.Nico, "T4").count, 3)

    const pending = streaksFor(
        [...history.tournaments, running],
        [...history.matches, ...semis, slot(running, 15, SANTI, NICO)]
    )
    assert.equal(best(pending.Nico, "T1").count, 2)
    assert.equal(best(pending.Nico, "T1").isActive, true)
    assert.equal(
        best(pending.Nico, "T1").endTournament.id,
        history.tournaments[1]._id
    )
    assert.equal(best(pending.Nico, "T2").count, 3)

    const won = streaksFor(
        [...history.tournaments, running],
        [...history.matches, ...semis, ko(running, 15, NICO, 2, SANTI, 1)]
    )
    assert.equal(best(won.Nico, "T1").count, 3)
    assert.equal(best(won.Nico, "T1").isActive, true)
})

test("ongoing semis completeness for two legged ties with leg and legacy champions_league", () => {
    const cases = [
        {
            format: "playoff",
            quarter: 25,
            complete: (t) => [
                slot(t, 29, JUAN, SANTI, { leg: 1 }),
                slot(t, 29, SANTI, JUAN, { leg: 2 }),
                slot(t, 30, PEDRO, LUCAS, { leg: 1 }),
                slot(t, 30, LUCAS, PEDRO, { leg: 2 }),
            ],
            incomplete: (t) => [
                slot(t, 29, JUAN, SANTI, { leg: 1 }),
                slot(t, 29, SANTI, JUAN, { leg: 2 }),
                slot(t, 30, PEDRO, null, { leg: 1 }),
            ],
        },
        {
            format: "champions_league",
            quarter: 17,
            complete: (t) => [
                slot(t, 25, JUAN, SANTI),
                slot(t, 26, SANTI, JUAN),
                slot(t, 27, PEDRO, LUCAS),
                slot(t, 28, LUCAS, PEDRO),
            ],
            // Sólo la llave 25/26 tiene a sus dos participantes.
            incomplete: (t) => [
                slot(t, 25, JUAN, SANTI),
                slot(t, 26, SANTI, JUAN),
            ],
        },
    ]

    for (const { format, quarter, complete, incomplete } of cases) {
        const history = nicoTitles()
        const running = ongoing(2026, { format, playoffMode: "two_legged" })
        const out = ko(running, quarter, JUAN, 2, NICO, 0)

        const full = streaksFor(
            [...history.tournaments, running],
            [...history.matches, out, ...complete(running)]
        )
        const broken = best(full.Nico, "T4")
        assert.equal(broken.isActive, false, format)
        assert.equal(
            broken.breakTournament.phaseReached,
            "quarterfinal",
            format
        )

        const partial = streaksFor(
            [...history.tournaments, running],
            [...history.matches, out, ...incomplete(running)]
        )
        assert.equal(best(partial.Nico, "T4").isActive, true, format)
        assert.equal(best(partial.Nico, "T4").count, 2, format)
    }
})

test("ongoing tournaments are the newest, even before a later closedAt", () => {
    const t24 = tournament(2024)
    const late = tournament(2026, {
        _id: tournamentId(3026),
        closedAt: yearDate(2026, 12),
    })
    const running = ongoing(2026)
    const otherRunning = ongoing(2025, { startedAt: yearDate(2025, 1) })
    const all = [
        ...bracket(t24, { champion: SANTI, finalist: JUAN, semis: [NICO] }),
        ...bracket(late, { champion: SANTI, finalist: JUAN, quarters: [NICO] }),
        ko(running, 13, NICO, 1, PEDRO, 0),
        ko(otherRunning, 13, NICO, 1, PEDRO, 0),
    ]

    const facts = factsFor([t24, late, running, otherRunning], all)
    // Entre los en curso, por último partido jugado.
    assert.deepEqual(
        facts.map((fact) => fact.id),
        [running._id, otherRunning._id, late._id, t24._id]
    )
    assert.ok(facts[0].lastPlayedAt < late.closedAt)

    const nico = best(
        streaksFor([t24, late, running, otherRunning], all).Nico,
        "T4"
    )
    assert.equal(nico.count, 2)
    assert.equal(nico.isActive, true)
    assert.equal(nico.endTournament.id, running._id)
    assert.equal(nico.startTournament.id, otherRunning._id)
})

// --- Controller -------------------------------------------------------------

const closedHistory = () => {
    const t20 = tournament(2020)
    const t21 = tournament(2021)
    const t22 = tournament(2022)
    return {
        tournaments: [t20, t21, t22],
        matches: [
            ...bracket(t20, {
                champion: NICO,
                finalist: SANTI,
                semis: [JUAN, PEDRO],
            }),
            ...bracket(t21, {
                champion: NICO,
                finalist: JUAN,
                semis: [SANTI, PEDRO],
            }),
            ...bracket(t22, {
                champion: SANTI,
                finalist: NICO,
                semis: [JUAN, LUCAS],
                quarters: [PEDRO],
            }),
        ],
    }
}

test("global statistics read users, matches and tournaments once each, in parallel", async () => {
    const calls = []
    const history = closedHistory()
    const body = await runStatistics({
        ...history,
        retrieveAllUsers: async () => {
            calls.push("users")
            return USERS
        },
        retrieveAllMatches: async (options) => {
            calls.push(["matches", options])
            return newestFirst(history.matches)
        },
        retrieveTournamentsForStatistics: async () => {
            calls.push("tournaments")
            return history.tournaments
        },
        retrieveTournamentById: async () => {
            throw new Error("no debe consultarse el torneo en modo global")
        },
        orderMatchesFromTournamentById: async () => {
            throw new Error("no debe ordenarse por torneo en modo global")
        },
    })

    assert.equal(calls.length, 3)
    assert.deepEqual(calls, [
        "users",
        ["matches", { includeAllPlayoffs: true }],
        "tournaments",
    ])
    assert.equal(body.records.most_consecutive_titles.count, 2)
    assert.equal(body.records.most_consecutive_titles.players[0].id, NICO.id)
})

test("tournament streak holders and summaries have the documented shape", async () => {
    const body = await runStatistics(closedHistory())

    const titles = body.records.most_consecutive_titles
    assert.equal(titles.count, 2)
    const [nico] = titles.players
    assert.deepEqual(Object.keys(nico), [
        "id",
        "name",
        "date",
        "datePrecision",
        "isActive",
        "startDate",
        "startDatePrecision",
        "endDate",
        "endDatePrecision",
        "startTournament",
        "endTournament",
        "breakTournament",
    ])
    const summaryKeys = [
        "id",
        "name",
        "phaseReached",
        "ongoing",
        "closedAt",
        "closedAtPrecision",
        "lastPlayedAt",
        "lastPlayedAtPrecision",
        "firstPlayoffPlayedAt",
        "firstPlayoffPlayedAtPrecision",
        "lastPlayoffPlayedAt",
        "lastPlayoffPlayedAtPrecision",
        "firstSemifinalPlayedAt",
        "firstSemifinalPlayedAtPrecision",
        "lastSemifinalPlayedAt",
        "lastSemifinalPlayedAtPrecision",
        "firstFinalPlayedAt",
        "firstFinalPlayedAtPrecision",
        "lastFinalPlayedAt",
        "lastFinalPlayedAtPrecision",
    ]
    for (const key of ["startTournament", "endTournament", "breakTournament"]) {
        assert.deepEqual(Object.keys(nico[key]), summaryKeys, key)
    }
    assert.deepEqual(nico.breakTournament, {
        id: tournamentId(2022),
        name: "Torneo 2022",
        phaseReached: "final",
        ongoing: false,
        closedAt: yearDate(2022),
        closedAtPrecision: "exact",
        lastPlayedAt: nico.breakTournament.lastPlayedAt,
        lastPlayedAtPrecision: "exact",
        firstPlayoffPlayedAt: nico.breakTournament.firstPlayoffPlayedAt,
        firstPlayoffPlayedAtPrecision: "exact",
        lastPlayoffPlayedAt: nico.breakTournament.lastPlayoffPlayedAt,
        lastPlayoffPlayedAtPrecision: "exact",
        firstSemifinalPlayedAt: nico.breakTournament.firstSemifinalPlayedAt,
        firstSemifinalPlayedAtPrecision: "exact",
        lastSemifinalPlayedAt: nico.breakTournament.lastSemifinalPlayedAt,
        lastSemifinalPlayedAtPrecision: "exact",
        firstFinalPlayedAt: nico.breakTournament.firstFinalPlayedAt,
        firstFinalPlayedAtPrecision: "exact",
        lastFinalPlayedAt: nico.breakTournament.lastFinalPlayedAt,
        lastFinalPlayedAtPrecision: "exact",
    })
    // Nico perdió la final de 2022 tras ganar la semi 13.
    assert.ok(nico.breakTournament.lastSemifinalPlayedAt)
    assert.ok(nico.breakTournament.firstFinalPlayedAt)
    assert.ok(
        nico.breakTournament.lastSemifinalPlayedAt <
            nico.breakTournament.firstFinalPlayedAt
    )
    assert.equal(nico.isActive, false)
    assert.deepEqual(nico.startDate, yearDate(2020))
    assert.deepEqual(nico.endDate, yearDate(2021))
    assert.deepEqual(nico.date, nico.endDate)
    assert.equal(nico.startTournament.phaseReached, "champion")

    // Finales: Nico llegó a las 3 y sigue activa.
    const finals = body.activeStreaks.most_consecutive_finals
    assert.equal(finals.count, 3)
    assert.equal(finals.players[0].id, NICO.id)
    assert.equal(finals.players[0].breakTournament, null)
})

test("tournament summaries carry the player's first and last listed playoff match", () => {
    const t = tournament(2020)
    const at = (day) => new Date(Date.UTC(2020, 4, day, 12))
    const all = [
        // Regular y play-in no son playoff: no cuentan aunque sean extremos.
        regular(t, NICO, SANTI),
        game(t, "playin", 1, NICO, 1, PEDRO, 0, { playedAt: at(1) }),
        ko(t, 9, NICO, 2, PEDRO, 0, {
            playedAt: at(3),
            playedAtPrecision: "day",
        }),
        ko(t, 13, NICO, 2, JUAN, 0, { playedAt: at(10) }),
        ko(t, 15, NICO, 1, SANTI, 0, { playedAt: at(20) }),
        // /matches no lista los `valid: false` ni los slots sin jugar.
        ko(t, 10, NICO, 3, LUCAS, 0, { valid: false, playedAt: at(28) }),
        slot(t, 14, MATI, FEDE),
    ]

    const streaks = streaksFor([t], all)
    const nico = best(streaks.Nico, "T4").startTournament
    assert.deepEqual(nico.firstPlayoffPlayedAt, at(3))
    assert.equal(nico.firstPlayoffPlayedAtPrecision, "day")
    assert.deepEqual(nico.lastPlayoffPlayedAt, at(20))
    assert.equal(nico.lastPlayoffPlayedAtPrecision, "exact")

    // Por ronda: la semi del 10 y la final del 20.
    assert.deepEqual(nico.firstSemifinalPlayedAt, at(10))
    assert.deepEqual(nico.lastSemifinalPlayedAt, at(10))
    assert.equal(nico.lastSemifinalPlayedAtPrecision, "exact")
    assert.deepEqual(nico.firstFinalPlayedAt, at(20))
    assert.deepEqual(nico.lastFinalPlayedAt, at(20))

    const santi = best(streaks.Santi, "T4").startTournament
    assert.deepEqual(santi.firstPlayoffPlayedAt, at(20))
    assert.deepEqual(santi.lastPlayoffPlayedAt, at(20))
    // Llegó a la final sin semi registrada: sin fechas de semis.
    assert.equal(santi.firstSemifinalPlayedAt, null)
    assert.equal(santi.lastSemifinalPlayedAt, null)
    assert.deepEqual(santi.firstFinalPlayedAt, at(20))

    // Llegó a semis sólo por un slot asignado sin jugar.
    const mati = best(streaks.Mati, "T4").startTournament
    assert.equal(mati.phaseReached, "semifinal")
    assert.equal(mati.firstPlayoffPlayedAt, null)
    assert.equal(mati.firstPlayoffPlayedAtPrecision, null)
    assert.equal(mati.lastPlayoffPlayedAt, null)
    assert.equal(mati.lastPlayoffPlayedAtPrecision, null)
    assert.equal(mati.firstSemifinalPlayedAt, null)
    assert.equal(mati.firstFinalPlayedAt, null)
})

test("round dates follow each format's bracket: legacy CL legs and two-legged ties", () => {
    const at = (day) => new Date(Date.UTC(2021, 3, day, 12))

    // CL legacy: semis 25-28 (ida y vuelta en ids consecutivos), final 29.
    const cl = tournament(2021, { format: "champions_league" })
    const clStreaks = streaksFor(
        [cl],
        [
            ko(cl, 24, NICO, 2, PEDRO, 0, { playedAt: at(1) }),
            ko(cl, 25, NICO, 1, JUAN, 0, { playedAt: at(5) }),
            ko(cl, 26, JUAN, 0, NICO, 0, { playedAt: at(12) }),
            ko(cl, 29, NICO, 2, SANTI, 1, { playedAt: at(20) }),
        ]
    )
    const clNico = best(clStreaks.Nico, "T1").startTournament
    assert.equal(clNico.phaseReached, "champion")
    assert.deepEqual(clNico.firstPlayoffPlayedAt, at(1))
    assert.deepEqual(clNico.firstSemifinalPlayedAt, at(5))
    assert.deepEqual(clNico.lastSemifinalPlayedAt, at(12))
    assert.deepEqual(clNico.firstFinalPlayedAt, at(20))
    assert.deepEqual(clNico.lastFinalPlayedAt, at(20))

    // Ida y vuelta con `leg`: las dos piernas comparten `playoff_id`.
    const twoLegged = tournament(2022, {
        format: "playoff",
        playoffMode: "two_legged",
    })
    const legStreaks = streaksFor(
        [twoLegged],
        [
            ko(twoLegged, 29, NICO, 1, JUAN, 0, { leg: 1, playedAt: at(3) }),
            ko(twoLegged, 29, JUAN, 1, NICO, 1, { leg: 2, playedAt: at(9) }),
            ko(twoLegged, 31, NICO, 0, SANTI, 0, { leg: 1, playedAt: at(15) }),
            ko(twoLegged, 31, SANTI, 0, NICO, 2, { leg: 2, playedAt: at(22) }),
        ]
    )
    const legNico = best(legStreaks.Nico, "T4").startTournament
    assert.deepEqual(legNico.firstSemifinalPlayedAt, at(3))
    assert.deepEqual(legNico.lastSemifinalPlayedAt, at(9))
    assert.deepEqual(legNico.firstFinalPlayedAt, at(15))
    assert.deepEqual(legNico.lastFinalPlayedAt, at(22))
})

test("tournament active streaks are null below 2", async () => {
    const history = closedHistory()
    const t23 = tournament(2023)
    const body = await runStatistics({
        tournaments: [...history.tournaments, t23],
        matches: [
            ...history.matches,
            ...bracket(t23, {
                champion: MATI,
                finalist: FEDE,
                semis: [LUCAS],
                quarters: [NICO, SANTI, JUAN],
            }),
        ],
    })

    assert.equal(body.activeStreaks.most_consecutive_titles, null)
    assert.equal(body.activeStreaks.most_consecutive_finals, null)
    // Lucas: semis en 2022 y 2023.
    assert.equal(body.activeStreaks.most_consecutive_semifinals.count, 2)
    assert.equal(
        body.activeStreaks.most_consecutive_semifinals.players[0].id,
        LUCAS.id
    )
    assert.equal(body.records.most_consecutive_titles.count, 2)
})

test("valid false and unplayed playoff matches only feed the tournament streaks", async () => {
    const history = closedHistory()
    const t23 = tournament(2023)
    const visible = [
        ...history.matches,
        ko(t23, 13, NICO, 2, JUAN, 1),
        ko(t23, 14, NICO, 1, SANTI, 0),
    ]
    const hidden = [
        ko(t23, 15, NICO, 3, NICO, 0, { valid: false }),
        ko(t23, 9, PEDRO, 3, LUCAS, 0, { valid: false }),
        slot(t23, 10, MATI, FEDE),
    ]
    const tournaments = [...history.tournaments, t23]

    const withHidden = await runStatistics({
        tournaments,
        matches: [...visible, ...hidden],
    })
    const withoutHidden = await runStatistics({
        tournaments,
        matches: visible,
    })

    const withoutTournamentKeys = (section) =>
        Object.fromEntries(
            Object.entries(section).filter(
                ([key]) => !TOURNAMENT_KEYS.includes(key)
            )
        )
    for (const key of [
        "scope",
        "players",
        "decisiveMatchesStats",
        "leaderboards",
    ]) {
        assert.deepEqual(withHidden[key], withoutHidden[key], key)
    }
    assert.deepEqual(
        withoutTournamentKeys(withHidden.records),
        withoutTournamentKeys(withoutHidden.records)
    )
    assert.deepEqual(
        withoutTournamentKeys(withHidden.activeStreaks),
        withoutTournamentKeys(withoutHidden.activeStreaks)
    )

    // La final `valid: false` sí cuenta para las de torneo.
    assert.equal(
        withHidden.records.most_consecutive_finals.players[0].endTournament
            .phaseReached,
        "champion"
    )
    assert.equal(
        withHidden.activeStreaks.most_consecutive_finals.players[0].id,
        NICO.id
    )
    assert.equal(withHidden.activeStreaks.most_consecutive_finals.count, 4)
    assert.equal(withoutHidden.activeStreaks.most_consecutive_finals, null)
})

test("a failed tournaments read omits the tournament streaks and logs a warning", async () => {
    const warnings = []
    const failure = Object.assign(new Error("Mongo failed"), {
        name: "MongoServerError",
        code: 13,
    })
    const body = await runStatistics({
        ...closedHistory(),
        retrieveTournamentsForStatistics: async () => {
            throw failure
        },
        logger: {
            warn: (event, fields) => warnings.push([event, fields]),
            info: () => {},
            error: () => {},
        },
    })

    for (const key of TOURNAMENT_KEYS) {
        assert.equal(key in body.records, false, key)
        assert.equal(key in body.activeStreaks, false, key)
    }
    for (const key of KNOCKOUT_KEYS) {
        assert.ok(key in body.records, key)
        assert.ok(key in body.activeStreaks, key)
    }
    assert.ok(body.records.most_knockout_wins_in_a_row)
    assert.deepEqual(warnings, [
        [
            "statistics_tournament_streaks_unavailable",
            { requestId: "req-1", errorName: "MongoServerError", code: 13 },
        ],
    ])
})

test("tournament scoped statistics skip the tournaments read and null the new streaks", async () => {
    let tournamentsCalls = 0
    const controller = createGetStatistics({
        retrieveAllUsers: async () => {
            throw new Error("no deben consultarse todos los usuarios")
        },
        retrieveAllMatches: async () => {
            throw new Error("no deben consultarse todos los partidos")
        },
        retrieveTournamentsForStatistics: async () => {
            tournamentsCalls += 1
            return []
        },
        retrieveTournamentById: async () => ({
            players: [{ id: NICO.id, nickname: "Nico" }],
        }),
        orderMatchesFromTournamentById: async () => [],
    })
    const response = createResponse()

    await controller({ query: { tournament: tournamentId(2020) } }, response)

    assert.equal(response.statusCode, 200)
    assert.equal(tournamentsCalls, 0)
    for (const key of [...KNOCKOUT_KEYS, ...TOURNAMENT_KEYS]) {
        assert.equal(response.body.records[key], null, key)
        assert.equal(response.body.activeStreaks[key], null, key)
    }
})
