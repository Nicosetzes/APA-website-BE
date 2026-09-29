const { escapeRegExp } = require("es-toolkit")
const matchesModel = require("./../models/matches.js")
const tournamentsModel = require("./../models/tournaments.js")
const { getPlayoffRoundIdRange } = require("../../config/playoffFormats")

const MONGO_COMPARISON_OPS = { gte: "$gte", lte: "$lte", eq: "$eq" }

const MATCH_NOTHING = { _id: { $exists: false } }

const isActiveFilter = (value) => Boolean(value) && value !== "all"

const hasNumericValue = (value) =>
    value !== undefined && value !== null && value !== ""

const toMongoOp = (op) => MONGO_COMPARISON_OPS[op] || "$gte"

const toComparison = (op, value) => ({ [toMongoOp(op)]: Number(value) })

const HAS_NUMERIC_SCORES = {
    scoreP1: { $type: "number" },
    scoreP2: { $type: "number" },
}

const scoreExpressionCondition = (expression, op, value) => ({
    ...HAS_NUMERIC_SCORES,
    $expr: { [toMongoOp(op)]: [expression, Number(value)] },
})

const GOAL_DIFFERENCE_EXPRESSION = {
    $abs: { $subtract: ["$scoreP1", "$scoreP2"] },
}

const TOTAL_GOALS_EXPRESSION = { $add: ["$scoreP1", "$scoreP2"] }

const nameContains = (text) => ({
    $regex: escapeRegExp(text),
    $options: "i",
})

const SIDES = [
    { player: "playerP1.id", own: "P1", opponent: "P2" },
    { player: "playerP2.id", own: "P2", opponent: "P1" },
]

const bySideOf = (playerId, buildSideCondition) => ({
    $or: SIDES.map((side) => ({
        [side.player]: playerId,
        ...buildSideCondition(side),
    })),
})

const playerGoalsCondition = (playerId, op, value) =>
    bySideOf(playerId, ({ own }) => ({
        [`score${own}`]: toComparison(op, value),
    }))

const playerConcededCondition = (playerId, op, value) =>
    bySideOf(playerId, ({ opponent }) => ({
        [`score${opponent}`]: toComparison(op, value),
    }))

const playerTeamCondition = (playerId, teamText) =>
    bySideOf(playerId, ({ own }) => ({
        [`team${own}.name`]: nameContains(teamText),
    }))

const opponentTeamCondition = (playerId, teamText) =>
    bySideOf(playerId, ({ opponent }) => ({
        [`team${opponent}.name`]: nameContains(teamText),
    }))

const idsInRange = ([from, to]) => {
    const ids = []
    for (let id = from; id <= to; id++) ids.push(id)
    return ids
}

// La ronda depende de la geometría del bracket, que sale del formato del
// torneo. Se agrupan los torneos por rango de `playoff_id` y se arma una rama
// por grupo. Las referencias a torneos inexistentes quedan afuera porque no
// hay formato del cual derivar la ronda.
const playoffRoundCondition = async (round) => {
    const tournaments = await tournamentsModel.find({}, { format: 1 }).lean()
    const branchesByRange = new Map()

    tournaments.forEach((tournament) => {
        const range = getPlayoffRoundIdRange(tournament.format, round)
        if (!range) return

        const key = range.join("-")
        if (!branchesByRange.has(key)) {
            branchesByRange.set(key, { range, tournamentIds: [] })
        }
        branchesByRange.get(key).tournamentIds.push(String(tournament._id))
    })

    if (branchesByRange.size === 0) return MATCH_NOTHING

    return {
        type: "playoff",
        $or: [...branchesByRange.values()].map(({ range, tournamentIds }) => {
            const ids = idsInRange(range)
            return {
                "tournament.id": { $in: tournamentIds },
                // Tolera playoff_id legacy guardados como texto.
                playoff_id: { $in: [...ids, ...ids.map(String)] },
            }
        }),
    }
}

