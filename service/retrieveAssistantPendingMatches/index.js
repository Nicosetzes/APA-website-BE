const {
    DEFAULT_PENDING_LIMIT,
    MAX_AWAITING_OPPONENT_ITEMS,
    MAX_PENDING_LIMIT,
    buildViewPath,
} = require("../../config/assistant")
const { getPlayoffRoundForId } = require("../../config/playoffFormats")
const {
    findAllUsers,
    findPendingMatchesForAssistant,
    findTournamentsForAssistant,
} = require("./../../dao")
const { HttpError } = require("../../middleware/httpErrors")
const { omitNil } = require("../../utils/omitNil")
const { attachFavorites } = require("./favorite")

const STAGE_RANK = { regular: 0, playin: 1, playoff: 2 }
const UNKNOWN_STAGE_RANK = 3

const clampLimit = (limit) => {
    const requested = Number(limit)
    if (!Number.isFinite(requested)) return DEFAULT_PENDING_LIMIT
    return Math.min(Math.max(Math.trunc(requested), 1), MAX_PENDING_LIMIT)
}

const toSide = (player, team) =>
    player?.id === undefined || player?.id === null
        ? null
        : {
              id: String(player.id),
              name: player.name ?? null,
              team: team?.name ?? null,
          }

const compareIds = (a, b) => (a === b ? 0 : a < b ? -1 : 1)

// Mismo orden que la vista de fixture del FE para la fase regular (zona y
// después `_id` descendente) y orden de llave para play-in y playoff.
const buildComparator = (tournamentOrder) => (a, b) => {
    const byTournament =
        tournamentOrder.get(a.tournamentId) -
        tournamentOrder.get(b.tournamentId)
    if (byTournament) return byTournament

    const byStage =
        (STAGE_RANK[a.stage] ?? UNKNOWN_STAGE_RANK) -
        (STAGE_RANK[b.stage] ?? UNKNOWN_STAGE_RANK)
    if (byStage) return byStage

    if (a.stage === "regular") {
        const byGroup = String(a.group ?? "").localeCompare(
            String(b.group ?? "")
        )
        if (byGroup) return byGroup

        return compareIds(b.matchId, a.matchId)
    }

    const byBracket = (a.playoffId ?? 0) - (b.playoffId ?? 0)
    if (byBracket) return byBracket

    const byLeg = (a.leg ?? 0) - (b.leg ?? 0)
    if (byLeg) return byLeg

    return compareIds(a.matchId, b.matchId)
}

const normalizeMatch = (match, tournament) => ({
    matchId: String(match._id),
    tournamentId: String(tournament._id),
    tournament: tournament.name,
    stage: match.type,
    group: match.group ?? null,
    playoffId: match.playoff_id ?? null,
    round:
        match.type === "playoff" && match.playoff_id !== undefined
            ? getPlayoffRoundForId(tournament.format, match.playoff_id)
            : null,
    leg: match.leg ?? null,
    p1: toSide(match.playerP1, match.teamP1),
    p2: toSide(match.playerP2, match.teamP2),
})

const toMatchItem = (record) =>
    omitNil({
        matchId: record.matchId,
        tournamentId: record.tournamentId,
        tournament: record.tournament,
        stage: record.stage,
        group: record.group,
        round: record.round,
        playoffId: record.playoffId,
        leg: record.leg,
        p1: record.p1,
        p2: record.p2,
        viewPath: buildViewPath(record.tournamentId, record.stage),
    })

const toAwaitingItem = (record) =>
    omitNil({
        matchId: record.matchId,
        tournamentId: record.tournamentId,
        tournament: record.tournament,
        stage: record.stage,
        round: record.round,
        playoffId: record.playoffId,
        leg: record.leg,
        player: record.p1 ?? record.p2,
        viewPath: buildViewPath(record.tournamentId, record.stage),
    })

const emptyStageCounts = () => ({ regular: 0, playin: 0, playoff: 0 })

const countStage = (counts, stage) => {
    if (Object.hasOwn(counts, stage)) counts[stage] += 1
}

