const crypto = require("node:crypto")

const { DRAW_MODEL } = require("../../config/drawModel")
const {
    CONTEXT_VERSION,
    getCompetition,
} = require("../../config/tournamentRecap")
const {
    describeTournamentFormat,
} = require("../../config/tournamentFormatRules")
const { HttpError } = require("../../middleware/httpErrors")
const { buildNameIndex } = require("../../service/playerRatings/presentation")
const {
    retrieveAllUsers,
    retrieveRatingMatches,
    retrieveRatingsTimeline,
    retrieveTournamentById,
    retrieveTournamentMatchesForRecap,
    retrieveTournamentsForStatistics,
} = require("./../../service")
const { buildBracket } = require("./bracket")
const { buildDataQuality } = require("./dataQuality")
const { buildFacts } = require("./facts")
const { buildHeadToHead } = require("./headToHead")
const { buildMatchEntries, selectMatches } = require("./matchLog")
const { buildPlayerStats } = require("./playerStats")
const { buildRatingMovement } = require("./ratingMovement")
const { buildStandingsProgress } = require("./standingsProgress")
const { buildTitleContext } = require("./titles")

const DAY_MS = 24 * 60 * 60 * 1000

const toPlain = (value) =>
    typeof value?.toObject === "function" ? value.toObject() : value

const toIso = (value) => (value ? new Date(value).toISOString() : null)

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

const isPlayedValid = (match) => match.played !== false && match.valid !== false

