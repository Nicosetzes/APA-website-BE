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
    date: match.updatedAt || null,
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

const toShootoutScore = (value) => {
    if (value === null || value === undefined || value === "") return null
    const score = Number(value)
    return Number.isFinite(score) ? score : null
}

// Definición por penales en la perspectiva de `playerId`. Partidos viejos
// pueden no traer el resultado de la tanda: ahí los goles quedan en null.
const formatPenalties = (outcome, playerId) => {
    if (!outcome?.penalties) return null

    const won = String(outcome.playerThatWon?.id || "") === playerId
    const winnerScore = toShootoutScore(outcome.scoreFromTeamThatWon)
    const loserScore = toShootoutScore(outcome.scoreFromTeamThatLost)
    const hasScores = winnerScore !== null && loserScore !== null

    return {
        won,
        goalsFor: hasScores ? (won ? winnerScore : loserScore) : null,
        goalsAgainst: hasScores ? (won ? loserScore : winnerScore) : null,
    }
}

// Resumen de un partido de racha en la perspectiva de `playerId`.
const formatStreakMatch = (match, playerId) => {
    if (!match) return null

    const isP1 = String(match.playerP1?.id || "") === playerId
    const scoreP1 = Number(match.scoreP1) || 0
    const scoreP2 = Number(match.scoreP2) || 0
    const goalsFor = isP1 ? scoreP1 : scoreP2
    const goalsAgainst = isP1 ? scoreP2 : scoreP1

    let result = "D"
    if (goalsFor > goalsAgainst) result = "W"
    else if (goalsFor < goalsAgainst) result = "L"

    return {
        date: match.updatedAt || null,
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

const formatStreakHolder = (entry, prefix, isActive) => {
    const startMatch = entry[`${prefix}Start`]
    const endMatch = entry[`${prefix}End`]
    const endDate = endMatch?.updatedAt || null

    return {
        id: entry.id,
        name: entry.name,
        date: endDate,
        isActive,
        startDate: startMatch?.updatedAt || null,
        endDate,
        startMatch: formatStreakMatch(startMatch, entry.id),
        endMatch: formatStreakMatch(endMatch, entry.id),
        // Partido que cortó la racha; una vigente todavía no tiene corte.
        breakMatch: isActive
            ? null
            : formatStreakMatch(entry[`${prefix}Break`], entry.id),
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

const buildStreakEntry = (accumulators, prefix, isActive, minCount = 1) => {
    const max = Math.max(...accumulators.map((entry) => entry[prefix]), 0)

    return max >= minCount
        ? {
              count: max,
              players: accumulators
                  .filter((entry) => entry[prefix] === max)
                  .map((entry) =>
                      formatStreakHolder(entry, prefix, isActive(entry))
                  )
                  .sort(compareHolders),
          }
        : null
}

const buildStreakRecord = (accumulators, type) =>
    buildStreakEntry(
        accumulators,
        `_max${type}`,
        (entry) => entry[`_max${type}Active`]
    )

// Un solo partido no es racha: las vigentes arrancan en 2. `records` mantiene
// las de 1 por compatibilidad con bundles viejos del FE (que filtra < 2).
const MIN_ACTIVE_STREAK = 2

const buildActiveStreak = (accumulators, type) =>
    buildStreakEntry(
        accumulators,
        `_active${type}`,
        () => true,
        MIN_ACTIVE_STREAK
    )

const STREAK_RECORD_KEYS = [
    ["most_clean_sheets_in_a_row", "CS"],
    ["most_consecutive_matches_scoring_1_plus_goals", "G1"],
    ["most_consecutive_matches_scoring_2_plus_goals", "G2"],
    ["most_consecutive_matches_scoring_3_plus_goals", "G3"],
    ["most_wins_in_a_row", "W"],
    ["most_draws_in_a_row", "D"],
    ["most_losses_in_a_row", "L"],
    ["most_unbeaten_in_a_row", "U"],
]

const buildActiveStreaks = ({ accumulators }) =>
    Object.fromEntries(
        STREAK_RECORD_KEYS.map(([key, type]) => [
            key,
            buildActiveStreak(accumulators, type),
        ])
    )

const buildRecords = ({ matchRecords, accumulators }) => {
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
        ...Object.fromEntries(
            STREAK_RECORD_KEYS.map(([key, type]) => [
                key,
                buildStreakRecord(accumulators, type),
            ])
        ),
    }
}

module.exports = {
    selectMatchRecords,
    buildRecords,
    buildActiveStreaks,
    formatStreakMatch,
}