// Convierte los partidos sin jugar en la respuesta del asistente. Pura: no lee
// la base. Un partido es "jugable" si no se jugó, es válido y tiene a los dos
// jugadores asignados. Los cruces con un solo lado asignado van aparte.
const buildPendingMatchesResponse = ({
    tournaments,
    matches,
    scope,
    playerIds,
    limit,
    now,
}) => {
    const playerSet = new Set(playerIds)
    const tournamentsById = new Map(
        tournaments.map((tournament) => [String(tournament._id), tournament])
    )
    const tournamentOrder = new Map(
        tournaments.map((tournament, index) => [String(tournament._id), index])
    )
    const compare = buildComparator(tournamentOrder)

    const touchesPlayers = (record) =>
        playerSet.size === 0 ||
        [record.p1, record.p2].some((side) => side && playerSet.has(side.id))
    const isAmongPlayers = (record) =>
        record.p1 &&
        record.p2 &&
        playerSet.has(record.p1.id) &&
        playerSet.has(record.p2.id)
    const isRelevant = scope === "among" ? isAmongPlayers : touchesPlayers

    const playable = []
    const awaiting = []
    let sameOwnerTies = 0

    for (const match of matches) {
        const tournament = tournamentsById.get(String(match.tournament?.id))
        if (!tournament) continue

        const record = normalizeMatch(match, tournament)

        if (!record.p1 && !record.p2) continue

        if (!record.p1 || !record.p2) {
            if (scope === "involving" && touchesPlayers(record))
                awaiting.push(record)
            continue
        }

        if (!isRelevant(record)) continue

        if (record.p1.id === record.p2.id) {
            sameOwnerTies += 1
            continue
        }

        playable.push(record)
    }

    playable.sort(compare)
    awaiting.sort(compare)

    const byStage = emptyStageCounts()
    const perTournament = new Map()

    const entryFor = (record) => {
        if (!perTournament.has(record.tournamentId)) {
            const tournament = tournamentsById.get(record.tournamentId)
            perTournament.set(record.tournamentId, {
                tournamentId: record.tournamentId,
                name: tournament.name,
                format: tournament.format ?? null,
                pending: 0,
                byStage: emptyStageCounts(),
                awaitingOpponent: 0,
                viewPaths: {},
            })
        }
        return perTournament.get(record.tournamentId)
    }

    for (const record of playable) {
        const entry = entryFor(record)
        entry.pending += 1
        countStage(entry.byStage, record.stage)
        countStage(byStage, record.stage)
        entry.viewPaths[record.stage] = buildViewPath(
            record.tournamentId,
            record.stage
        )
    }

    for (const record of awaiting) entryFor(record).awaitingOpponent += 1

    const byTournament = tournaments
        .map((tournament) => perTournament.get(String(tournament._id)))
        .filter(Boolean)

    const shown = playable.slice(0, limit)
    const remaining = playable.length - shown.length

    return {
        asOf: now.toISOString(),
        totalPending: playable.length,
        byStage,
        byTournament,
        matches: shown.map(toMatchItem),
        returned: shown.length,
        remaining,
        truncated: remaining > 0,
        awaitingOpponent: {
            count: awaiting.length,
            matches: awaiting
                .slice(0, MAX_AWAITING_OPPONENT_ITEMS)
                .map(toAwaitingItem),
        },
        excluded: { sameOwnerTies },
    }
}

const buildNotes = ({ response, unknownPlayers, extra }) => {
    const notes = [...extra]

    if (unknownPlayers.length)
        notes.push(
            `No existen jugadores con estos ids: ${unknownPlayers.join(", ")}.`
        )

    if (response.excluded.sameOwnerTies > 0)
        notes.push(
            `${response.excluded.sameOwnerTies} cruce(s) entre dos equipos del mismo jugador no se cuentan: se resuelven por elección y no se juegan.`
        )

    if (response.truncated)
        notes.push(
            `Hay ${response.remaining} partidos más que no se detallan. Para verlos, usá los viewPaths de byTournament.`
        )

    return notes
}

