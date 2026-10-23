const {
    PLAYOFF_ROUNDS,
    getPlayoffRoundForId,
} = require("../../config/playoffFormats")
const { decoratePlayoffSeriesMatches } = require("../../service/playoffSeries")

const sameId = (a, b) =>
    a !== null && a !== undefined && b !== null && b !== undefined
        ? String(a) === String(b)
        : false

const refOf = (reference) =>
    reference?.id === undefined || reference?.id === null
        ? null
        : { id: reference.id, name: reference.name ?? null }

const toPlain = (match) =>
    typeof match?.toObject === "function" ? match.toObject() : match

const unitOf = (match, suffix) => ({
    player: refOf(match[`player${suffix}`]),
    team: refOf(match[`team${suffix}`]),
    seed: match[`seed${suffix}`] ?? null,
})

const hasBothTeams = (match) =>
    match.teamP1?.id !== undefined && match.teamP2?.id !== undefined

const legOf = (match) => match.leg ?? 1

// Decora con `series` (formato `playoff` con `playoffMode`). Si la estructura
// de la serie es inconsistente se sigue sin decorar: el cruce se resuelve igual
// con el marcador y el `outcome`.
const decorate = (tournament, playoffMatches) => {
    try {
        return decoratePlayoffSeriesMatches(tournament, playoffMatches)
    } catch {
        return playoffMatches.map(toPlain)
    }
}

// Orientaciones de las odds de un partido al lado del equipo indicado.
const orientOdds = (odds, onP1) => {
    if (!odds) return null

    if (odds.kind === "expected_points") {
        return {
            kind: odds.kind,
            win: onP1 ? odds.p1Win : odds.p2Win,
            draw: odds.draw,
            loss: onP1 ? odds.p2Win : odds.p1Win,
        }
    }

    return { kind: odds.kind, advance: onP1 ? odds.advanceP1 : odds.advanceP2 }
}

// Cruces agrupados por llave. Cada cruce tiene dos "unidades" (jugador, equipo,
// seed) tomadas del primer partido, porque en la vuelta los lados se invierten.
//
// - Formatos con `leg` (playoff de partido único o de ida y vuelta): la llave es
//   el `playoff_id`.
// - `champions_league`: ida y vuelta son `playoff_id` distintos de la misma
//   ronda, así que la llave es la ronda más el par de equipos.
const groupTies = ({ tournament, playoffMatches, entriesByMatchId }) => {
    const groups = new Map()
    const byChampionsPair = tournament.format === "champions_league"

    for (const match of playoffMatches) {
        if (!hasBothTeams(match)) continue

        const roundName = getPlayoffRoundForId(
            tournament.format,
            match.playoff_id
        )
        const key = byChampionsPair
            ? `${roundName}|${[match.teamP1.id, match.teamP2.id]
                  .map(String)
                  .sort()
                  .join("|")}`
            : String(match.playoff_id)

        if (!groups.has(key)) groups.set(key, { roundName, matches: [] })
        groups.get(key).matches.push(match)
    }

    return [...groups.values()].map(({ roundName, matches }) =>
        buildTie({ tournament, roundName, matches, entriesByMatchId })
    )
}

const buildTie = ({ tournament, roundName, matches, entriesByMatchId }) => {
    const ordered = [...matches].sort((a, b) => legOf(a) - legOf(b))
    const first = ordered[0]
    const units = [unitOf(first, "P1"), unitOf(first, "P2")]
    const tiebreak = ordered.find((match) => match.leg === 3) ?? null
    const regularLegs = ordered.filter((match) => match.leg !== 3)
    const twoLegged = regularLegs.length >= 2
    const decisive = tiebreak ?? matches[matches.length - 1]
    const goals = units.map(({ team }) =>
        regularLegs.reduce((total, match) => {
            if (sameId(match.teamP1?.id, team.id)) return total + match.scoreP1
            if (sameId(match.teamP2?.id, team.id)) return total + match.scoreP2
            return total
        }, 0)
    )
    const aggregate = twoLegged ? goals : null
    const outcomeTeamId = decisive.outcome?.teamThatWon?.id
    const indexOfTeam = (teamId) => {
        const index = units.findIndex(({ team }) => sameId(team.id, teamId))
        return index === -1 ? null : index
    }
    const seriesWinner = indexOfTeam(
        matches.find((match) => match.series)?.series?.winnerTeamId
    )
    const sameHuman = sameId(units[0].player?.id, units[1].player?.id)

    let winnerIndex = null
    let decidedBy = "single_match"

    if (tiebreak) {
        winnerIndex = indexOfTeam(tiebreak.outcome?.teamThatWon?.id)
        decidedBy = "golden_goal"
    } else if (twoLegged && goals[0] !== goals[1]) {
        winnerIndex = goals[0] > goals[1] ? 0 : 1
        decidedBy = "aggregate"
    } else if (decisive.outcome?.penalties === true) {
        winnerIndex = indexOfTeam(outcomeTeamId)
        decidedBy = "penalties"
    } else {
        winnerIndex = indexOfTeam(outcomeTeamId)
        decidedBy = twoLegged ? "aggregate" : "single_match"
    }

    if (seriesWinner !== null) winnerIndex = seriesWinner

    if (sameHuman) decidedBy = "same_player_pick"
    else if (decisive.valid === false) decidedBy = "walkover"

    const tieEntries = matches
        .map((match) => entriesByMatchId.get(String(match._id)))
        .filter(Boolean)

    return {
        round: roundName,
        playoffId: first.playoff_id ?? null,
        units,
        winnerIndex,
        decidedBy,
        aggregate,
        entries: tieEntries,
        decisiveEntry: entriesByMatchId.get(String(decisive._id)) ?? null,
        matchSeqs: tieEntries.map(({ seq }) => seq),
    }
}

