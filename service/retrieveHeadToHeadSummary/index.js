const { findAllMatches, findAllUsers } = require("./../../dao")

const idOf = (player) =>
    player?.id === undefined || player?.id === null ? null : String(player.id)

const isScore = (value) =>
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isInteger(Number(value)) &&
    Number(value) >= 0

const pairKey = (left, right) =>
    left < right ? `${left}|${right}` : `${right}|${left}`

const teamOf = (team) =>
    team?.id === undefined || team?.id === null
        ? null
        : { id: team.id, name: team.name || String(team.id) }

const toTime = (value) => {
    const time = value ? new Date(value).getTime() : Number.NaN
    return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

const isBetterWin = (candidate, current) => {
    if (!current) return true
    if (candidate.margin !== current.margin)
        return candidate.margin > current.margin
    if (candidate.winnerGoals !== current.winnerGoals)
        return candidate.winnerGoals > current.winnerGoals
    return candidate.playedAtTime < current.playedAtTime
}

const publicBestWin = (candidate) =>
    candidate
        ? {
              score: `${candidate.winnerGoals}-${candidate.loserGoals}`,
              winnerTeam: candidate.winnerTeam,
              loserTeam: candidate.loserTeam,
          }
        : null

const buildHeadToHeadSummary = ({ users = [], matches = [] }) => {
    const players = users
        .map((user) => ({
            id: idOf(user),
            name: user.nickname || user.name || idOf(user),
        }))
        .filter(({ id }) => id !== null)
        .sort((a, b) => a.name.localeCompare(b.name, "es"))

    const playersById = new Map(players.map((player) => [player.id, player]))
    const pairsByKey = new Map()

    for (let index = 0; index < players.length; index += 1) {
        for (let other = index + 1; other < players.length; other += 1) {
            const playerA = players[index]
            const playerB = players[other]
            pairsByKey.set(pairKey(playerA.id, playerB.id), {
                playerA,
                playerB,
                matches: 0,
                playerAWins: 0,
                draws: 0,
                playerBWins: 0,
                playerAGoals: 0,
                playerBGoals: 0,
                bestWin: { playerA: null, playerB: null },
            })
        }
    }

    for (const match of matches) {
        const p1Id = idOf(match.playerP1)
        const p2Id = idOf(match.playerP2)
        if (
            !p1Id ||
            !p2Id ||
            p1Id === p2Id ||
            !playersById.has(p1Id) ||
            !playersById.has(p2Id) ||
            !isScore(match.scoreP1) ||
            !isScore(match.scoreP2)
        ) {
            continue
        }

        const pair = pairsByKey.get(pairKey(p1Id, p2Id))
        if (!pair) continue

        const p1IsA = pair.playerA.id === p1Id
        const goalsA = Number(p1IsA ? match.scoreP1 : match.scoreP2)
        const goalsB = Number(p1IsA ? match.scoreP2 : match.scoreP1)
        const teamA = teamOf(p1IsA ? match.teamP1 : match.teamP2)
        const teamB = teamOf(p1IsA ? match.teamP2 : match.teamP1)

        pair.matches += 1
        pair.playerAGoals += goalsA
        pair.playerBGoals += goalsB
        if (goalsA > goalsB) pair.playerAWins += 1
        else if (goalsB > goalsA) pair.playerBWins += 1
        else pair.draws += 1

        if (goalsA !== goalsB) {
            const winnerKey = goalsA > goalsB ? "playerA" : "playerB"
            const candidate = {
                margin: Math.abs(goalsA - goalsB),
                winnerGoals: Math.max(goalsA, goalsB),
                loserGoals: Math.min(goalsA, goalsB),
                winnerTeam: goalsA > goalsB ? teamA : teamB,
                loserTeam: goalsA > goalsB ? teamB : teamA,
                playedAtTime: toTime(match.playedAt),
            }
            if (isBetterWin(candidate, pair.bestWin[winnerKey]))
                pair.bestWin[winnerKey] = candidate
        }
    }

    const pairs = Array.from(pairsByKey.values())
        .map((pair) => ({
            ...pair,
            playerAGoalDifference: pair.playerAGoals - pair.playerBGoals,
            playerBGoalDifference: pair.playerBGoals - pair.playerAGoals,
            bestWin: {
                playerA: publicBestWin(pair.bestWin.playerA),
                playerB: publicBestWin(pair.bestWin.playerB),
            },
        }))
        .sort((a, b) => {
            if (a.matches !== b.matches) return b.matches - a.matches
            const byA = a.playerA.name.localeCompare(b.playerA.name, "es")
            if (byA !== 0) return byA
            return a.playerB.name.localeCompare(b.playerB.name, "es")
        })

    return { players, pairs }
}

const retrieveHeadToHeadSummary = async (dependencies = {}) => {
    const retrieveUsers = dependencies.retrieveAllUsers || findAllUsers
    const retrieveMatches = dependencies.retrieveAllMatches || findAllMatches
    const [users, matches] = await Promise.all([
        retrieveUsers(),
        retrieveMatches(),
    ])
    return buildHeadToHeadSummary({ users, matches })
}

module.exports = retrieveHeadToHeadSummary
module.exports.buildHeadToHeadSummary = buildHeadToHeadSummary