const retrieveAssistantPendingMatches = async (filters, dependencies = {}) => {
    const {
        players = [],
        scope = "involving",
        tournamentId,
        stage,
        limit,
    } = filters
    const findTournaments =
        dependencies.findTournamentsForAssistant || findTournamentsForAssistant
    const findMatches =
        dependencies.findPendingMatchesForAssistant ||
        findPendingMatchesForAssistant
    const findUsers = dependencies.findAllUsers || findAllUsers
    const now = dependencies.now?.() ?? new Date()
    const effectiveLimit = clampLimit(limit)

    const requestedIds = [...new Set(players.map(String))]
    const users = Array.from((await findUsers()) || [])
    const namesById = new Map(
        users.map((user) => [String(user.id ?? user._id), user.nickname])
    )
    const knownIds = requestedIds.filter((id) => namesById.has(id))
    const unknownPlayers = requestedIds.filter((id) => !namesById.has(id))

    const tournaments = await findTournaments({ tournamentId })
    let tournamentFilter = null
    const extraNotes = []
    let activeTournaments = tournaments

    if (tournamentId) {
        const [tournament] = tournaments

        if (!tournament)
            throw new HttpError(
                404,
                "TOURNAMENT_NOT_FOUND",
                "No se encontró el torneo indicado"
            )

        const active = tournament.ongoing === true && tournament.valid !== false
        tournamentFilter = {
            id: String(tournament._id),
            name: tournament.name,
            active,
        }
        activeTournaments = active ? tournaments : []

        if (!active)
            extraNotes.push(
                `El torneo «${tournament.name}» ya no está activo: no tiene partidos pendientes.`
            )
    } else if (tournaments.length === 0) {
        extraNotes.push("No hay torneos activos.")
    }

    // Con jugadores pedidos pero ninguno conocido (o `among` con menos de dos)
    // no hay nada que buscar: se responde vacío sin leer partidos.
    const hasRequestedPlayers = requestedIds.length > 0
    const cannotMatch =
        (hasRequestedPlayers && knownIds.length === 0) ||
        (scope === "among" && knownIds.length < 2)

    if (scope === "among" && knownIds.length < 2 && hasRequestedPlayers)
        extraNotes.push(
            "scope=among necesita al menos dos jugadores que existan."
        )

    const matches =
        activeTournaments.length === 0 || cannotMatch
            ? []
            : await findMatches({
                  tournamentIds: activeTournaments.map((tournament) =>
                      String(tournament._id)
                  ),
                  stage,
                  playerIds: knownIds,
                  scope,
              })

    const response = buildPendingMatchesResponse({
        tournaments: activeTournaments,
        matches,
        scope,
        playerIds: knownIds,
        limit: effectiveLimit,
        now,
    })

    // Adorno: agrega `favorite` solo a los partidos que se devuelven (máx. 20).
    // Nunca rechaza la respuesta: si falla, los partidos salen sin `favorite`.
    if (
        typeof dependencies.addPredictions === "function" &&
        response.matches.length > 0
    ) {
        try {
            response.matches = await attachFavorites({
                items: response.matches,
                rawById: new Map(
                    matches.map((match) => [String(match._id), match])
                ),
                tournamentsById: new Map(
                    activeTournaments.map((tournament) => [
                        String(tournament._id),
                        tournament,
                    ])
                ),
                addPredictions: dependencies.addPredictions,
                logger: dependencies.logger,
            })
        } catch (error) {
            dependencies.logger?.warn?.("assistant_favorites_unavailable", {
                message: error?.message,
            })
        }
    }

    return {
        asOf: response.asOf,
        filters: {
            players: knownIds.map((id) => ({ id, name: namesById.get(id) })),
            unknownPlayers,
            scope,
            tournament: tournamentFilter,
            stage: stage ?? null,
            limit: effectiveLimit,
        },
        totalPending: response.totalPending,
        byStage: response.byStage,
        byTournament: response.byTournament,
        matches: response.matches,
        returned: response.returned,
        remaining: response.remaining,
        truncated: response.truncated,
        awaitingOpponent: response.awaitingOpponent,
        excluded: response.excluded,
        notes: buildNotes({ response, unknownPlayers, extra: extraNotes }),
    }
}

module.exports = retrieveAssistantPendingMatches
module.exports.buildPendingMatchesResponse = buildPendingMatchesResponse
module.exports.clampLimit = clampLimit
