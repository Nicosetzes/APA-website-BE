// Rachas por torneo: semis (T4), finales (T2) y títulos (T1) consecutivos.
//
// Sólo cuenta el bracket de playoff (`type: "playoff"`); el play-in no es una
// fase del bracket. Ver docs/openapi.yaml (/api/statistics) para las reglas:
// - fase alcanzada: el máximo rango del jugador entre sus partidos del torneo,
//   válidos o no, jugados o no (estar asignado a un slot de una ronda es haber
//   llegado a esa ronda). La ronda sale del rango de `playoff_id` del formato,
//   así que 16/32 equipos, `world_cup_2026`, ida y vuelta con `leg` y la CL
//   legacy (llaves {2k-1, 2k}, mismas rondas) no necesitan casos especiales;
// - participación: `tournament.players` ∪ partidos válidos ∪ slots de playoff
//   asignados. Un torneo en el que el jugador no participó no corta ni
//   extiende; si participó y no llegó (aunque no haya clasificado), corta;
// - campeón: el ganador de la única final jugada (penales vía
//   `playerThatWon`); una final entre dos equipos del mismo jugador lo hace
//   campeón. Fallback a `tournament.outcome` sólo en torneos cerrados;
// - torneos en curso: cuentan sólo si el logro ya está asegurado o el fracaso
//   ya es seguro (cuadro de la fase completo sin el jugador);
// - se saltean para todos los torneos `valid: false` y los que no tienen
//   ningún partido de playoff dentro de rango.

const {
    PLAYOFF_ROUNDS,
    getFinalPlayoffId,
    getPlayoffRoundIdRange,
} = require("../../../config/playoffFormats")
const { getPlayedAt, getPlayedAtPrecision } = require("../../../utils/playedAt")
const { TOURNAMENT_STREAK_TYPES, updateRun } = require("./streaks")

const ROUND_RANK = {
    round_of_32: 2,
    round_of_16: 3,
    quarterfinal: 4,
    semifinal: 5,
    final: 6,
}

const RANK_PHASE = [
    "regular",
    "playin",
    "round_of_32",
    "round_of_16",
    "quarterfinal",
    "semifinal",
    "final",
    "champion",
]

const REGULAR_RANK = 0
const PLAYIN_RANK = 1
const SEMIFINAL_RANK = ROUND_RANK.semifinal
const FINAL_RANK = ROUND_RANK.final
const CHAMPION_RANK = 7

const THRESHOLD = {
    T4: SEMIFINAL_RANK,
    T2: FINAL_RANK,
    T1: CHAMPION_RANK,
}

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

const toId = (value) =>
    value === null || value === undefined || value === "" ? null : String(value)

// Un lado está asignado si tiene jugador: los slots pregenerados del bracket
// llevan `playerP1`/`playerP2` en null hasta que avanza el ganador.
const sideId = (player) => toId(player?.id)

const isPlayed = (match) => match.played !== false

// Rondas del bracket del formato como [ronda, desde, hasta].
const getRoundRanges = (format) =>
    PLAYOFF_ROUNDS.map((round) => [
        round,
        getPlayoffRoundIdRange(format, round),
    ]).filter(([, range]) => range)

const getPlayoffRound = (roundRanges, playoffId) => {
    const id = Number(playoffId)
    if (!Number.isInteger(id)) return null

    const found = roundRanges.find(([, [from, to]]) => id >= from && id <= to)
    return found ? found[0] : null
}

// En la CL legacy cada llave de semis ocupa dos `playoff_id` consecutivos;
// en el resto, un `playoff_id` es un slot (las piernas lo comparten).
const getSemifinalSlot = (format, playoffId) =>
    format === "champions_league" ? Math.ceil(playoffId / 2) : playoffId

const getExpectedSemifinalSlots = (format) => {
    const range = getPlayoffRoundIdRange(format, "semifinal")
    if (!range) return null
    const ids = range[1] - range[0] + 1
    return format === "champions_league" ? ids / 2 : ids
}

