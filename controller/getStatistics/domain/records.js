const { getKnockoutResult } = require("./streaks")

const selectMatchRecords = (matchesNewestFirst) => {
    let highestDiffMatch = null
    let mostGoalsMatch = null

    for (const match of matchesNewestFirst) {
        const scoreP1 = Number(match.scoreP1) || 0
        const scoreP2 = Number(match.scoreP2) || 0
        const diff = Math.abs(scoreP1 - scoreP2)
        const total = scoreP1 + scoreP2

        if (!highestDiffMatch || diff >= highestDiffMatch.diff) {
            highestDiffMatch = { diff, match }
        }
        if (!mostGoalsMatch || total >= mostGoalsMatch.total) {
            mostGoalsMatch = { total, match }
        }
    }

    return { highestDiffMatch, mostGoalsMatch }
}

const formatMatch = (match) => ({
    player1: match.playerP1?.name || match.playerP1?.nickname,
    team1: match.teamP1?.name || null,
    player2: match.playerP2?.name || match.playerP2?.nickname,
    team2: match.teamP2?.name || null,
    score: `${match.scoreP1}-${match.scoreP2}`,
    tournament: match.tournament?.name || null,
    date: match?.playedAt ?? null,
    datePrecision: match?.playedAtPrecision ?? null,
})

const toReference = (entity) =>
    entity ? { id: entity.id ?? null, name: entity.name ?? null } : null

const toPlayerReference = (player) =>
    player
        ? {
              id: player.id ? String(player.id) : null,
              name: player.name || player.nickname || null,
          }
        : null

const formatPenalties = (outcome, playerId) => {
    if (!outcome?.penalties) return null

    const won = String(outcome.playerThatWon?.id || "") === playerId
    const winnerScore = outcome.scoreFromTeamThatWon
    const loserScore = outcome.scoreFromTeamThatLost

    return {
        won,
        goalsFor: won ? winnerScore : loserScore,
        goalsAgainst: won ? loserScore : winnerScore,
    }
}

// Resumen de un partido de racha en la perspectiva de `playerId`.
// `resolveResult(byGoals, match, playerId)` reemplaza el resultado por goles
// (las rachas mata-mata lo usan para los penales).
const formatStreakMatch = (match, playerId, resolveResult) => {
    if (!match) return null

    const isP1 = String(match.playerP1?.id || "") === playerId
    const scoreP1 = Number(match.scoreP1) || 0
    const scoreP2 = Number(match.scoreP2) || 0
    const goalsFor = isP1 ? scoreP1 : scoreP2
    const goalsAgainst = isP1 ? scoreP2 : scoreP1

    let result = "D"
    if (goalsFor > goalsAgainst) result = "W"
    else if (goalsFor < goalsAgainst) result = "L"
    if (resolveResult) result = resolveResult(result, match, playerId)

    return {
        date: match?.playedAt ?? null,
        datePrecision: match?.playedAtPrecision ?? null,
        tournament: toReference(match.tournament),
        type: match.type || null,
        team: toReference(isP1 ? match.teamP1 : match.teamP2),
        opponent: toPlayerReference(isP1 ? match.playerP2 : match.playerP1),
        opponentTeam: toReference(isP1 ? match.teamP2 : match.teamP1),
        goalsFor,
        goalsAgainst,
        result,
        penalties: formatPenalties(match.outcome, playerId),
    }
}

const formatStreakHolder = (entry, prefix, isActive, resolveResult) => {
    const startMatch = entry[`${prefix}Start`]
    const endMatch = entry[`${prefix}End`]
    const endDate = endMatch?.playedAt ?? null
    const endDatePrecision = endMatch?.playedAtPrecision ?? null

    return {
        id: entry.id,
        name: entry.name,
        date: endDate,
        datePrecision: endDatePrecision,
        isActive,
        startDate: startMatch?.playedAt ?? null,
        startDatePrecision: startMatch?.playedAtPrecision ?? null,
        endDate,
        endDatePrecision,
        startMatch: formatStreakMatch(startMatch, entry.id, resolveResult),
        endMatch: formatStreakMatch(endMatch, entry.id, resolveResult),
        // Partido que cortó la racha; una vigente todavía no tiene corte.
        breakMatch: isActive
            ? null
            : formatStreakMatch(
                  entry[`${prefix}Break`],
                  entry.id,
                  resolveResult
              ),
    }
}

const formatKnockoutHolder = (entry, prefix, isActive) =>
    formatStreakHolder(entry, prefix, isActive, getKnockoutResult)

// Fecha visible de un torneo: el cierre, o el último partido si sigue en curso.
const summaryDate = (summary) =>
    (summary?.ongoing ? summary.lastPlayedAt : summary?.closedAt) ?? null

const summaryPrecision = (summary) =>
    (summary?.ongoing
        ? summary.lastPlayedAtPrecision
        : summary?.closedAtPrecision) ?? null

const formatTournamentSummary = (summary) => (summary ? { ...summary } : null)

const formatTournamentHolder = (entry, prefix, isActive) => {
    const start = entry[`${prefix}Start`]
    const end = entry[`${prefix}End`]
    const endDate = summaryDate(end)
    const endDatePrecision = summaryPrecision(end)

    return {
        id: entry.id,
        name: entry.name,
        date: endDate,
        datePrecision: endDatePrecision,
        isActive,
        startDate: summaryDate(start),
        startDatePrecision: summaryPrecision(start),
        endDate,
        endDatePrecision,
        startTournament: formatTournamentSummary(start),
        endTournament: formatTournamentSummary(end),
        // Torneo que cortó la racha; una vigente todavía no tiene corte.
        breakTournament: isActive
            ? null
            : formatTournamentSummary(entry[`${prefix}Break`]),
    }
}

