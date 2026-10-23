const {
    resolveInsightKind,
    resolveWinner,
} = require("../getRecapContext/matchInsights")
const { getPlayoffRoundForId } = require("../../config/playoffFormats")
const {
    BASE_IMPORTANCE,
    BIG_WIN_MARGIN,
    COMPACT_REGULAR_MATCH_LIMIT,
    UPSET_WINNER_EXPECTED_MAX,
} = require("../../config/tournamentRecap")
const { outcomeProbabilities } = require("../../service/playerRatings/outcomes")
const { round, toIso } = require("../../service/playerRatings/presentation")

const MAX_IMPORTANCE = 5

const idOf = (reference) =>
    reference?.id === undefined || reference?.id === null
        ? null
        : String(reference.id)

const toPlainMatch = (match) =>
    typeof match?.toObject === "function" ? match.toObject() : match

// Probabilidades previas al partido a partir del evento del motor. Por partido,
// nunca por serie:
// - "expected_points" (liga, patas 1 y 2, playoffs de la Champions): victoria /
//   empate / derrota con el modelo de empate.
// - "advance" (cruce de partido único): `expectedP1` es la probabilidad de
//   AVANZAR, no de ganar en los 90 minutos.
// Sin evento (partido `valid: false`) o sin predicción con sentido: `null`.
const buildOdds = (kind, event) => {
    if (!event || !kind) return null

    if (kind === "expected_points") {
        const probabilities = outcomeProbabilities(event.expectedP1)

        return probabilities ? { kind, ...probabilities } : null
    }

    const advanceP1 = round(event.expectedP1, 3)

    return { kind, advanceP1, advanceP2: round(1 - advanceP1, 3) }
}

// Penales del partido (goles iguales y ganador por `outcome`). En el `outcome`,
// `scoreFromTeamThatWon/Lost` son los penales cuando `penalties` es true.
const buildPenalties = (match, winner) => {
    const outcome = match.outcome

    if (outcome?.penalties !== true || (winner !== "p1" && winner !== "p2")) {
        return null
    }

    const won = outcome.scoreFromTeamThatWon ?? null
    const lost = outcome.scoreFromTeamThatLost ?? null

    return { winner, score: winner === "p1" ? [won, lost] : [lost, won] }
}

const buildSide = (match, event, suffix, provisionalMatches) => {
    const player = match[`player${suffix}`]
    const team = match[`team${suffix}`]
    const side = event?.[suffix.toLowerCase()]

    return {
        player: player?.name ?? side?.name ?? null,
        playerId: idOf(player) ?? side?.id ?? null,
        team: team?.name ?? side?.team ?? null,
        teamId: team?.id ?? null,
        ovr: side?.teamOverall ?? null,
        ratingBefore: side ? round(side.before) : null,
        provisional: side ? side.games < provisionalMatches : null,
    }
}

const baseImportance = (stage, roundName) => {
    if (stage === "regular") return BASE_IMPORTANCE.regular
    if (stage === "playin") return BASE_IMPORTANCE.playin

    return BASE_IMPORTANCE[roundName] ?? BASE_IMPORTANCE.quarterfinal
}

// Ganador esperado del puntaje antes del partido (probabilidad de avanzar si
// `kind` es "advance"; si no, el empate vale 0,5), o `null` sin evento.
const winnerExpectedScore = (winner, event) => {
    if (!event || winner === "draw") return null

    return winner === "p1" ? event.expectedP1 : 1 - event.expectedP1
}

