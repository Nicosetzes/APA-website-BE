const {
    STANDINGS_PROGRESS_MARKS,
    LEAGUE_PROGRESS_MIN_MATCHES,
    TITLE_RACE_LAST_MATCHES,
} = require("../../config/tournamentRecap")

const CRITERION =
    "Tabla oficial de la fase regular: cuenta TODOS los partidos regulares jugados, también los valid:false (por ejemplo entre dos equipos del mismo jugador, que la tabla necesita para cerrar). Por eso played, wins, draws, losses, gf y ga pueden no coincidir con playerStats, que solo cuenta partidos válidos entre jugadores distintos. Para estadísticas de jugadores usar playerStats."

const teamKey = (team) => team?.id

// Acumula un partido en las filas de la tabla con las mismas reglas que
// `createGetStandingsTableByTournamentId`: los puntos salen del `outcome`
// (no del marcador) y un partido sin `outcome` suma partido jugado y goles pero
// ningún punto. Cuenta también los partidos `valid: false`.
const applyMatch = (stats, match) => {
    const { teamP1, teamP2, scoreP1, scoreP2, outcome } = match
    const t1 = stats.get(teamKey(teamP1))
    const t2 = stats.get(teamKey(teamP2))

    // Equipo que no figura en el grupo (dato inconsistente): se ignora.
    if (!t1 || !t2) return

    t1.played += 1
    t2.played += 1
    t1.goalsFor += scoreP1 || 0
    t1.goalsAgainst += scoreP2 || 0
    t2.goalsFor += scoreP2 || 0
    t2.goalsAgainst += scoreP1 || 0

    if (outcome?.draw) {
        t1.draws += 1
        t2.draws += 1
        t1.points += 1
        t2.points += 1
    } else if (outcome?.teamThatWon?.id === teamP1.id) {
        t1.wins += 1
        t2.losses += 1
        t1.points += 3
    } else if (outcome?.teamThatWon?.id === teamP2.id) {
        t2.wins += 1
        t1.losses += 1
        t2.points += 3
    } else if (outcome?.teamThatLost?.id === teamP1.id) {
        t1.losses += 1
        t2.wins += 1
        t2.points += 3
    } else if (outcome?.teamThatLost?.id === teamP2.id) {
        t2.losses += 1
        t1.wins += 1
        t1.points += 3
    }
}

// Mismo desempate que la tabla del torneo: puntos, diferencia de gol, goles a
// favor y menos goles en contra. Con todo igual conserva el orden de entrada
// (el sort de JS es estable), igual que el controller.
const compareRows = (a, b) =>
    b.points - a.points ||
    b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
    b.goalsFor - a.goalsFor ||
    a.goalsAgainst - b.goalsAgainst

const createStats = (teamsInGroup) =>
    new Map(
        teamsInGroup.map(({ team, player }) => [
            teamKey(team),
            {
                team,
                player,
                played: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                points: 0,
            },
        ])
    )

const rank = (stats) => [...stats.values()].sort(compareRows)

// Tabla de un grupo luego de aplicar `matches` (en el orden dado).
const computeStandings = (teamsInGroup, matches) => {
    const stats = createStats(teamsInGroup)

    for (const match of matches) applyMatch(stats, match)

    return rank(stats)
}

// `matchesPlayed` y `matchesLeft` cuentan los partidos regulares del grupo (los
// mismos que la tabla, `valid: false` incluidos): jugados hasta ese momento y
// los que faltaban para cerrar el grupo.
const toLeader = (group, row, { matchesPlayed, total }) => ({
    group,
    team: row.team.name,
    player: row.player?.name ?? null,
    points: row.points,
    matchesPlayed,
    matchesLeft: total - matchesPlayed,
})

// Cantidad de partidos del grupo que cuentan al `pct` % del total (hacia arriba).
const matchesAtPct = (total, pct) => Math.ceil((total * pct) / 100)

// La evolución de la tabla (`progress`, `leaderChanges` y `closeRace`) solo
// se informa para grupos con muchos partidos: una liga de tabla única o un grupo
// de `league_playin_playoff`. Los grupos chicos (mundial, champions, supercopa)
// no la traen.
const hasProgress = (total) => total >= LEAGUE_PROGRESS_MIN_MATCHES

// Calificación de cada equipo según las reglas del formato:
// - `league_playin_playoff`: 1° al 6° directo, 7° al 10° play-in, resto afuera.
// - fase de grupos con cuadro: los `perGroup` primeros directo; el resto, si
//   llegó a jugar el playoff, es "best_third"; si no, eliminado.
// - liga: sin clasificación.
const qualificationFor = ({ format, rules, position, playedPlayoff }) => {
    if (format === "league_playin_playoff") {
        const direct = rules.qualification?.directPerGroup ?? 6
        const playin = rules.qualification?.playinPerGroup ?? 4

        if (position <= direct) return "direct"
        if (position <= direct + playin) return "playin"
        return "eliminated"
    }

    if (!rules.stages.includes("playoff") || rules.stages.length < 2) {
        return null
    }

    const perGroup = rules.qualification?.perGroup ?? 2

    if (position <= perGroup) return "direct"
    return playedPlayoff ? "best_third" : "eliminated"
}