const toTime = (date) => (date ? new Date(date).getTime() : null)

// Vigentes primero; después la que empezó antes. Sin fecha de inicio, al final.
const compareHolders = (a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1

    const startA = toTime(a.startDate)
    const startB = toTime(b.startDate)
    if (startA === startB) return 0
    if (startA === null) return 1
    if (startB === null) return -1
    return startA - startB
}

const buildStreakEntry = (
    accumulators,
    prefix,
    isActive,
    minCount = 1,
    formatHolder = formatStreakHolder
) => {
    const max = Math.max(...accumulators.map((entry) => entry[prefix]), 0)

    return max >= minCount
        ? {
              count: max,
              players: accumulators
                  .filter((entry) => entry[prefix] === max)
                  .map((entry) => formatHolder(entry, prefix, isActive(entry)))
                  .sort(compareHolders),
          }
        : null
}

const buildStreakRecord = (accumulators, type, formatHolder) =>
    buildStreakEntry(
        accumulators,
        `_max${type}`,
        (entry) => entry[`_max${type}Active`],
        1,
        formatHolder
    )

// Un solo partido no es racha: las vigentes arrancan en 2. `records` mantiene
// las de 1 por compatibilidad con bundles viejos del FE (que filtra < 2).
const MIN_ACTIVE_STREAK = 2

const buildActiveStreak = (accumulators, type, formatHolder) =>
    buildStreakEntry(
        accumulators,
        `_active${type}`,
        () => true,
        MIN_ACTIVE_STREAK,
        formatHolder
    )

const KNOCKOUT_STREAK_RECORD_KEYS = [
    ["most_knockout_wins_in_a_row", "KW"],
    ["most_knockout_unbeaten_in_a_row", "KU"],
]

const TOURNAMENT_STREAK_RECORD_KEYS = [
    ["most_consecutive_semifinals", "T4"],
    ["most_consecutive_finals", "T2"],
    ["most_consecutive_titles", "T1"],
]

// Claves de un grupo según el modo: `compute` las calcula, `null` las deja en
// null (scope por torneo) y `omit` no las incluye (sin datos de torneos).
const buildStreakGroup = (keys, mode, build) => {
    if (mode === "omit") return []
    return keys.map(([key, type]) => [
        key,
        mode === "null" ? null : build(type),
    ])
}

// Las 9 rachas de partidos, después las de mata-mata y las de torneos.
const buildStreakEntries = (
    build,
    { knockout = "compute", tournament = "compute" } = {}
) =>
    Object.fromEntries([
        ...STREAK_RECORD_KEYS.map(
            ([key, type, formatHolder = formatStreakHolder]) => [
                key,
                build(type, formatHolder),
            ]
        ),
        ...buildStreakGroup(KNOCKOUT_STREAK_RECORD_KEYS, knockout, (type) =>
            build(type, formatKnockoutHolder)
        ),
        ...buildStreakGroup(TOURNAMENT_STREAK_RECORD_KEYS, tournament, (type) =>
            build(type, formatTournamentHolder)
        ),
    ])

const STREAK_RECORD_KEYS = [
    ["most_clean_sheets_in_a_row", "CS"],
    ["most_consecutive_matches_scoring_1_plus_goals", "G1"],
    ["most_consecutive_matches_scoring_2_plus_goals", "G2"],
    ["most_consecutive_matches_scoring_3_plus_goals", "G3"],
    ["most_wins_in_a_row", "W"],
    ["most_draws_in_a_row", "D"],
    ["most_losses_in_a_row", "L"],
    ["most_unbeaten_in_a_row", "U"],
    // El resultado de cada partido es el de la tanda (W/L).
    ["most_penalty_shootout_wins_in_a_row", "PS", formatKnockoutHolder],
]

const buildActiveStreaks = ({ accumulators, knockout, tournament }) =>
    buildStreakEntries(
        (type, formatHolder) =>
            buildActiveStreak(accumulators, type, formatHolder),
        { knockout, tournament }
    )

const buildRecords = ({ matchRecords, accumulators, knockout, tournament }) => {
    const { highestDiffMatch, mostGoalsMatch } = matchRecords

    return {
        highest_scoring_difference_match: highestDiffMatch
            ? {
                  diff: highestDiffMatch.diff,
                  match: formatMatch(highestDiffMatch.match),
              }
            : null,
        highest_total_goals_match: mostGoalsMatch
            ? {
                  total: mostGoalsMatch.total,
                  match: formatMatch(mostGoalsMatch.match),
              }
            : null,
        ...buildStreakEntries(
            (type, formatHolder) =>
                buildStreakRecord(accumulators, type, formatHolder),
            { knockout, tournament }
        ),
    }
}

module.exports = {
    KNOCKOUT_STREAK_RECORD_KEYS,
    TOURNAMENT_STREAK_RECORD_KEYS,
    selectMatchRecords,
    buildRecords,
    buildActiveStreaks,
    formatStreakMatch,
    formatTournamentHolder,
}
