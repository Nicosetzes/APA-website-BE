const {
    retrievePlayinMatchesByTournamentId,
    retrievePlayoffMatchesByTournamentId,
    retrieveTournamentById,
    retrieveTournamentIdsPlayedOnDate,
} = require("./../../service")
const {
    PLAYOFF_ROUNDS,
    getPlayoffRoundIdRange,
} = require("../../config/playoffFormats")
const {
    describeTournamentFormat,
} = require("../../config/tournamentFormatRules")
const {
    createGetStandingsTableByTournamentId,
} = require("../getStandingsTableByTournamentId")

const fetchStandings = async (tournamentId) => {
    let body
    const res = {
        status() {
            return this
        },
        send(payload) {
            body = payload
            return this
        },
    }

    await createGetStandingsTableByTournamentId()(
        { params: { tournament: tournamentId }, query: {} },
        res
    )

    return body
}

const slimStandingsRow = (row, index) => {
    const { streak, ...rest } = row
    return { position: index + 1, ...rest }
}

const roundOf = (format, playoffId) =>
    PLAYOFF_ROUNDS.find((round) => {
        const range = getPlayoffRoundIdRange(format, round)
        return range && playoffId >= range[0] && playoffId <= range[1]
    }) ?? null

const slimMatch = (match) => ({
    playoffId: match.playoff_id ?? null,
    leg: match.leg ?? null,
    played: Boolean(match.played),
    playedAt: match.playedAt ?? null,
    playerP1: match.playerP1 ?? null,
    teamP1: match.teamP1 ?? null,
    seedP1: match.seedP1 ?? null,
    scoreP1: match.scoreP1 ?? null,
    playerP2: match.playerP2 ?? null,
    teamP2: match.teamP2 ?? null,
    seedP2: match.seedP2 ?? null,
    scoreP2: match.scoreP2 ?? null,
    outcome: match.played ? match.outcome ?? null : null,
})

const hasKnownTeam = (match) =>
    match.teamP1?.id !== undefined || match.teamP2?.id !== undefined

// Agrupa los partidos de playoff en cruces. Los cruces sin equipos definidos
// (rondas futuras) se omiten: no aportan nada al contexto.
const buildBracket = (format, playoffMatches) => {
    const ties = new Map()

    for (const match of playoffMatches) {
        if (!ties.has(match.playoff_id)) ties.set(match.playoff_id, [])
        ties.get(match.playoff_id).push(match)
    }

    return [...ties.entries()]
        .filter(([, matches]) => matches.some(hasKnownTeam))
        .sort(([a], [b]) => a - b)
        .map(([playoffId, matches]) => ({
            playoffId,
            round: roundOf(format, playoffId),
            series: matches.find((match) => match.series)?.series ?? null,
            matches: matches.map(slimMatch),
        }))
}

const createGetRecapContext = (dependencies = {}) => {
    const retrieveTournamentIds =
        dependencies.retrieveTournamentIdsPlayedOnDate ||
        retrieveTournamentIdsPlayedOnDate
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const retrieveStandings = dependencies.retrieveStandings || fetchStandings
    const retrievePlayin =
        dependencies.retrievePlayinMatchesByTournamentId ||
        retrievePlayinMatchesByTournamentId
    const retrievePlayoff =
        dependencies.retrievePlayoffMatchesByTournamentId ||
        retrievePlayoffMatchesByTournamentId

    const buildTournamentContext = async (tournamentId) => {
        const tournament = await retrieveTournament(tournamentId)

        if (!tournament) return null

        const { format, name, ongoing } = tournament
        const rules = describeTournamentFormat(tournament)
        const hasTable = rules.stages.includes("regular")

        const [standings, playinMatches, playoffMatches] = await Promise.all([
            hasTable ? retrieveStandings(tournamentId) : null,
            rules.stages.includes("playin") ? retrievePlayin(tournamentId) : [],
            rules.stages.includes("playoff")
                ? retrievePlayoff(tournamentId)
                : [],
        ])

        return {
            tournamentId: String(tournamentId),
            tournament: name,
            format,
            ongoing: Boolean(ongoing),
            rules,
            standings: (standings?.standings ?? []).map(({ group, teams }) => ({
                group: group ?? null,
                teams: teams.map(slimStandingsRow),
            })),
            playin: playinMatches.map((match) =>
                slimMatch(
                    typeof match.toObject === "function"
                        ? match.toObject()
                        : match
                )
            ),
            bracket: buildBracket(format, playoffMatches),
        }
    }

    return async (req, res) => {
        const { date } = req.query
        const tournamentIds = await retrieveTournamentIds(date)
        const contexts = await Promise.all(
            tournamentIds.map(buildTournamentContext)
        )

        return res.json({
            success: true,
            date,
            data: contexts.filter(Boolean),
        })
    }
}

const getRecapContext = createGetRecapContext()

module.exports = getRecapContext
module.exports.createGetRecapContext = createGetRecapContext
