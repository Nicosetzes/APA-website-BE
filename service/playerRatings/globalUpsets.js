const { UPSETS_LIMIT, UPSET_PENALTIES } = require("../../config/ratingUpsets")
const { getArgentinaDayRange } = require("../../utils/argentinaDay")
const { eventProbabilityRaw } = require("./eventProbability")
const { displayName, round, toIso } = require("./presentation")

const isCount = (value) => Number.isInteger(value) && value >= 0

const teamOf = (side) => ({
    id: side?.teamId ?? null,
    name: typeof side?.team === "string" && side.team !== "" ? side.team : null,
})

const playerOf = (names, side) => ({
    id: side.id,
    name: displayName(names, side) ?? side.id,
})

const compareIds = (left, right) => (left < right ? -1 : left > right ? 1 : 0)

const sportingWinner = (event) => {
    const hasShootout =
        isCount(event.shootoutP1) &&
        isCount(event.shootoutP2) &&
        event.shootoutP1 !== event.shootoutP2

    if (hasShootout) {
        return {
            p1Won: event.shootoutP1 > event.shootoutP2,
            hasShootout: true,
        }
    }
    if (event.resultP1 === 1) return { p1Won: true, hasShootout: false }
    if (event.resultP1 === 0) return { p1Won: false, hasShootout: false }
    return null
}

const kindOf = (event) => {
    if (event.kind === "win" || event.kind === "advance") return event.kind
    if (
        (event.kind === null || event.kind === undefined) &&
        event.type === "regular"
    ) {
        return "win"
    }
    return null
}

const toCandidate = (event, names) => {
    const matchId =
        event.matchId === null || event.matchId === undefined
            ? ""
            : String(event.matchId)
    const outcome = sportingWinner(event)
    const kind = kindOf(event)
    if (!matchId || !outcome || !kind) return null

    const probability = eventProbabilityRaw({
        kind,
        expectedP1: event.expectedP1,
        isP1: outcome.p1Won,
    })
    if (!probability || probability.for >= probability.against) return null

    const winner = outcome.p1Won ? event.p1 : event.p2
    const loser = outcome.p1Won ? event.p2 : event.p1
    if (!winner?.id || !loser?.id) return null

    const ratingChange = outcome.p1Won ? event.delta : -event.delta
    const winnerScore = outcome.p1Won ? event.scoreP1 : event.scoreP2
    const loserScore = outcome.p1Won ? event.scoreP2 : event.scoreP1
    const winnerPenalties = outcome.p1Won ? event.shootoutP1 : event.shootoutP2
    const loserPenalties = outcome.p1Won ? event.shootoutP2 : event.shootoutP1

    return {
        raw: {
            probability: probability.for,
            ratingChange,
            seq: Number.isFinite(event.seq) ? event.seq : 0,
            time:
                event.time === null || event.time === undefined
                    ? null
                    : new Date(event.time).getTime(),
            tournamentId: event.tournamentId ?? null,
            hasShootout: outcome.hasShootout,
        },
        row: {
            matchId,
            playedAt:
                event.time === null || event.time === undefined
                    ? null
                    : toIso(event.time),
            playedAtPrecision: event.playedAtPrecision ?? null,
            tournamentId: event.tournamentId ?? null,
            tournament: {
                id: event.tournamentId ?? null,
                name: event.tournament ?? null,
            },
            type: event.type ?? null,
            winner: playerOf(names, winner),
            loser: playerOf(names, loser),
            teams: {
                winner: teamOf(winner),
                loser: teamOf(loser),
            },
            score: { winner: winnerScore, loser: loserScore },
            penalties: outcome.hasShootout
                ? { winner: winnerPenalties, loser: loserPenalties }
                : null,
            probability: round(probability.for, 3),
            kind,
            ratingChange: round(ratingChange),
        },
    }
}

const compareCandidates = (left, right) =>
    left.raw.probability - right.raw.probability ||
    right.raw.ratingChange - left.raw.ratingChange ||
    left.raw.seq - right.raw.seq ||
    compareIds(left.row.matchId, right.row.matchId)

const uniqueCandidates = (periodEvents, names) => {
    const candidates = new Map()
    ;[...periodEvents]
        .sort(
            (left, right) =>
                (left.seq ?? 0) - (right.seq ?? 0) ||
                compareIds(String(left.matchId), String(right.matchId))
        )
        .forEach((event) => {
            const candidate = toCandidate(event, names)
            if (candidate && !candidates.has(candidate.row.matchId)) {
                candidates.set(candidate.row.matchId, candidate)
            }
        })
    return [...candidates.values()]
}

const buildOptions = (candidates) => {
    const players = new Map()
    const tournaments = new Map()

    candidates.forEach(({ row }) => {
        players.set(row.winner.id, row.winner)
        players.set(row.loser.id, row.loser)
        if (row.tournament.id !== null && !tournaments.has(row.tournament.id)) {
            tournaments.set(row.tournament.id, row.tournament)
        }
    })

    const byNameAndId = (left, right) =>
        String(left.name ?? "").localeCompare(String(right.name ?? "")) ||
        compareIds(String(left.id), String(right.id))

    return {
        players: [...players.values()].sort(byNameAndId),
        tournaments: [...tournaments.values()].sort(byNameAndId),
    }
}

const buildGlobalUpsetsPayload = ({
    periodEvents,
    names,
    dateFrom,
    dateTo,
    tournamentId,
    playerId,
    perspective = "for",
    type,
    penalties = "all",
}) => {
    const candidates = uniqueCandidates(periodEvents, names)
    const options = buildOptions(candidates)
    const from = dateFrom
        ? getArgentinaDayRange(dateFrom).start.getTime()
        : null
    const to = dateTo ? getArgentinaDayRange(dateTo).end.getTime() : null
    const penaltyFilter = UPSET_PENALTIES.includes(penalties)
        ? penalties
        : "all"

    const filtered = candidates
        .filter(
            ({ raw }) =>
                from === null || (raw.time !== null && raw.time >= from)
        )
        .filter(
            ({ raw }) => to === null || (raw.time !== null && raw.time < to)
        )
        .filter(({ raw }) => !tournamentId || raw.tournamentId === tournamentId)
        .filter(({ row }) => {
            if (!playerId) return true
            const selectedPlayerId = String(playerId)
            return perspective === "against"
                ? String(row.loser.id) === selectedPlayerId
                : String(row.winner.id) === selectedPlayerId
        })
        .filter(({ row }) => !type || row.type === type)
        .filter(
            ({ raw }) =>
                penaltyFilter === "all" ||
                (penaltyFilter === "only" ? raw.hasShootout : !raw.hasShootout)
        )
        .sort(compareCandidates)

    return {
        success: true,
        data: {
            total: filtered.length,
            ...options,
            upsets: filtered.slice(0, UPSETS_LIMIT).map(({ row }) => row),
        },
    }
}

module.exports = { buildGlobalUpsetsPayload }