// Un registro por partido jugado del torneo, en el orden recibido (el servicio
// ya los trae cronológicos), unido con el evento del motor de ratings. Incluye
// los `valid: false` (sin evento: `odds` y `ratingDelta` quedan en `null`).
//
// `topTwoByGroup`: Map(grupo -> Set de ids de equipo) con los dos primeros de
// cada grupo al final; suma importancia a los partidos regulares entre ellos.
const buildMatchEntries = ({
    matches,
    timeline,
    tournament,
    topTwoByGroup = new Map(),
}) => {
    const provisionalMatches = timeline.config.provisionalMatches

    const entries = matches.map((rawMatch, index) => {
        const match = toPlainMatch(rawMatch)
        const matchId = String(match._id)
        const event = timeline.eventsByMatchId.get(matchId) ?? null
        const stage = match.type
        const playoffId = match.playoff_id ?? null
        const roundName =
            stage === "playoff"
                ? getPlayoffRoundForId(tournament.format, playoffId)
                : null
        const winner = resolveWinner(match)
        const kind = resolveInsightKind({ match, tournament })
        const odds = buildOdds(kind, event)
        const penalties = buildPenalties(match, winner)
        const margin = Math.abs(match.scoreP1 - match.scoreP2)
        const expectedWinner = odds ? winnerExpectedScore(winner, event) : null
        const upset =
            odds === null
                ? null
                : expectedWinner !== null &&
                  expectedWinner < UPSET_WINNER_EXPECTED_MAX
        const groupTopTwo = topTwoByGroup.get(match.group ?? null)
        const betweenTopTwo =
            stage === "regular" &&
            Boolean(groupTopTwo) &&
            groupTopTwo.has(String(match.teamP1?.id)) &&
            groupTopTwo.has(String(match.teamP2?.id))
        const importance = Math.min(
            MAX_IMPORTANCE,
            baseImportance(stage, roundName) +
                (upset ? 1 : 0) +
                (penalties || margin >= BIG_WIN_MARGIN ? 1 : 0) +
                (betweenTopTwo ? 1 : 0)
        )

        return {
            seq: index + 1,
            matchId,
            playedAt: match.playedAt ? toIso(new Date(match.playedAt)) : null,
            playedAtPrecision: match.playedAtPrecision ?? null,
            stage,
            group: match.group ?? null,
            round: roundName,
            playoffId,
            leg: match.leg ?? null,
            p1: buildSide(match, event, "P1", provisionalMatches),
            p2: buildSide(match, event, "P2", provisionalMatches),
            score: [match.scoreP1, match.scoreP2],
            penalties,
            valid: match.valid !== false,
            winner,
            odds,
            ratingDelta: event
                ? { p1: round(event.delta), p2: round(-event.delta) + 0 }
                : null,
            upset,
            importance,
            notable: stage !== "regular",
            // Solo para los builders (no se serializa): el puntaje esperado del
            // ganador sin redondear y si el partido tuvo evento de rating.
            expectedWinner,
            rated: event !== null,
        }
    })

    // Regulares destacados: importancia >= 2, los mejores por importancia y,
    // a igual importancia, los primeros jugados. Un `valid: false` nunca se
    // destaca (no cuenta como partido para las estadísticas).
    const regularCandidates = entries
        .filter(
            ({ stage, importance, valid }) =>
                stage === "regular" && valid && importance >= 2
        )
        .sort((a, b) => b.importance - a.importance || a.seq - b.seq)
        .slice(0, COMPACT_REGULAR_MATCH_LIMIT)

    for (const entry of regularCandidates) entry.notable = true

    return entries
}

const INTERNAL_FIELDS = ["expectedWinner", "rated", "playedAtPrecision"]

// Quita lo que no forma parte del contrato (ids de jugador y campos internos).
const serializeEntry = (entry) => {
    const output = { ...entry }

    for (const field of INTERNAL_FIELDS) delete output[field]
    for (const side of ["p1", "p2"]) {
        const { playerId, ...rest } = entry[side]
        output[side] = rest
    }

    return output
}

// `compact`: todo el play-in y el playoff más los regulares destacados; `full`:
// todos. En orden cronológico en ambos casos.
const selectMatches = (entries, detail) => {
    const selected =
        detail === "full" ? entries : entries.filter(({ notable }) => notable)

    return {
        matches: selected.map(serializeEntry),
        matchesOmitted: entries.length - selected.length,
    }
}

module.exports = {
    buildMatchEntries,
    buildOdds,
    selectMatches,
    serializeEntry,
}
