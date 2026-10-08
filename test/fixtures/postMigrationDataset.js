// Dataset en forma post-migración para test/postMigrationBaseline.test.js.
// Todos los partidos jugados tienen `playedAt` + `playedAtPrecision`, los ids
// de equipo son number y cada documento lleva un `updatedAt` distinto de su
// `playedAt` (en orden inverso), para que la baseline detecte si alguien lo lee.

const IDS = {
    U1: "630000000000000000000001",
    U2: "630000000000000000000002",
    U3: "630000000000000000000003",
    L: "640000000000000000000001",
    G: "640000000000000000000002",
    P: "640000000000000000000003",
    LEGACY: "640000000000000000000004",
}

const PLAYERS = {
    U1: { id: IDS.U1, name: "Nico" },
    U2: { id: IDS.U2, name: "Santi" },
    U3: { id: IDS.U3, name: "Fer" },
}

const TEAMS = {
    1: { id: 1, name: "Racing" },
    2: { id: 2, name: "Boca" },
    3: { id: 3, name: "River" },
    7: { id: 7, name: "Independiente" },
    8: { id: 8, name: "San Lorenzo" },
    21: { id: 21, name: "Milan" },
    22: { id: 22, name: "Inter" },
    23: { id: 23, name: "Juventus" },
    24: { id: 24, name: "Roma" },
    25: { id: 25, name: "Lazio" },
    26: { id: 26, name: "Napoli" },
    31: { id: 31, name: "Liverpool" },
    32: { id: 32, name: "Chelsea" },
    33: { id: 33, name: "Arsenal" },
    34: { id: 34, name: "Everton" },
}

const TOURNAMENT_REFS = {
    L: { id: IDS.L, name: "Liga 2024" },
    G: { id: IDS.G, name: "Liga con playin 2025" },
    P: { id: IDS.P, name: "Copa 2024" },
}

// `updatedAt` en orden inverso a `playedAt`: ordenar por `updatedAt` daría
// otro resultado.
const ANCHOR = Date.UTC(2020, 0, 1)
const MIRROR = Date.UTC(2031, 0, 1)
const mirroredUpdatedAt = (playedAt) =>
    new Date(MIRROR - (playedAt.getTime() - ANCHOR))

// Misma forma que `calculateOutcome` de putMatchByTournamentId.
const outcomeFor = ({
    playerP1,
    teamP1,
    seedP1,
    scoreP1,
    penaltyScoreP1,
    playerP2,
    teamP2,
    seedP2,
    scoreP2,
    penaltyScoreP2,
}) => {
    const isKnockout = Boolean(seedP1 && seedP2)
    if (!isKnockout && scoreP1 === scoreP2) {
        return { draw: true, penalties: false }
    }
    const p1Won =
        scoreP1 !== scoreP2
            ? scoreP1 > scoreP2
            : penaltyScoreP1 > penaltyScoreP2
    const winner = p1Won
        ? { player: playerP1, team: teamP1, seed: seedP1 }
        : { player: playerP2, team: teamP2, seed: seedP2 }
    const loser = p1Won
        ? { player: playerP2, team: teamP2, seed: seedP2 }
        : { player: playerP1, team: teamP1, seed: seedP1 }
    const decidedByPenalties = isKnockout && scoreP1 === scoreP2
    const outcome = {
        playerThatWon: winner.player,
        teamThatWon: winner.team,
        scoreFromTeamThatWon: decidedByPenalties
            ? Math.max(penaltyScoreP1, penaltyScoreP2)
            : Math.max(scoreP1, scoreP2),
        playerThatLost: loser.player,
        teamThatLost: loser.team,
        scoreFromTeamThatLost: decidedByPenalties
            ? Math.min(penaltyScoreP1, penaltyScoreP2)
            : Math.min(scoreP1, scoreP2),
        draw: decidedByPenalties,
    }
    if (isKnockout) {
        outcome.seedFromTeamThatWon = winner.seed
        outcome.seedFromTeamThatLost = loser.seed
    }
    if (decidedByPenalties) outcome.penalties = true
    else outcome.scoringDifference = Math.abs(scoreP1 - scoreP2)
    return outcome
}

let sequence = 0
const nextMatchId = () => {
    sequence += 1
    return `65${String(sequence).padStart(22, "0")}`
}

