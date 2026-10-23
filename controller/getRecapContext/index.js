const { buildMatchInsights } = require("./matchInsights")
const {
    createGetStandingsTableByTournamentId,
} = require("../getStandingsTableByTournamentId")
const {
    describeTournamentFormat,
} = require("../../config/tournamentFormatRules")
const { getArgentinaDayRange } = require("../../utils/argentinaDay")
const { getPlayoffRoundForId } = require("../../config/playoffFormats")
const {
    retrieveMatchesPlayedOnDate,
    retrievePlayinMatchesByTournamentId,
    retrievePlayoffMatchesByTournamentId,
    retrieveRatingsTimeline,
    retrieveTournamentById,
    retrieveTournamentIdsPlayedOnDate,
} = require("./../../service")

const fetchStandings = async (tournamentId, playedBefore) => {
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
        { params: { tournament: tournamentId }, query: {}, playedBefore },
        res
    )

    return body
}

const indexPreviousPositions = (previous) =>
    new Map(
        (previous?.standings ?? []).map(({ group, teams }) => {
            const anyoneHadPlayed = teams.some(({ played }) => played > 0)
            const positions = new Map(
                teams.map(({ team }, index) => [team?.id, index + 1])
            )

            return [group ?? null, anyoneHadPlayed ? positions : null]
        })
    )

const slimStandingsRow = (row, index, previousPositions) => {
    const { streak, ...rest } = row
    return {
        position: index + 1,
        previousPosition: previousPositions?.get(row.team?.id) ?? null,
        ...rest,
    }
}

const slimMatch = (match) => ({
    playoffId: match.playoff_id ?? null,
    leg: match.leg ?? null,
    played: Boolean(match.played),
    valid: match.valid !== false,
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
            round: getPlayoffRoundForId(format, playoffId),
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
    const retrieveTimeline =
        dependencies.retrieveRatingsTimeline || retrieveRatingsTimeline
    const retrieveDayMatches =
        dependencies.retrieveMatchesPlayedOnDate || retrieveMatchesPlayedOnDate

    const loadInsightSources = async (date, dayRange) => {
        const start = dayRange.start.getTime()
        const end = dayRange.end.getTime()
        const { events } = await retrieveTimeline()
        const dayEvents = events.filter(
            (event) =>
                event.time !== null && event.time >= start && event.time < end
        )
        const matchesByTournament = new Map()

        if (dayEvents.length > 0) {
            for (const match of await retrieveDayMatches(date)) {
                const key = String(match.tournament?.id)
                if (!matchesByTournament.has(key)) {
                    matchesByTournament.set(key, [])
                }
                matchesByTournament.get(key).push(match)
            }
        }

        return { events: dayEvents, matchesByTournament }
    }

    const buildTournamentContext = async (
        tournamentId,
        date,
        dayRange,
        sources
    ) => {
        const tournament = await retrieveTournament(tournamentId)

        if (!tournament) return null

        const { format, name, ongoing } = tournament
        const rules = describeTournamentFormat(tournament)
        const hasTable = rules.stages.includes("regular")

        const [standings, previousStandings, playinMatches, playoffMatches] =
            await Promise.all([
                hasTable ? retrieveStandings(tournamentId, dayRange.end) : null,
                hasTable
                    ? retrieveStandings(tournamentId, dayRange.start)
                    : null,
                rules.stages.includes("playin")
                    ? retrievePlayin(tournamentId)
                    : [],
                rules.stages.includes("playoff")
                    ? retrievePlayoff(tournamentId)
                    : [],
            ])
        const previousPositions = indexPreviousPositions(previousStandings)

        return {
            tournamentId: String(tournamentId),
            tournament: name,
            format,
            ongoing: Boolean(ongoing),
            // La tabla ignora lo jugado después de `date`; el play-in y el
            // cuadro siempre muestran el estado actual.
            asOf: { standings: date, playin: "current", bracket: "current" },
            rules,
            standings: (standings?.standings ?? []).map(({ group, teams }) => ({
                group: group ?? null,
                teams: teams.map((row, index) =>
                    slimStandingsRow(
                        row,
                        index,
                        previousPositions.get(group ?? null)
                    )
                ),
            })),
            playin: playinMatches.map((match) =>
                slimMatch(
                    typeof match.toObject === "function"
                        ? match.toObject()
                        : match
                )
            ),
            bracket: buildBracket(format, playoffMatches),
            matchInsights: buildMatchInsights({
                events: sources.events,
                matches:
                    sources.matchesByTournament.get(String(tournamentId)) ?? [],
                tournament,
            }),
        }
    }

    return async (req, res) => {
        const { date } = req.query
        const dayRange = getArgentinaDayRange(date)
        const tournamentIds = await retrieveTournamentIds(date)
        const sources =
            tournamentIds.length > 0
                ? await loadInsightSources(date, dayRange)
                : null
        const contexts = await Promise.all(
            tournamentIds.map((tournamentId) =>
                buildTournamentContext(tournamentId, date, dayRange, sources)
            )
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