const roundOrder = (roundName) => {
    const index = PLAYOFF_ROUNDS.indexOf(roundName)
    return index === -1 ? PLAYOFF_ROUNDS.length : index
}

// En el cuadro público los participantes van por nombre: el contexto es largo y
// los ids no aportan (los partidos se referencian por `seq`).
const publicUnit = (unit) => ({
    player: unit.player?.name ?? null,
    team: unit.team?.name ?? null,
    seed: unit.seed,
})

const toPublicTie = (tie) => ({
    playoffId: tie.playoffId,
    teams: tie.units.map(publicUnit),
    winner:
        tie.winnerIndex === null
            ? null
            : {
                  player: tie.units[tie.winnerIndex].player?.name ?? null,
                  team: tie.units[tie.winnerIndex].team?.name ?? null,
              },
    decidedBy: tie.decidedBy,
    aggregate: tie.aggregate,
    matchSeqs: tie.matchSeqs,
})

const orientToTeam = (tie, teamId) => {
    const index = tie.units.findIndex(({ team }) => sameId(team.id, teamId))

    if (index === -1) return null

    const decisive = tie.decisiveEntry
    const onP1 = decisive ? sameId(decisive.p1.teamId, teamId) : null
    const score = decisive
        ? onP1
            ? decisive.score
            : [...decisive.score].reverse()
        : null

    return {
        round: tie.round,
        opponent: {
            player: tie.units[1 - index].player?.name ?? null,
            team: tie.units[1 - index].team?.name ?? null,
        },
        decidedBy: tie.decidedBy,
        aggregate: tie.aggregate
            ? index === 0
                ? tie.aggregate
                : [...tie.aggregate].reverse()
            : null,
        score,
        odds: decisive ? orientOdds(decisive.odds, onP1) : null,
        wonTie: tie.winnerIndex === index,
        matchSeqs: tie.matchSeqs,
    }
}

const buildFinal = (tie) => {
    const decisive = tie?.decisiveEntry

    if (!decisive) return null

    return {
        matchSeq: decisive.seq,
        matchId: decisive.matchId,
        round: "final",
        score: decisive.score,
        penalties: decisive.penalties,
        playedAt: decisive.playedAt,
        odds: decisive.odds,
        winner: decisive.winner,
        upset: decisive.upset,
        decidedBy: tie.decidedBy,
        aggregate: tie.aggregate,
    }
}

// Armado del cuadro a partir de los partidos del torneo ya unidos con el motor
// de ratings (`entries`, ver `matchLog.js`). Pura.
//
// - `playin`: referencias (`seq`) a los partidos del play-in.
// - `playoffs`: rondas -> cruces, con ganador y cómo se definió. Los números de
//   cada partido viven solo en `matches`; acá van referencias por `seq`.
// - `result.final`: el partido que decidió la final (`null` si no hay cuadro).
// - `championPath`: lo que atravesó el campeón.
const buildBracket = ({
    tournament,
    rules,
    matches,
    entries,
    standings,
    champion,
}) => {
    const entriesByMatchId = new Map(entries.map((e) => [e.matchId, e]))
    const playoffMatches = decorate(
        tournament,
        matches.filter((match) => match.type === "playoff")
    )
    const hasPlayoff = rules.stages.includes("playoff")
    const hasPlayin = rules.stages.includes("playin")
    const ties = hasPlayoff
        ? groupTies({ tournament, playoffMatches, entriesByMatchId }).sort(
              (a, b) =>
                  roundOrder(a.round) - roundOrder(b.round) ||
                  (a.playoffId ?? 0) - (b.playoffId ?? 0)
          )
        : []
    const playinEntries = entries.filter(({ stage }) => stage === "playin")
    const rounds = []

    for (const tie of ties) {
        const last = rounds[rounds.length - 1]

        if (last && last.round === tie.round) last.ties.push(toPublicTie(tie))
        else rounds.push({ round: tie.round, ties: [toPublicTie(tie)] })
    }

    const finalTie = ties.find((tie) => tie.round === "final") ?? null
    const championTeamId = champion?.team?.id
    const regularRow = (standings?.final ?? [])
        .flatMap(({ group, teams }) => teams.map((row) => ({ group, row })))
        .find(({ row }) => sameId(row.teamId, championTeamId))
    const championPlayin = playinEntries.filter(
        ({ p1, p2 }) =>
            sameId(p1.teamId, championTeamId) ||
            sameId(p2.teamId, championTeamId)
    )

    return {
        playin: hasPlayin
            ? { matchSeqs: playinEntries.map(({ seq }) => seq) }
            : null,
        playoffs: hasPlayoff && rounds.length > 0 ? { rounds } : null,
        final: buildFinal(finalTie),
        finalDecided: Boolean(finalTie && finalTie.winnerIndex !== null),
        championPath: {
            regular: regularRow
                ? {
                      group: regularRow.group,
                      position: regularRow.row.position,
                      points: regularRow.row.points,
                  }
                : null,
            playin: hasPlayin
                ? {
                      played: championPlayin.length > 0,
                      matchSeqs: championPlayin.map(({ seq }) => seq),
                  }
                : null,
            ties: ties
                .map((tie) => orientToTeam(tie, championTeamId))
                .filter(Boolean),
        },
        // Para los hechos (facts): los cruces con sus partidos.
        ties,
    }
}

module.exports = { buildBracket, orientOdds }