const createFact = (tournament) => {
    const ranks = new Map()

    for (const player of tournament.players || []) {
        const id = sideId(player)
        if (id) ranks.set(id, REGULAR_RANK)
    }

    return {
        id: String(tournament._id),
        name: tournament.name ?? null,
        format: tournament.format,
        ongoing: tournament.ongoing === true,
        startedAt: tournament.startedAt ?? null,
        closedAt: tournament.closedAt ?? null,
        closedAtPrecision: tournament.closedAtPrecision ?? null,
        lastPlayedAt: null,
        lastPlayedAtPrecision: null,
        // Primer y último partido de playoff jugado y válido de cada jugador.
        playoffDates: new Map(),
        roundRanges: getRoundRanges(tournament.format),
        finalPlayoffId: getFinalPlayoffId(tournament.format),
        ranks,
        hasPlayoff: false,
        finals: [],
        assignedSemiSlots: new Set(),
        outcomeChampionId: sideId(tournament.outcome?.champion?.player),
        outcomeFinalistId: sideId(tournament.outcome?.finalist?.player),
    }
}

const raiseRank = (fact, playerId, rank) => {
    const current = fact.ranks.get(playerId)
    if (current === undefined || rank > current) {
        fact.ranks.set(playerId, rank)
    }
}

// Sólo los partidos que lista /matches con `type=playoff`: jugados y válidos.
const isListedPlayoff = (match) =>
    match.type === "playoff" && isPlayed(match) && match.valid !== false

// Rondas con fechas propias en el resumen: las que usan los links de las
// rachas a /matches (`playoffRound=semifinal|final`).
const DATED_ROUNDS = ["semifinal", "final"]

const widenRange = (ranges, scope, point) => {
    const range = ranges[scope]
    if (!range) {
        ranges[scope] = { first: point, last: point }
        return
    }
    if (point.time < range.first.time) range.first = point
    if (point.time > range.last.time) range.last = point
}

// Primer y último partido del jugador en el playoff y en cada ronda fechada.
const collectPlayoffDate = (fact, playerId, match, round) => {
    const value = getPlayedAt(match)
    const time = toTime(value)
    if (time === null) return

    const point = { value, precision: getPlayedAtPrecision(match), time }
    if (!fact.playoffDates.has(playerId)) fact.playoffDates.set(playerId, {})
    const ranges = fact.playoffDates.get(playerId)

    widenRange(ranges, "playoff", point)
    if (DATED_ROUNDS.includes(round)) widenRange(ranges, round, point)
}

const getMatchRank = (fact, match) => {
    if (match.type === "playin") return { rank: PLAYIN_RANK, round: null }
    if (match.type !== "playoff") return { rank: REGULAR_RANK, round: null }

    const round = getPlayoffRound(fact.roundRanges, match.playoff_id)
    return {
        rank: round ? ROUND_RANK[round] : REGULAR_RANK,
        round,
    }
}

const collectMatch = (fact, match) => {
    if (isPlayed(match)) {
        const time = toTime(getPlayedAt(match))
        if (time !== null && time > (toTime(fact.lastPlayedAt) ?? -Infinity)) {
            fact.lastPlayedAt = getPlayedAt(match)
            fact.lastPlayedAtPrecision = getPlayedAtPrecision(match)
        }
    }

    const { rank, round } = getMatchRank(fact, match)
    const p1 = sideId(match.playerP1)
    const p2 = sideId(match.playerP2)
    if (p1) raiseRank(fact, p1, rank)
    if (p2) raiseRank(fact, p2, rank)

    if (isListedPlayoff(match)) {
        if (p1) collectPlayoffDate(fact, p1, match, round)
        if (p2 && p2 !== p1) collectPlayoffDate(fact, p2, match, round)
    }

    if (!round) return
    fact.hasPlayoff = true

    if (round === "semifinal" && p1 && p2) {
        fact.assignedSemiSlots.add(
            getSemifinalSlot(fact.format, Number(match.playoff_id))
        )
    }
    if (round === "final") fact.finals.push(match)
}

