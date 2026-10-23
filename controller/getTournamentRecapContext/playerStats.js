const { round } = require("../../service/playerRatings/presentation")

const STAGES = ["regular", "playin", "playoff"]

const CRITERION =
    "V/E/D según el resultado del partido: quien gana por penales suma una victoria y los penales se informan aparte (penaltyShootouts). Puntos: 3 por victoria y 1 por empate. Solo cuentan partidos válidos entre jugadores distintos."

const emptyLine = () => ({
    P: 0,
    W: 0,
    D: 0,
    L: 0,
    gf: 0,
    ga: 0,
    cleanSheets: 0,
})

const effectivenessOf = ({ P, W, D }) =>
    P === 0 ? null : round(((3 * W + D) / (3 * P)) * 100)

const finishLine = (line) => ({
    ...line,
    effectiveness: effectivenessOf(line),
})

// Puntos esperados de un lado antes del partido. Es por partido y sale del
// mismo evento que las odds:
// - "expected_points": 3 * P(victoria) + 1 * P(empate).
// - "advance": el partido no termina empatado (los penales dan ganador), así
//   que la victoria es la probabilidad de avanzar: 3 * P(avanzar).
// Sin odds (partido sin predicción) no aporta puntos esperados.
const expectedPointsOf = (odds, side) => {
    if (!odds) return null

    if (odds.kind === "expected_points") {
        return 3 * (side === "p1" ? odds.p1Win : odds.p2Win) + odds.draw
    }

    return 3 * (side === "p1" ? odds.advanceP1 : odds.advanceP2)
}

const resultFor = (winner, side) => {
    if (winner === "draw") return "D"
    return winner === side ? "W" : "L"
}

// Racha más larga de resultados que cumplen `predicate`, con los `seq` de su
// primer y último partido.
const longestRun = (results, predicate) => {
    let best = { length: 0, fromSeq: null, toSeq: null }
    let current = { length: 0, fromSeq: null, toSeq: null }

    for (const { result, seq } of results) {
        if (predicate(result)) {
            current =
                current.length === 0
                    ? { length: 1, fromSeq: seq, toSeq: seq }
                    : { ...current, length: current.length + 1, toSeq: seq }
            if (current.length > best.length) best = current
        } else {
            current = { length: 0, fromSeq: null, toSeq: null }
        }
    }

    return best
}

const sameId = (a, b) => String(a) === String(b)

