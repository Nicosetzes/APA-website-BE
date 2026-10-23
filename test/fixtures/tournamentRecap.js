// Fixtures del recap de torneo: partidos y torneos mínimos armados a mano (con
// el mismo `outcome` que guarda la app) y un generador de torneos grandes.
// Sin Mongo: todo en memoria.
const { buildRatingsTimeline } = require("../../service/playerRatings/timeline")

const id24 = (n) => n.toString(16).padStart(24, "0")

const BASE_TIME = Date.parse("2026-03-01T15:00:00.000Z")
const HOUR = 60 * 60 * 1000

const NICO = { id: id24(1), name: "Nico" }
const LEO = { id: id24(2), name: "Leo" }
const MAX = { id: id24(3), name: "Max" }
const SANTI = { id: id24(4), name: "Santi" }
const LUCHO = { id: id24(5), name: "Lucho" }

const team = (id, name) => ({ id, name })

// `outcome` como lo calcula `putMatchByTournamentId`.
//  - empate sin penales: `{ draw: true, penalties: false }`
//  - victoria: ganador, perdedor y goles; `draw: false`
//  - penales: goles iguales, `outcome.scoreFromTeamThatWon/Lost` son penales
const buildOutcome = ({
    p1,
    t1,
    s1,
    p2,
    t2,
    s2,
    pens = null,
    seeds = null,
}) => {
    if (s1 === s2 && !pens) return { draw: true, penalties: false }

    const p1Won = s1 !== s2 ? s1 > s2 : pens[0] > pens[1]
    const winner = p1Won
        ? { player: p1, team: t1, seed: seeds?.[0] }
        : { player: p2, team: t2, seed: seeds?.[1] }
    const loser = p1Won
        ? { player: p2, team: t2, seed: seeds?.[1] }
        : { player: p1, team: t1, seed: seeds?.[0] }
    const byPenalties = s1 === s2
    const outcome = {
        playerThatWon: winner.player,
        teamThatWon: winner.team,
        scoreFromTeamThatWon: byPenalties
            ? Math.max(...pens)
            : Math.max(s1, s2),
        playerThatLost: loser.player,
        teamThatLost: loser.team,
        scoreFromTeamThatLost: byPenalties
            ? Math.min(...pens)
            : Math.min(s1, s2),
        draw: byPenalties,
    }

    if (byPenalties) outcome.penalties = true
    else outcome.scoringDifference = Math.abs(s1 - s2)

    return outcome
}

// Partido jugado. `n` ordena: fecha = base + n horas, `_id` creciente.
const mkMatch = ({
    n,
    tournamentId,
    type = "regular",
    group,
    playoffId,
    leg,
    p1,
    t1,
    s1,
    p2,
    t2,
    s2,
    pens = null,
    seeds = null,
    valid,
    legDraw = false,
    playedAtPrecision,
}) => {
    const match = {
        _id: id24(1000 + n),
        type,
        played: true,
        playerP1: p1,
        teamP1: t1,
        scoreP1: s1,
        playerP2: p2,
        teamP2: t2,
        scoreP2: s2,
        tournament: { id: tournamentId, name: "Torneo de prueba" },
        playedAt: new Date(BASE_TIME + n * HOUR),
        outcome:
            legDraw && s1 === s2 && !pens
                ? { draw: true, penalties: false }
                : buildOutcome({ p1, t1, s1, p2, t2, s2, pens, seeds }),
    }

    if (group !== undefined) match.group = group
    if (playoffId !== undefined) match.playoff_id = playoffId
    if (leg !== undefined) match.leg = leg
    if (seeds) {
        match.seedP1 = seeds[0]
        match.seedP2 = seeds[1]
    }
    if (valid === false) match.valid = false
    if (playedAtPrecision) match.playedAtPrecision = playedAtPrecision

    return match
}

const mkTournament = ({
    _id = id24(500),
    name = "Torneo de prueba",
    format = "league",
    playoffMode,
    players = [NICO, LEO, MAX, SANTI],
    teams,
    groups,
    champion,
    finalist,
    ongoing = false,
    closedAt = new Date(BASE_TIME + 400 * HOUR),
    startedAt = new Date(BASE_TIME),
    extra = {},
}) => ({
    _id,
    name,
    format,
    ...(playoffMode && { playoffMode }),
    players,
    teams,
    ...(groups && { groups }),
    outcome: champion ? { champion, finalist } : undefined,
    ongoing,
    startedAt,
    startedAtPrecision: "exact",
    closedAt,
    closedAtPrecision: "exact",
    ...extra,
})

// Timeline del motor de ratings sin el término de equipo (los equipos de los
// fixtures no existen en `data/teamRatings.json`). `overall` opcional por
// equipo para probar `ovr`.
const buildTimeline = (matches, overallByTeamId = null) =>
    buildRatingsTimeline(matches, {
        teamStrength: overallByTeamId
            ? (match) => ({
                  t1: overallByTeamId[match.teamP1?.id] ?? 0,
                  t2: overallByTeamId[match.teamP2?.id] ?? 0,
              })
            : null,
    })

// Evento del motor de ratings escrito a mano, para probar los builders sin
// depender de las cuentas del Elo.
const stubEvent = (
    match,
    {
        expectedP1 = 0.5,
        delta = 5,
        games1 = 20,
        games2 = 20,
        ovr1 = null,
        ovr2 = null,
    } = {}
) => ({
    matchId: String(match._id),
    time: new Date(match.playedAt).getTime(),
    tournament: match.tournament?.name ?? null,
    type: match.type,
    scoreP1: match.scoreP1,
    scoreP2: match.scoreP2,
    expectedP1,
    delta,
    teamAdjustment: 0,
    p1: {
        id: match.playerP1.id,
        name: match.playerP1.name,
        before: 1500,
        games: games1,
        team: match.teamP1.name,
        teamOverall: ovr1,
    },
    p2: {
        id: match.playerP2.id,
        name: match.playerP2.name,
        before: 1500,
        games: games2,
        team: match.teamP2.name,
        teamOverall: ovr2,
    },
})