// Campeón y finalista según la única final jugada, o null si no se puede.
const resolveFinalFromMatch = (finals) => {
    const played = finals.filter(isPlayed)
    if (played.length !== 1) return null

    const [final] = played
    const p1 = sideId(final.playerP1)
    const p2 = sideId(final.playerP2)

    // Final `valid: false` entre dos equipos del mismo jugador (SLE 2022).
    if (p1 && p1 === p2) return { championId: p1, finalistId: null }

    const winnerId = sideId(final.outcome?.playerThatWon)
    if (winnerId) {
        const loserId =
            sideId(final.outcome?.playerThatLost) ??
            (winnerId === p1 ? p2 : winnerId === p2 ? p1 : null)
        return { championId: winnerId, finalistId: loserId }
    }

    const scoreP1 = Number(final.scoreP1)
    const scoreP2 = Number(final.scoreP2)
    if (!Number.isFinite(scoreP1) || !Number.isFinite(scoreP2)) return null
    if (scoreP1 > scoreP2 && p1) return { championId: p1, finalistId: p2 }
    if (scoreP2 > scoreP1 && p2) return { championId: p2, finalistId: p1 }
    return null
}

const finalizeFact = (fact) => {
    const expected = getExpectedSemifinalSlots(fact.format)
    fact.semisComplete =
        expected !== null && fact.assignedSemiSlots.size === expected
    fact.finalAssigned = fact.finals.some(
        (match) => sideId(match.playerP1) && sideId(match.playerP2)
    )

    const fromMatch = resolveFinalFromMatch(fact.finals)
    fact.finalChampionFromMatch = fromMatch?.championId ?? null

    let championId = fromMatch?.championId ?? null
    let finalistId = fromMatch?.finalistId ?? null
    if (!championId && !fact.ongoing) {
        championId = fact.outcomeChampionId
        finalistId = fact.outcomeFinalistId
    }

    if (finalistId && finalistId !== championId) {
        raiseRank(fact, finalistId, FINAL_RANK)
    }
    if (championId) raiseRank(fact, championId, CHAMPION_RANK)
}

// Más nuevo primero, como los partidos. Una fecha nula cuenta como la más
// vieja de su grupo.
const compareTimeDesc = (a, b) => {
    if (a === b) return 0
    if (a === null) return 1
    if (b === null) return -1
    return b - a
}

const compareFactsNewestFirst = (a, b) => {
    if (a.ongoing !== b.ongoing) return a.ongoing ? -1 : 1

    const byEnd = compareTimeDesc(
        toTime(a.ongoing ? a.lastPlayedAt : a.closedAt),
        toTime(b.ongoing ? b.lastPlayedAt : b.closedAt)
    )
    if (byEnd !== 0) return byEnd

    const byStart = compareTimeDesc(toTime(a.startedAt), toTime(b.startedAt))
    if (byStart !== 0) return byStart

    if (a.id === b.id) return 0
    return a.id < b.id ? 1 : -1
}

// Hechos por torneo para las rachas, del más nuevo al más viejo.
// `matches` son los partidos jugados y válidos; `extraPlayoffMatches`, los de
// playoff sin jugar o `valid: false`. O(partidos + torneos).
const buildTournamentFacts = ({
    matches,
    extraPlayoffMatches = [],
    tournaments,
}) => {
    const facts = new Map()

    for (const tournament of tournaments || []) {
        if (!tournament || tournament.valid === false) continue
        const fact = createFact(tournament)
        facts.set(fact.id, fact)
    }

    for (const list of [matches || [], extraPlayoffMatches || []]) {
        for (const match of list) {
            const tournamentId = toId(match?.tournament?.id)
            const fact = tournamentId ? facts.get(tournamentId) : null
            if (fact) collectMatch(fact, match)
        }
    }

    const counted = []
    for (const fact of facts.values()) {
        if (!fact.hasPlayoff) continue
        finalizeFact(fact)
        counted.push(fact)
    }

    return counted.sort(compareFactsNewestFirst)
}

