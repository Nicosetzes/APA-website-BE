const {
    BACKFILL_EXCLUDED_TOURNAMENTS,
    DEFAULT_PENDING_LIMIT,
    DEFAULT_PENDING_WINDOW_DAYS,
} = require("../../config/tournamentRecap")
const {
    findFinishedTournamentsForRecap,
    findTournamentIdsWithPlayedMatches,
    findTournamentRecapIds,
} = require("./../../dao")
const {
    getArgentinaDayRange,
    getArgentinaToday,
    shiftArgentinaDate,
} = require("../../utils/argentinaDay")

const hasOwn = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key)

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

const byClosedAt = (a, b) => {
    const timeA = toTime(a.closedAt)
    const timeB = toTime(b.closedAt)

    if (timeA !== timeB) {
        if (timeA === null) return 1
        if (timeB === null) return -1
        return timeA - timeB
    }

    const idA = String(a._id)
    const idB = String(b._id)

    if (idA === idB) return 0
    return idA < idB ? -1 : 1
}

const reference = (value) =>
    value?.id === undefined ? null : { id: value.id, name: value.name ?? null }

const toPendingItem = (tournament) => ({
    tournamentId: String(tournament._id),
    name: tournament.name,
    format: tournament.format,
    playoffMode: tournament.playoffMode ?? null,
    closedAt: tournament.closedAt ?? null,
    closedAtPrecision: tournament.closedAtPrecision ?? null,
    champion: {
        player: reference(tournament.outcome?.champion?.player),
        team: reference(tournament.outcome?.champion?.team),
    },
    runnerUp: {
        player: reference(tournament.outcome?.finalist?.player),
        team: reference(tournament.outcome?.finalist?.team),
    },
})

// Parte la lista de torneos elegibles en lo que n8n tiene que procesar hoy
// (`data`), lo que queda para un backfill controlado (`backlog`) y los conteos
// que explican la diferencia. Pura: no lee la base.
//
// - Ventana: `closedAt` en [inicio de `closedAfter`, inicio del día argentino
//   de hoy). Un torneo que cierra hoy entra mañana.
// - Sin recap: se restan los ids que ya tienen uno.
// - Sin `closedAt` no se puede ubicar en la ventana: se cuenta en
//   `skippedWithoutClosedAt` y no se devuelve.
// - `withMatches` son los ids con algún partido jugado y válido.
// - `excludedFromBacklog`: ids (claves) que `backlog` no lista; por defecto
//   `BACKFILL_EXCLUDED_TOURNAMENTS`. No toca `data` ni `counts`.
const partitionPendingTournaments = ({
    tournaments,
    recapIds,
    withMatches,
    closedAfter,
    limit,
    now = new Date(),
    excludedFromBacklog = BACKFILL_EXCLUDED_TOURNAMENTS,
}) => {
    const today = getArgentinaToday(now)
    const effectiveClosedAfter =
        closedAfter ?? shiftArgentinaDate(today, -DEFAULT_PENDING_WINDOW_DAYS)
    const windowStart = getArgentinaDayRange(effectiveClosedAfter).start
    const windowEnd = getArgentinaDayRange(today).start
    const hasRecap = new Set(recapIds.map(String))
    const hasMatches = new Set(withMatches.map(String))
    const withoutRecap = tournaments.filter(
        ({ _id }) => !hasRecap.has(String(_id))
    )
    const dated = withoutRecap.filter(
        ({ closedAt }) => toTime(closedAt) !== null
    )
    const inWindow = dated.filter(({ closedAt }) => {
        const time = toTime(closedAt)
        return time >= windowStart.getTime() && time < windowEnd.getTime()
    })
    const inWindowWithMatches = inWindow.filter(({ _id }) =>
        hasMatches.has(String(_id))
    )
    const returned = [...inWindowWithMatches].sort(byClosedAt).slice(0, limit)
    // El backlog es para el backfill controlado: deja afuera los torneos viejos
    // que el usuario prefiere decidir a mano. Solo afecta a este listado: ni la
    // ventana diaria (`data`) ni el contexto por `tournamentId` los excluyen.
    const backlog = withoutRecap
        .filter(({ _id }) => hasMatches.has(String(_id)))
        .filter(({ _id }) => !hasOwn(excludedFromBacklog, String(_id)))
        .sort(byClosedAt)

    return {
        closedAfter: effectiveClosedAfter,
        before: today,
        limit,
        data: returned.map(toPendingItem),
        counts: {
            finishedEligible: tournaments.length,
            withRecap: tournaments.length - withoutRecap.length,
            inWindowWithoutRecap: inWindow.length,
            skippedWithoutClosedAt: withoutRecap.length - dated.length,
            skippedWithoutMatches: inWindow.length - inWindowWithMatches.length,
            returned: returned.length,
        },
        backlog: {
            count: backlog.length,
            tournaments: backlog.map((tournament) => ({
                tournamentId: String(tournament._id),
                name: tournament.name,
                format: tournament.format,
                closedAt: tournament.closedAt ?? null,
            })),
        },
    }
}

// Torneos terminados sin recap, con la ventana y el límite de n8n. Solo
// lectura: tres consultas (torneos elegibles, ids con recap, ids con partidos).
const retrieveTournamentsPendingRecap = async ({
    closedAfter,
    limit = DEFAULT_PENDING_LIMIT,
    now,
    findFinished = findFinishedTournamentsForRecap,
    findRecapIds = findTournamentRecapIds,
    findIdsWithMatches = findTournamentIdsWithPlayedMatches,
} = {}) => {
    const [tournaments, recapIds] = await Promise.all([
        findFinished(),
        findRecapIds(),
    ])
    const recapped = new Set(recapIds.map(String))
    const candidateIds = tournaments
        .map(({ _id }) => String(_id))
        .filter((id) => !recapped.has(id))
    const withMatches = await findIdsWithMatches(candidateIds)

    return partitionPendingTournaments({
        tournaments,
        recapIds,
        withMatches,
        closedAfter,
        limit,
        now,
    })
}

module.exports = retrieveTournamentsPendingRecap
module.exports.partitionPendingTournaments = partitionPendingTournaments