const toFinalRow = (row, index, context) => ({
    position: index + 1,
    team: row.team.name,
    teamId: row.team.id,
    player: row.player?.name ?? null,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    gf: row.goalsFor,
    ga: row.goalsAgainst,
    gd: row.goalsFor - row.goalsAgainst,
    points: row.points,
    qualification: qualificationFor({
        format: context.format,
        rules: context.rules,
        position: index + 1,
        playedPlayoff: context.playoffTeamIds.has(String(row.team.id)),
    }),
})

// Tabla final por grupo y su evolución, en una sola pasada sobre los partidos
// regulares ya jugados. Pura. Devuelve `{ standings, topTwoByGroup }`;
// `standings` es `null` si el formato no tiene fase regular.
//
// - `matches`: partidos regulares jugados del torneo, cronológicos (incluye los
//   `valid: false`, como la tabla).
// - `final`: igual que el controller de la tabla (probado por paridad).
// - `progress`: líder de cada grupo al 25 / 50 / 75 / 100 % de los partidos del
//   grupo, con los partidos jugados y los que faltaban en ese momento.
// - `leaderChanges`: veces que cambió el líder luego del primer 25 % de los
//   partidos de cada grupo (antes, el liderato cambia por simple arranque).
// - `closeRace`: líder y ventaja sobre el segundo cuando faltaban
//   `TITLE_RACE_LAST_MATCHES` (10) partidos para cerrar cada grupo.
//
// Las tres últimas solo incluyen a los grupos con al menos
// `LEAGUE_PROGRESS_MIN_MATCHES` (30) partidos regulares (`hasProgress`). Si
// ningún grupo llega, `progress` es `[]`, `leaderChanges` es `{}` y
// `closeRace` es `[]`; `final` siempre trae todos los grupos.
const buildStandingsProgress = ({
    tournament,
    matches,
    rules,
    playoffTeamIds = new Set(),
}) => {
    if (!rules.stages.includes("regular")) {
        return { standings: null, topTwoByGroup: new Map() }
    }

    const teams = tournament.teams ?? []
    const hasGroups = (tournament.groups?.length ?? 0) > 0
    const groupNames = hasGroups
        ? [...new Set(teams.map((item) => item.group))].sort()
        : [null]
    const context = { format: tournament.format, rules, playoffTeamIds }
    const finalTables = []
    const progressByMark = new Map(
        STANDINGS_PROGRESS_MARKS.map((pct) => [pct, []])
    )
    const leaderChanges = {}
    const closeRace = []
    const topTwoByGroup = new Map()

    for (const group of groupNames) {
        const teamsInGroup = hasGroups
            ? teams.filter((item) => item.group == group)
            : teams
        const groupMatches = hasGroups
            ? matches.filter((match) => match.group === group)
            : matches
        const total = groupMatches.length
        const label = group ?? "all"
        const finalRows = computeStandings(teamsInGroup, groupMatches)

        finalTables.push({
            group,
            teams: finalRows.map((row, index) =>
                toFinalRow(row, index, context)
            ),
        })
        topTwoByGroup.set(
            group,
            new Set(finalRows.slice(0, 2).map(({ team }) => String(team.id)))
        )

        if (!hasProgress(total)) continue

        for (const pct of STANDINGS_PROGRESS_MARKS) {
            const matchesPlayed = matchesAtPct(total, pct)
            const rows = computeStandings(
                teamsInGroup,
                groupMatches.slice(0, matchesPlayed)
            )

            progressByMark
                .get(pct)
                .push(toLeader(group, rows[0], { matchesPlayed, total }))
        }

        // Recorrido partido a partido para contar cambios de líder y mirar el
        // cierre. Los grupos tienen a lo sumo unas decenas de equipos.
        const stats = createStats(teamsInGroup)
        const countFrom = matchesAtPct(total, STANDINGS_PROGRESS_MARKS[0])
        const lastStretchAt = total - TITLE_RACE_LAST_MATCHES
        let previousLeader = null
        let changes = 0

        groupMatches.forEach((match, index) => {
            applyMatch(stats, match)

            const rows = rank(stats)
            const leaderId = String(rows[0].team.id)

            if (index + 1 >= countFrom) {
                if (previousLeader !== null && previousLeader !== leaderId) {
                    changes += 1
                }
                previousLeader = leaderId
            }

            if (index + 1 === lastStretchAt && rows.length > 1) {
                closeRace.push({
                    group,
                    leader: rows[0].team.name,
                    leaderTeamId: rows[0].team.id,
                    gapToSecond: rows[0].points - rows[1].points,
                    matchesPlayed: lastStretchAt,
                    matchesLeft: TITLE_RACE_LAST_MATCHES,
                })
            }
        })

        leaderChanges[label] = changes
    }

    return {
        standings: {
            criterion: CRITERION,
            final: finalTables,
            progress: STANDINGS_PROGRESS_MARKS.map((pct) => ({
                afterPct: pct,
                leaders: progressByMark.get(pct),
            })).filter(({ leaders }) => leaders.length > 0),
            leaderChanges,
            closeRace,
        },
        topTwoByGroup,
    }
}

module.exports = {
    CRITERION,
    buildStandingsProgress,
    computeStandings,
    hasProgress,
}