const createGetTournamentRecapContext = (dependencies = {}) => {
    const retrieveTournament =
        dependencies.retrieveTournamentById || retrieveTournamentById
    const retrieveMatches =
        dependencies.retrieveTournamentMatchesForRecap ||
        retrieveTournamentMatchesForRecap
    const retrieveTimeline =
        dependencies.retrieveRatingsTimeline || retrieveRatingsTimeline
    const retrieveRatingHistory =
        dependencies.retrieveRatingMatches || retrieveRatingMatches
    const retrieveTournaments =
        dependencies.retrieveTournamentsForStatistics ||
        retrieveTournamentsForStatistics
    const retrieveUsers = dependencies.retrieveAllUsers || retrieveAllUsers

    return async (req, res) => {
        const { tournamentId, detail = "compact" } = req.query
        const found = await retrieveTournament(tournamentId)

        if (!found) {
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo indicado"
            )
        }

        const stored = toPlain(found)

        if (stored.ongoing !== false || !stored.outcome?.champion) {
            throw new HttpError(
                409,
                "TOURNAMENT_NOT_FINISHED",
                "El torneo todavía no terminó"
            )
        }

        const rawMatches = (await retrieveMatches(tournamentId)).map(toPlain)

        // Los legacy no tienen partidos: no hay con qué armar un recap.
        if (!rawMatches.some(isPlayedValid)) {
            throw new HttpError(
                422,
                "TOURNAMENT_WITHOUT_MATCHES",
                "El torneo no tiene partidos jugados: no se puede armar el contexto"
            )
        }

        // Una lectura de cada fuente; si alguna falla, falla el endpoint (nunca
        // se devuelve un contexto incompleto).
        const [timeline, ratingMatches, allTournaments, users] =
            await Promise.all([
                retrieveTimeline(),
                retrieveRatingHistory(),
                retrieveTournaments(),
                retrieveUsers(),
            ])

        // Nombre visible: el apodo del usuario y, si no hay, el que quedó
        // guardado en el partido o el torneo.
        const names = buildNameIndex(users)
        const nameOf = (reference) =>
            names.get(String(reference?.id)) ?? reference?.name ?? null
        const rename = (reference) =>
            reference ? { ...reference, name: nameOf(reference) } : reference
        const renameOutcomeSide = (side) =>
            side ? { ...side, player: rename(side.player) } : side
        const tournament = {
            ...stored,
            players: (stored.players ?? []).map(rename),
            teams: (stored.teams ?? []).map((entry) => ({
                ...entry,
                player: rename(entry.player),
            })),
            outcome: {
                ...stored.outcome,
                champion: renameOutcomeSide(stored.outcome.champion),
                finalist: renameOutcomeSide(stored.outcome.finalist),
            },
        }
        const matches = rawMatches.map((match) => ({
            ...match,
            playerP1: rename(match.playerP1),
            playerP2: rename(match.playerP2),
        }))

        const rules = describeTournamentFormat(tournament)
        const playoffTeamIds = new Set(
            matches
                .filter(({ type }) => type === "playoff")
                .flatMap(({ teamP1, teamP2 }) => [teamP1?.id, teamP2?.id])
                .filter((id) => id !== undefined && id !== null)
                .map(String)
        )
        const { standings, topTwoByGroup } = buildStandingsProgress({
            tournament,
            matches: matches.filter(({ type }) => type === "regular"),
            rules,
            playoffTeamIds,
        })
        const entries = buildMatchEntries({
            matches,
            timeline,
            tournament,
            topTwoByGroup,
        })
        const toRef = (reference) =>
            reference ? { id: reference.id, name: reference.name } : null
        const champion = {
            player: toRef(tournament.outcome.champion.player),
            team: toRef(tournament.outcome.champion.team),
        }
        const runnerUp = tournament.outcome.finalist
            ? {
                  player: toRef(tournament.outcome.finalist.player),
                  team: toRef(tournament.outcome.finalist.team),
              }
            : null
        const bracket = buildBracket({
            tournament,
            rules,
            matches,
            entries,
            standings,
            champion,
        })
        const result = {
            champion,
            runnerUp,
            source: bracket.finalDecided ? "final" : "table",
            final: bracket.final,
        }
        const matchIds = new Set(entries.map(({ matchId }) => matchId))
        // La ventana del torneo sale solo de los partidos válidos: un
        // `valid: false` cargado tarde (un W.O., por ejemplo) no la estira.
        const times = entries
            .filter(({ valid }) => valid)
            .map(({ playedAt }) => toTime(playedAt))
        const dated = times.every((time) => time !== null)
        const firstMatchTime = dated ? Math.min(...times) : null
        const lastMatchTime = dated ? Math.max(...times) : null
        const ratingMovement = buildRatingMovement({
            timeline,
            matchIds,
            nameOf,
        })
        const playerStats = buildPlayerStats({
            entries,
            players: tournament.players,
        })
        const headToHead = buildHeadToHead({
            entries,
            ratingMatches,
            tournamentId: String(tournament._id),
            firstMatchTime,
            finalists:
                runnerUp && runnerUp.player
                    ? {
                          championId: champion.player.id,
                          runnerUpId: runnerUp.player.id,
                      }
                    : null,
        })
        const { titleContext, warnings: titleWarnings } = buildTitleContext({
            tournaments: allTournaments.map(toPlain),
            tournament,
            nameOf,
        })
        const overlappingEvents = dated
            ? timeline.events.filter(
                  (event) =>
                      event.time !== null &&
                      event.time >= firstMatchTime &&
                      event.time <= lastMatchTime &&
                      !matchIds.has(event.matchId)
              ).length
            : 0
        const facts = buildFacts({
            tournament,
            rules,
            result,
            standings,
            ties: bracket.ties,
            championPath: bracket.championPath,
            entries,
            ratingMovement,
            playerStats,
            headToHead,
            titleContext,
        })
        const dataQuality = buildDataQuality({
            tournament,
            entries,
            ratingMovement,
            overlappingEvents,
            extraWarnings: titleWarnings,
        })
        const provisionalById = new Map(
            ratingMovement.players.map(({ player, ratingProvisional }) => [
                String(player.id),
                ratingProvisional,
            ])
        )
        const overallOf = (teamId) => {
            for (const entry of entries) {
                for (const side of [entry.p1, entry.p2]) {
                    if (
                        String(side.teamId) === String(teamId) &&
                        side.ovr !== null
                    ) {
                        return side.ovr
                    }
                }
            }
            return null
        }
        const { matches: selectedMatches, matchesOmitted } = selectMatches(
            entries,
            detail
        )
        const competition = getCompetition(tournament)
        const closedAt = toIso(tournament.closedAt)
        const startedAt = toIso(tournament.startedAt)
        const countStage = (stage) =>
            entries.filter((entry) => entry.stage === stage).length

        const data = {
            tournament: {
                id: String(tournament._id),
                name: tournament.name,
                format: tournament.format,
                playoffMode: tournament.playoffMode ?? null,
                competition: { key: competition.key, label: competition.label },
                startedAt,
                startedAtPrecision: tournament.startedAtPrecision ?? null,
                closedAt,
                closedAtPrecision: tournament.closedAtPrecision ?? null,
                durationDays:
                    closedAt && startedAt
                        ? Math.max(
                              0,
                              Math.round(
                                  (toTime(closedAt) - toTime(startedAt)) /
                                      DAY_MS
                              )
                          )
                        : null,
                matchCounts: {
                    regular: countStage("regular"),
                    playin: countStage("playin"),
                    playoff: countStage("playoff"),
                    total: entries.length,
                    validFalse: entries.filter(({ valid }) => !valid).length,
                },
                rules,
            },
            participants: tournament.players.map((player) => ({
                player: { id: player.id, name: player.name },
                ratingProvisional:
                    provisionalById.get(String(player.id)) ?? false,
                teams: tournament.teams
                    .filter(
                        (entry) =>
                            String(entry.player?.id) === String(player.id)
                    )
                    .map((entry) => ({
                        id: entry.team.id,
                        name: entry.team.name,
                        overall: overallOf(entry.team.id),
                        group: entry.group ?? null,
                    })),
            })),
            result,
            standings,
            playin: bracket.playin,
            playoffs: bracket.playoffs,
            championPath: bracket.championPath,
            matches: selectedMatches,
            matchesOmitted,
            ratingMovement,
            playerStats,
            headToHead,
            titleContext,
            facts,
            dataQuality,
        }
        const contextHash = crypto
            .createHash("sha256")
            .update(JSON.stringify(data))
            .digest("hex")

        return res.json({
            success: true,
            contextVersion: CONTEXT_VERSION,
            detail,
            meta: {
                ratingVersion: timeline.config.version,
                drawModelVersion: DRAW_MODEL.version,
                contextHash,
            },
            data,
        })
    }
}

const getTournamentRecapContext = createGetTournamentRecapContext()

module.exports = getTournamentRecapContext
module.exports.createGetTournamentRecapContext = createGetTournamentRecapContext