// Estadísticas de cada jugador del torneo a partir del log de partidos
// (`entries`, ver `matchLog.js`). Pura.
//
// Solo cuentan los partidos válidos entre jugadores distintos: un partido entre
// dos equipos del mismo jugador no tiene rival humano. Por eso en cada etapa
// V + E + D = PJ.
const buildPlayerStats = ({ entries, players }) => {
    const byPlayer = new Map(
        players.map(({ id, name }) => [
            String(id),
            {
                player: { id, name },
                stages: Object.fromEntries(
                    STAGES.map((stage) => [stage, emptyLine()])
                ),
                results: [],
                teams: new Map(),
                expected: 0,
                expectedMatches: 0,
                actualInRated: 0,
                bestWin: null,
                worstLoss: null,
                penaltyShootouts: { won: 0, lost: 0 },
            },
        ])
    )
    const excluded = { invalid: 0, samePlayer: 0 }

    for (const entry of entries) {
        if (!entry.valid) {
            excluded.invalid += 1
            continue
        }

        if (sameId(entry.p1.playerId, entry.p2.playerId)) {
            excluded.samePlayer += 1
            continue
        }

        for (const [side, other, own, against] of [
            ["p1", "p2", entry.score[0], entry.score[1]],
            ["p2", "p1", entry.score[1], entry.score[0]],
        ]) {
            const stats = byPlayer.get(String(entry[side].playerId))

            if (!stats) continue

            const result = resultFor(entry.winner, side)
            const line = stats.stages[entry.stage]
            const points = result === "W" ? 3 : result === "D" ? 1 : 0

            line.P += 1
            line[result] += 1
            line.gf += own
            line.ga += against
            if (against === 0) line.cleanSheets += 1

            stats.results.push({ result, seq: entry.seq })

            const teamKey = String(entry[side].teamId ?? entry[side].team)
            const teamLine = stats.teams.get(teamKey) ?? {
                team: entry[side].team,
                ...emptyLine(),
            }
            teamLine.P += 1
            teamLine[result] += 1
            stats.teams.set(teamKey, teamLine)

            const expected = expectedPointsOf(entry.odds, side)
            if (expected !== null) {
                stats.expected += expected
                stats.expectedMatches += 1
                stats.actualInRated += points
            }

            if (entry.penalties) {
                if (result === "W") stats.penaltyShootouts.won += 1
                if (result === "L") stats.penaltyShootouts.lost += 1
            }

            // Mejor victoria y peor derrota por diferencia de goles; a igual
            // diferencia, la primera que se jugó.
            const margin = own - against
            const summary = {
                seq: entry.seq,
                matchId: entry.matchId,
                stage: entry.stage,
                opponent: entry[other].player,
                opponentTeam: entry[other].team,
                team: entry[side].team,
                score: [own, against],
                margin: Math.abs(margin),
            }

            if (result === "W" && margin > 0) {
                if (!stats.bestWin || summary.margin > stats.bestWin.margin) {
                    stats.bestWin = summary
                }
            }
            if (result === "L" && margin < 0) {
                if (
                    !stats.worstLoss ||
                    summary.margin > stats.worstLoss.margin
                ) {
                    stats.worstLoss = summary
                }
            }
        }
    }

    return {
        criterion: CRITERION,
        excluded,
        players: [...byPlayer.values()].map((stats) => {
            const overallLine = STAGES.reduce((total, stage) => {
                const line = stats.stages[stage]
                for (const key of Object.keys(total)) total[key] += line[key]
                return total
            }, emptyLine())
            const actualPoints = 3 * overallLine.W + overallLine.D

            return {
                player: stats.player,
                overall: {
                    ...finishLine(overallLine),
                    expectedPoints: round(stats.expected),
                    expectedMatches: stats.expectedMatches,
                    actualPoints,
                    actualPointsInRatedMatches: stats.actualInRated,
                },
                byStage: Object.fromEntries(
                    STAGES.map((stage) => [
                        stage,
                        finishLine(stats.stages[stage]),
                    ])
                ),
                bestWinStreak: longestRun(
                    stats.results,
                    (result) => result === "W"
                ),
                bestUnbeaten: longestRun(
                    stats.results,
                    (result) => result !== "L"
                ),
                worstLosingStreak: longestRun(
                    stats.results,
                    (result) => result === "L"
                ),
                bestWin: stats.bestWin,
                worstLoss: stats.worstLoss,
                ...pickTeams(stats.teams),
                penaltyShootouts: stats.penaltyShootouts,
            }
        }),
    }
}

// Equipo más y menos efectivo del jugador en el torneo, con al menos 2 partidos
// cada uno. El peor solo se informa si es otro equipo que el mejor.
const MIN_TEAM_MATCHES = 2

const pickTeams = (teams) => {
    const ranked = [...teams.values()]
        .filter(({ P }) => P >= MIN_TEAM_MATCHES)
        .map((line) => ({
            team: line.team,
            P: line.P,
            W: line.W,
            D: line.D,
            L: line.L,
            effectiveness: effectivenessOf(line),
        }))
        .sort(
            (a, b) =>
                b.effectiveness - a.effectiveness ||
                b.P - a.P ||
                String(a.team).localeCompare(String(b.team))
        )

    if (ranked.length === 0) return { bestTeam: null, worstTeam: null }

    const best = ranked[0]
    const worst = ranked[ranked.length - 1]

    return {
        bestTeam: best,
        worstTeam: worst.team === best.team ? null : worst,
    }
}

module.exports = { buildPlayerStats, CRITERION }