const played = ({
    tournament,
    type = "regular",
    group,
    playoffId,
    p1,
    t1,
    s1,
    seed1,
    pen1,
    p2,
    t2,
    s2,
    seed2,
    pen2,
    playedAt,
    precision,
    valid,
}) => {
    const sides = {
        playerP1: PLAYERS[p1],
        teamP1: TEAMS[t1],
        scoreP1: s1,
        playerP2: PLAYERS[p2],
        teamP2: TEAMS[t2],
        scoreP2: s2,
    }
    if (seed1) sides.seedP1 = seed1
    if (seed2) sides.seedP2 = seed2

    const date = new Date(playedAt)
    const match = {
        _id: nextMatchId(),
        ...sides,
        outcome: outcomeFor({
            ...sides,
            penaltyScoreP1: pen1,
            penaltyScoreP2: pen2,
        }),
        tournament: tournament ? TOURNAMENT_REFS[tournament] : null,
        type,
        played: true,
        playedAt: date,
        playedAtPrecision: precision,
        schemaVersion: 1,
        createdAt: new Date(ANCHOR),
        updatedAt: mirroredUpdatedAt(date),
    }
    if (group) match.group = group
    if (playoffId !== undefined) match.playoff_id = playoffId
    if (valid !== undefined) match.valid = valid
    return match
}

const notPlayed = ({
    tournament,
    type = "regular",
    playoffId,
    p1,
    t1,
    p2,
    t2,
}) => {
    const match = {
        _id: nextMatchId(),
        playerP1: p1 ? PLAYERS[p1] : null,
        teamP1: t1 ? TEAMS[t1] : null,
        playerP2: p2 ? PLAYERS[p2] : null,
        teamP2: t2 ? TEAMS[t2] : null,
        tournament: TOURNAMENT_REFS[tournament],
        type,
        played: false,
        schemaVersion: 1,
        createdAt: new Date(ANCHOR),
        updatedAt: new Date("2030-06-01T12:00:00.000Z"),
    }
    if (playoffId !== undefined) match.playoff_id = playoffId
    return match
}