const findMatches = async (filters) => {
    const limit = 20
    const {
        page = 1,
        teamName,
        player1,
        player2,
        tournamentId,
        type,
        playoffRound,
        outcome,
        goalDiffOp = "gte",
        goalDiffVal,
        totalGoalsOp = "gte",
        totalGoalsVal,
        player1GoalsOp = "gte",
        player1GoalsVal,
        player1ConcededOp = "gte",
        player1ConcededVal,
        player1Team,
        opponentTeam,
        dateFrom,
        dateTo,
        played,
    } = filters

    const hasPlayer1 = isActiveFilter(player1)
    const hasPlayer2 = hasPlayer1 && isActiveFilter(player2)

    const queryConditions = [{ valid: { $ne: false } }]

    if (typeof played !== "undefined") {
        queryConditions.push({
            played: String(played).toLowerCase() === "true",
        })
    } else {
        queryConditions.push({ played: { $ne: false } })
    }

    if (teamName) {
        queryConditions.push({
            $or: [
                { "teamP1.name": nameContains(teamName) },
                { "teamP2.name": nameContains(teamName) },
            ],
        })
    }

    if (tournamentId && tournamentId !== "all") {
        queryConditions.push({ "tournament.id": tournamentId })
    }

    if (type && type !== "all") {
        if (type === "knockout")
            queryConditions.push({
                $or: [{ type: "playin" }, { type: "playoff" }],
            })
        else queryConditions.push({ type: type })
    }

    if (type === "playoff" && isActiveFilter(playoffRound)) {
        queryConditions.push(await playoffRoundCondition(playoffRound))
    }

    if (hasPlayer1) {
        if (hasPlayer2) {
            queryConditions.push({
                $or: [
                    { "playerP1.id": player1, "playerP2.id": player2 },
                    { "playerP1.id": player2, "playerP2.id": player1 },
                ],
            })
        } else {
            queryConditions.push({
                $or: [{ "playerP1.id": player1 }, { "playerP2.id": player1 }],
            })
        }
    }

    if (hasPlayer1 && outcome && outcome !== "all") {
        if (outcome === "draw") {
            queryConditions.push({ "outcome.draw": true })
        } else if (outcome === "penalties") {
            queryConditions.push({ "outcome.penalties": true })
        } else if (outcome === "win") {
            queryConditions.push({
                "outcome.draw": false,
                "outcome.playerThatWon.id": player1,
            })
        } else if (outcome === "loss") {
            queryConditions.push({
                "outcome.draw": false,
                "outcome.playerThatLost.id": player1,
            })
        }
    }

    if (hasNumericValue(goalDiffVal)) {
        queryConditions.push(
            scoreExpressionCondition(
                GOAL_DIFFERENCE_EXPRESSION,
                goalDiffOp,
                goalDiffVal
            )
        )
    }

    if (hasNumericValue(totalGoalsVal)) {
        queryConditions.push(
            scoreExpressionCondition(
                TOTAL_GOALS_EXPRESSION,
                totalGoalsOp,
                totalGoalsVal
            )
        )
    }

    if (hasPlayer1 && hasNumericValue(player1GoalsVal)) {
        queryConditions.push(
            playerGoalsCondition(player1, player1GoalsOp, player1GoalsVal)
        )
    }

    if (hasPlayer1 && hasNumericValue(player1ConcededVal)) {
        queryConditions.push(
            playerConcededCondition(
                player1,
                player1ConcededOp,
                player1ConcededVal
            )
        )
    }

    if (hasPlayer1 && player1Team) {
        queryConditions.push(playerTeamCondition(player1, player1Team))
    }

    if (hasPlayer1 && opponentTeam) {
        queryConditions.push(opponentTeamCondition(player1, opponentTeam))
    }

    if (dateFrom || dateTo) {
        const dateFilter = {}
        const offset = 3 * 60 * 60 * 1000 // Offset de 3 hs

        if (dateFrom) {
            const [y, m, d] = dateFrom.split("-").map(Number)
            dateFilter.$gte = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + offset)
        }
        if (dateTo) {
            const [y, m, d] = dateTo.split("-").map(Number)
            dateFilter.$lt = new Date(
                Date.UTC(y, m - 1, d + 1, 0, 0, 0) + offset
            )
        }

        queryConditions.push({ updatedAt: dateFilter })
    }

    const finalFilter = { $and: queryConditions }
    const currentPage = Math.max(1, Number(page) || 1)

    const [matches, amountOfTotalMatches] = await Promise.all([
        matchesModel
            .find(finalFilter)
            .limit(limit)
            .skip((currentPage - 1) * limit)
            .sort({ updatedAt: -1, _id: -1 }),
        matchesModel.countDocuments(finalFilter),
    ])

    return {
        matches,
        totalMatches: amountOfTotalMatches,
        totalPages: Math.ceil(amountOfTotalMatches / limit),
        currentPage,
    }
}

module.exports = findMatches