// `firstPlayoffPlayedAt`, `lastSemifinalPlayedAtPrecision`, etc.
const rangeFields = (range, name) => ({
    [`first${name}PlayedAt`]: range?.first.value ?? null,
    [`first${name}PlayedAtPrecision`]: range?.first.precision ?? null,
    [`last${name}PlayedAt`]: range?.last.value ?? null,
    [`last${name}PlayedAtPrecision`]: range?.last.precision ?? null,
})

// Resumen público del torneo en la perspectiva de un jugador. Las fechas de
// playoff (y de semis y final) del jugador son null si no jugó ningún partido
// válido ahí (p. ej. sólo está asignado a un slot sin jugar).
const toSummary = (fact, rank, playerId) => {
    const ranges = fact.playoffDates.get(playerId) ?? {}
    return {
        id: fact.id,
        name: fact.name,
        phaseReached: RANK_PHASE[rank],
        ongoing: fact.ongoing,
        closedAt: fact.closedAt,
        closedAtPrecision: fact.closedAtPrecision,
        lastPlayedAt: fact.lastPlayedAt,
        lastPlayedAtPrecision: fact.lastPlayedAtPrecision,
        ...rangeFields(ranges.playoff, "Playoff"),
        ...rangeFields(ranges.semifinal, "Semifinal"),
        ...rangeFields(ranges.final, "Final"),
    }
}

// Si el torneo cuenta para el jugador y el tipo, y si extiende la racha.
const decide = (fact, type, playerId, rank) => {
    if (!fact.ongoing) {
        return { counts: true, continues: rank >= THRESHOLD[type] }
    }

    let achieved
    let certainFail
    if (type === "T1") {
        achieved = fact.finalChampionFromMatch === playerId
        certainFail =
            fact.finalChampionFromMatch !== null &&
            fact.finalChampionFromMatch !== playerId
    } else if (type === "T2") {
        achieved = rank >= FINAL_RANK
        certainFail = fact.finalAssigned && rank < FINAL_RANK
    } else {
        achieved = rank >= SEMIFINAL_RANK
        certainFail = fact.semisComplete && rank < SEMIFINAL_RANK
    }

    if (achieved) return { counts: true, continues: true }
    if (certainFail) return { counts: true, continues: false }
    return { counts: false, continues: false }
}

// Alimenta T4/T2/T1 de cada acumulador con los torneos, del más nuevo al más
// viejo. Sólo cuentan los jugadores que ya tienen acumulador.
const applyTournamentStreaks = ({ accumulators, facts }) => {
    const byId = new Map(accumulators.map((entry) => [entry.id, entry]))

    for (const fact of facts) {
        for (const [playerId, rank] of fact.ranks) {
            const accumulator = byId.get(playerId)
            if (!accumulator) continue

            const summary = toSummary(fact, rank, playerId)
            for (const type of TOURNAMENT_STREAK_TYPES) {
                const { counts, continues } = decide(fact, type, playerId, rank)
                if (!counts) continue

                accumulator[`_seen${type}`] += 1
                updateRun(accumulator, type, continues, summary, {
                    isMostRecent: accumulator[`_seen${type}`] === 1,
                    previous: accumulator[`_prev${type}`],
                })
                accumulator[`_prev${type}`] = summary
            }
        }
    }

    return accumulators
}

module.exports = {
    RANK_PHASE,
    ROUND_RANK,
    THRESHOLD,
    applyTournamentStreaks,
    buildTournamentFacts,
}