const createMatches = () => {
    sequence = 0
    return [
        // Liga L: ida y vuelta entre 3 jugadores, precisiones mezcladas.
        played({
            tournament: "L",
            p1: "U1",
            t1: 1,
            s1: 2,
            p2: "U2",
            t2: 2,
            s2: 0,
            playedAt: "2024-03-02T20:00:00.000Z",
            precision: "exact",
        }),
        played({
            tournament: "L",
            p1: "U2",
            t1: 2,
            s1: 1,
            p2: "U3",
            t2: 3,
            s2: 1,
            playedAt: "2024-03-03T00:00:00.000Z",
            precision: "day",
        }),
        played({
            tournament: "L",
            p1: "U3",
            t1: 3,
            s1: 0,
            p2: "U1",
            t2: 1,
            s2: 3,
            playedAt: "2024-03-05T22:30:00.000Z",
            precision: "exact",
        }),
        played({
            tournament: "L",
            p1: "U2",
            t1: 2,
            s1: 0,
            p2: "U1",
            t2: 1,
            s2: 1,
            playedAt: "2024-03-08T00:00:00.000Z",
            precision: "day",
        }),
        played({
            tournament: "L",
            p1: "U1",
            t1: 1,
            s1: 4,
            p2: "U3",
            t2: 3,
            s2: 0,
            playedAt: "2024-03-09T20:00:00.000Z",
            precision: "exact",
            valid: false,
        }),
        played({
            tournament: "L",
            p1: "U3",
            t1: 3,
            s1: 2,
            p2: "U2",
            t2: 2,
            s2: 2,
            playedAt: "2024-03-10T21:00:00.000Z",
            precision: "exact",
        }),
        notPlayed({ tournament: "L", p1: "U1", t1: 1, p2: "U3", t2: 3 }),
        // Amistoso sin torneo, precisión de año.
        played({
            tournament: null,
            p1: "U1",
            t1: 7,
            s1: 1,
            p2: "U2",
            t2: 8,
            s2: 2,
            playedAt: "2023-01-01T00:00:00.000Z",
            precision: "year",
        }),
        // Torneo G: grupos A y B.
        played({
            tournament: "G",
            group: "A",
            p1: "U1",
            t1: 21,
            s1: 3,
            p2: "U2",
            t2: 22,
            s2: 1,
            playedAt: "2025-05-01T19:00:00.000Z",
            precision: "exact",
        }),
        played({
            tournament: "G",
            group: "A",
            p1: "U2",
            t1: 22,
            s1: 2,
            p2: "U3",
            t2: 23,
            s2: 2,
            playedAt: "2025-05-02T00:00:00.000Z",
            precision: "day",
        }),
        played({
            tournament: "G",
            group: "A",
            p1: "U3",
            t1: 23,
            s1: 0,
            p2: "U1",
            t2: 21,
            s2: 1,
            playedAt: "2025-05-03T20:00:00.000Z",
            precision: "exact",
        }),
        played({
            tournament: "G",
            group: "B",
            p1: "U1",
            t1: 24,
            s1: 1,
            p2: "U2",
            t2: 25,
            s2: 0,
            playedAt: "2025-05-01T20:00:00.000Z",
            precision: "exact",
        }),
        played({
            tournament: "G",
            group: "B",
            p1: "U2",
            t1: 25,
            s1: 2,
            p2: "U3",
            t2: 26,
            s2: 0,
            playedAt: "2025-05-04T00:00:00.000Z",
            precision: "day",
        }),
        played({
            tournament: "G",
            group: "B",
            p1: "U3",
            t1: 26,
            s1: 3,
            p2: "U1",
            t2: 24,
            s2: 3,
            playedAt: "2025-05-05T18:00:00.000Z",
            precision: "exact",
        }),
        // Playin de G: playoff_id 1/3 (primera ronda) y 5/6 (segunda).
        played({
            tournament: "G",
            type: "playin",
            playoffId: 1,
            p1: "U3",
            t1: 23,
            seed1: "2",
            s1: 2,
            p2: "U2",
            t2: 22,
            seed2: "3",
            s2: 1,
            playedAt: "2025-05-10T19:00:00.000Z",
            precision: "exact",
        }),
        played({
            tournament: "G",
            type: "playin",
            playoffId: 3,
            p1: "U2",
            t1: 25,
            seed1: "2",
            s1: 0,
            p2: "U3",
            t2: 26,
            seed2: "3",
            s2: 1,
            playedAt: "2025-05-10T20:00:00.000Z",
            precision: "exact",
        }),
        played({
            tournament: "G",
            type: "playin",
            playoffId: 5,
            p1: "U1",
            t1: 21,
            seed1: "1",
            s1: 2,
            p2: "U2",
            t2: 22,
            seed2: "3",
            s2: 0,
            playedAt: "2025-05-11T00:00:00.000Z",
            precision: "day",
        }),
        played({
            tournament: "G",
            type: "playin",
            playoffId: 6,
            p1: "U1",
            t1: 24,
            seed1: "1",
            s1: 2,
            p2: "U2",
            t2: 25,
            seed2: "2",
            s2: 3,
            playedAt: "2025-05-11T21:00:00.000Z",
            precision: "exact",
        }),
        // Slot de semifinal de G todavía sin asignar ni jugar.
        notPlayed({ tournament: "G", type: "playoff", playoffId: 13 }),
        // Torneo P (playoff de 32): semis 29/30 y final 31.
        played({
            tournament: "P",
            type: "playoff",
            playoffId: 29,
            p1: "U1",
            t1: 31,
            seed1: "1",
            s1: 1,
            pen1: 3,
            p2: "U2",
            t2: 32,
            seed2: "4",
            s2: 1,
            pen2: 4,
            playedAt: "2024-11-01T00:00:00.000Z",
            precision: "day",
        }),
        played({
            tournament: "P",
            type: "playoff",
            playoffId: 30,
            p1: "U3",
            t1: 33,
            seed1: "2",
            s1: 2,
            p2: "U1",
            t2: 34,
            seed2: "3",
            s2: 0,
            playedAt: "2024-11-02T20:00:00.000Z",
            precision: "exact",
        }),
        played({
            tournament: "P",
            type: "playoff",
            playoffId: 31,
            p1: "U2",
            t1: 32,
            seed1: "4",
            s1: 1,
            p2: "U3",
            t2: 33,
            seed2: "2",
            s2: 3,
            playedAt: "2024-11-15T00:00:00.000Z",
            precision: "day",
        }),
    ]
}

