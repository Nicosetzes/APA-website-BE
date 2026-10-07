// Fecha en la que se jugó un partido. `playedAt` es la fuente; mientras haya
// partidos jugados sin backfill se cae a `updatedAt`, que es lo que se usaba
// antes. Ver decisiones D1 y D2 del plan de normalización.

const PLAYED_AT_PRECISIONS = ["exact", "day", "month", "year", "approx"]

const PLAYED_AT_SORT_FIELD = "_sortPlayedAt"

const getPlayedAt = (match) => match?.playedAt ?? match?.updatedAt ?? null

const getPlayedAtPrecision = (match) => {
    if (match?.playedAt) return match.playedAtPrecision ?? "exact"
    return match?.updatedAt ? "exact" : null
}

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

// Fecha desc, sin fecha al final y desempate por `_id` desc.
const comparePlayedAtDesc = (a, b) => {
    const timeA = toTime(getPlayedAt(a))
    const timeB = toTime(getPlayedAt(b))

    if (timeA !== timeB) {
        if (timeA === null) return 1
        if (timeB === null) return -1
        return timeB - timeA
    }

    const idA = String(a?._id ?? "")
    const idB = String(b?._id ?? "")
    if (idA === idB) return 0
    return idA < idB ? 1 : -1
}

const PLAYED_AT_ADD_FIELDS_STAGE = {
    $addFields: {
        [PLAYED_AT_SORT_FIELD]: { $ifNull: ["$playedAt", "$updatedAt"] },
    },
}

const PLAYED_AT_PROJECT_STAGE = { $project: { [PLAYED_AT_SORT_FIELD]: 0 } }

// Orden paginado en Mongo equivalente a `comparePlayedAtDesc`. No usa índice:
// en prod `autoIndex` está activo y no se declaran índices nuevos.
const PLAYED_AT_SORT_STAGES = [
    PLAYED_AT_ADD_FIELDS_STAGE,
    { $sort: { [PLAYED_AT_SORT_FIELD]: -1, _id: -1 } },
    PLAYED_AT_PROJECT_STAGE,
]

const playedAtRangeCondition = (range) => ({
    $or: [
        { playedAt: range },
        { playedAt: { $exists: false }, updatedAt: range },
    ],
})

const objectIdDate = (id) => {
    if (typeof id?.getTimestamp === "function") return id.getTimestamp()
    const hex = String(id ?? "")
    if (!/^[0-9a-f]{24}$/i.test(hex)) return null
    return new Date(parseInt(hex.substring(0, 8), 16) * 1000)
}

// Campos de `playedAt` a mezclar en el update del partido cuyo resultado se
// carga o edita (nunca en piernas hermanas ni slots):
// - ya tiene `playedAt`: no se toca (editar no mueve la fecha);
// - jugado antes del backfill: conserva la fecha visible previa;
// - no estaba jugado: ahora.
const resolvePlayedAtOnResult = (previous, now) => {
    if (previous?.playedAt) return {}

    if (previous?.played === true) {
        const playedAt = previous.updatedAt ?? objectIdDate(previous._id) ?? now
        return { playedAt, playedAtPrecision: "exact" }
    }

    return { playedAt: now, playedAtPrecision: "exact" }
}

module.exports = {
    PLAYED_AT_PRECISIONS,
    PLAYED_AT_SORT_FIELD,
    PLAYED_AT_ADD_FIELDS_STAGE,
    PLAYED_AT_PROJECT_STAGE,
    PLAYED_AT_SORT_STAGES,
    getPlayedAt,
    getPlayedAtPrecision,
    comparePlayedAtDesc,
    playedAtRangeCondition,
    resolvePlayedAtOnResult,
}