const stubTimeline = (events = []) => ({
    config: { version: "2.0", provisionalMatches: 10 },
    events,
    eventsByMatchId: new Map(events.map((event) => [event.matchId, event])),
})

// Generador determinístico de un torneo `league_playin_playoff`:
// `groupCount` grupos de `teamsPerGroup` equipos (los equipos se reparten entre
// los 4 jugadores en ronda), `rounds` vueltas, un play-in de `playinMatches`
// partidos y un playoff de 16 equipos (octavos, cuartos, semis y final: 15
// partidos). Con 2 grupos de 10 equipos y 2 vueltas son 180 regulares.
const generateLeaguePlayinPlayoff = ({
    tournamentId = id24(700),
    teamsPerGroup = 10,
    rounds = 2,
    playinMatches = 6,
} = {}) => {
    const players = [NICO, LEO, MAX, SANTI]
    const groupNames = ["A", "B"]
    const teamEntries = []

    groupNames.forEach((group, groupIndex) => {
        for (let i = 0; i < teamsPerGroup; i++) {
            const teamId = groupIndex * teamsPerGroup + i + 1
            const entry = {
                team: team(teamId, `Equipo ${teamId}`),
                player: players[(teamId + groupIndex) % players.length],
                group,
            }

            teamEntries.push(entry)
        }
    })

    let seed = 12345
    const random = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648
        return seed / 2147483648
    }
    const goals = () => Math.floor(random() * random() * 6)
    const matches = []
    let n = 0
    const push = (config) => {
        n += 1
        matches.push(mkMatch({ n, tournamentId, ...config }))
    }

    // Todos contra todos por grupo; en cada vuelta se invierte la localía.
    for (let round = 0; round < rounds; round++) {
        for (const group of groupNames) {
            const entries = teamEntries.filter((item) => item.group === group)

            for (let i = 0; i < entries.length; i++) {
                for (let j = i + 1; j < entries.length; j++) {
                    const [home, away] =
                        round % 2 === 0
                            ? [entries[i], entries[j]]
                            : [entries[j], entries[i]]

                    push({
                        group,
                        p1: home.player,
                        t1: home.team,
                        s1: goals(),
                        p2: away.player,
                        t2: away.team,
                        s2: goals(),
                    })
                }
            }
        }
    }

    const byId = new Map(teamEntries.map((item) => [item.team.id, item]))
    const knockout = (playoffId, type, a, b, seeds, type2 = type) => {
        const home = byId.get(a)
        const away = byId.get(b)
        const s1 = goals()
        const s2 = goals()
        const pens = s1 === s2 ? [4, 3] : null

        push({
            type: type2,
            playoffId,
            p1: home.player,
            t1: home.team,
            s1,
            p2: away.player,
            t2: away.team,
            s2,
            pens,
            seeds,
        })
        const homeWon = s1 === s2 ? true : s1 > s2

        return homeWon ? a : b
    }

    const playinPairs = [
        [teamsPerGroup - 3, teamsPerGroup],
        [teamsPerGroup - 2, teamsPerGroup - 1],
        [2 * teamsPerGroup - 3, 2 * teamsPerGroup],
        [2 * teamsPerGroup - 2, 2 * teamsPerGroup - 1],
        [teamsPerGroup - 3, teamsPerGroup - 2],
        [2 * teamsPerGroup - 3, 2 * teamsPerGroup - 2],
    ].slice(0, playinMatches)

    playinPairs.forEach(([a, b], index) =>
        knockout(index + 1, "playin", a, b, ["7", "10"])
    )

    // 16 equipos al playoff: los primeros ids de cada grupo.
    const qualified = [
        ...Array.from({ length: 8 }, (_, i) => i + 1),
        ...Array.from({ length: 8 }, (_, i) => teamsPerGroup + i + 1),
    ]
    let alive = []

    for (let slot = 0; slot < 8; slot++) {
        alive.push(
            knockout(
                slot + 1,
                "playoff",
                qualified[slot],
                qualified[15 - slot],
                [String(slot + 1), String(16 - slot)]
            )
        )
    }

    let playoffId = 9
    while (alive.length > 1) {
        const next = []

        for (let i = 0; i < alive.length; i += 2) {
            next.push(
                knockout(playoffId, "playoff", alive[i], alive[i + 1], [
                    "1",
                    "2",
                ])
            )
            playoffId += 1
        }
        alive = next
    }

    const championEntry = byId.get(alive[0])
    const finalMatch = matches[matches.length - 1]
    const runnerUpTeamId =
        finalMatch.outcome.teamThatLost?.id ?? finalMatch.teamP2.id
    const runnerUpEntry = byId.get(runnerUpTeamId)
    const tournament = mkTournament({
        _id: tournamentId,
        format: "league_playin_playoff",
        players,
        teams: teamEntries,
        groups: [{ name: "A" }, { name: "B" }],
        champion: { team: championEntry.team, player: championEntry.player },
        finalist: { team: runnerUpEntry.team, player: runnerUpEntry.player },
    })

    return { tournament, matches }
}

module.exports = {
    BASE_TIME,
    HOUR,
    LEO,
    LUCHO,
    MAX,
    NICO,
    SANTI,
    buildOutcome,
    buildTimeline,
    generateLeaguePlayinPlayoff,
    id24,
    mkMatch,
    mkTournament,
    stubEvent,
    stubTimeline,
    team,
}