const playerList = () => [PLAYERS.U1, PLAYERS.U2, PLAYERS.U3]

const entry = (team, player, group) => {
    const value = { team: TEAMS[team], player: PLAYERS[player] }
    if (group) value.group = group
    return value
}

const createTournaments = () => [
    {
        _id: IDS.L,
        name: TOURNAMENT_REFS.L.name,
        format: "league",
        players: playerList(),
        teams: [entry(1, "U1"), entry(2, "U2"), entry(3, "U3")],
        ongoing: false,
        outcome: {
            champion: { team: TEAMS[1], player: PLAYERS.U1 },
            finalist: { team: TEAMS[2], player: PLAYERS.U2 },
        },
        legacy: false,
        cloudinary_id: "liga-2024",
        startedAt: new Date("2024-03-02T20:00:00.000Z"),
        startedAtPrecision: "exact",
        closedAt: new Date("2024-03-10T21:00:00.000Z"),
        closedAtPrecision: "exact",
        schemaVersion: 1,
        createdAt: new Date("2024-02-28T10:00:00.000Z"),
        updatedAt: new Date("2030-01-01T00:00:00.000Z"),
    },
    {
        _id: IDS.G,
        name: TOURNAMENT_REFS.G.name,
        format: "league_playin_playoff",
        groups: ["A", "B"],
        players: playerList(),
        teams: [
            entry(21, "U1", "A"),
            entry(22, "U2", "A"),
            entry(23, "U3", "A"),
            entry(24, "U1", "B"),
            entry(25, "U2", "B"),
            entry(26, "U3", "B"),
        ],
        ongoing: true,
        legacy: false,
        cloudinary_id: "liga-playin-2025",
        startedAt: new Date("2025-05-01T19:00:00.000Z"),
        startedAtPrecision: "exact",
        schemaVersion: 1,
        createdAt: new Date("2019-04-30T10:00:00.000Z"),
        updatedAt: new Date("2029-01-01T00:00:00.000Z"),
    },
    {
        _id: IDS.P,
        name: TOURNAMENT_REFS.P.name,
        format: "playoff",
        playoffMode: "single",
        players: playerList(),
        teams: [
            entry(31, "U1"),
            entry(32, "U2"),
            entry(33, "U3"),
            entry(34, "U1"),
        ],
        ongoing: false,
        outcome: {
            champion: { team: TEAMS[33], player: PLAYERS.U3 },
            finalist: { team: TEAMS[32], player: PLAYERS.U2 },
        },
        legacy: false,
        cloudinary_id: "copa-2024",
        startedAt: new Date("2024-11-01T00:00:00.000Z"),
        startedAtPrecision: "day",
        closedAt: new Date("2024-11-15T00:00:00.000Z"),
        closedAtPrecision: "day",
        schemaVersion: 1,
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        updatedAt: new Date("2028-01-01T00:00:00.000Z"),
    },
    {
        _id: IDS.LEGACY,
        name: "Torneo histórico 2019",
        format: "league",
        players: playerList(),
        teams: [entry(1, "U1"), entry(2, "U2"), entry(3, "U3")],
        ongoing: false,
        outcome: {
            champion: { team: TEAMS[2], player: PLAYERS.U2 },
            finalist: { team: TEAMS[3], player: PLAYERS.U3 },
        },
        legacy: true,
        cloudinary_id: "historico-2019",
        startedAt: new Date("2019-01-01T00:00:00.000Z"),
        startedAtPrecision: "year",
        closedAt: new Date("2019-01-01T00:00:00.000Z"),
        closedAtPrecision: "year",
        createdAt: new Date("2027-06-01T10:00:00.000Z"),
        updatedAt: new Date("2027-06-01T10:00:00.000Z"),
    },
]

const createUsers = () =>
    Object.values(PLAYERS).map(({ id, name }) => ({
        _id: id,
        nickname: name,
        email: `${name.toLowerCase()}@example.com`,
        role: "user",
        date: new Date("2022-08-27T00:00:00.000Z"),
    }))

const createDataset = () => ({
    users: createUsers(),
    tournaments: createTournaments(),
    matches: createMatches(),
})

module.exports = { IDS, createDataset }
