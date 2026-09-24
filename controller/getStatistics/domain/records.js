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

const buildStreakRecord = (accumulators, countKey, dateKey) => {
    const max = Math.max(...accumulators.map((entry) => entry[countKey]), 0)

    return max > 0
        ? {
              count: max,
              players: accumulators
                  .filter((entry) => entry[countKey] === max)
                  .map((entry) => ({
                      id: entry.id,
                      name: entry.name,
                      date: entry[dateKey],
                  })),
          }
        : null
}

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
        most_clean_sheets_in_a_row: buildStreakRecord(
            accumulators,
            "_maxCS",
            "_maxCSDate"
        ),
        most_consecutive_matches_scoring_1_plus_goals: buildStreakRecord(
            accumulators,
            "_maxG1",
            "_maxG1Date"
        ),
        most_consecutive_matches_scoring_2_plus_goals: buildStreakRecord(
            accumulators,
            "_maxG2",
            "_maxG2Date"
        ),
        most_consecutive_matches_scoring_3_plus_goals: buildStreakRecord(
            accumulators,
            "_maxG3",
            "_maxG3Date"
        ),
        most_wins_in_a_row: buildStreakRecord(
            accumulators,
            "_maxW",
            "_maxWDate"
        ),
        most_draws_in_a_row: buildStreakRecord(
            accumulators,
            "_maxD",
            "_maxDDate"
        ),
        most_losses_in_a_row: buildStreakRecord(
            accumulators,
            "_maxL",
            "_maxLDate"
        ),
    }
}

module.exports = { selectMatchRecords, buildRecords }
