// Fecha en la que se jugó un partido: `playedAt` + `playedAtPrecision`. Todo
// partido jugado tiene `playedAt`; uno sin jugar no lo tiene.

const PLAYED_AT_PRECISIONS = ["exact", "day", "month", "year", "approx"]

const PLAYED_AT_SORT = { playedAt: -1, _id: -1 }

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

// Equivalente en JS de `PLAYED_AT_SORT`, con los partidos sin fecha al final.
const comparePlayedAtDesc = (a, b) => {
    const timeA = toTime(a?.playedAt)
    const timeB = toTime(b?.playedAt)

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

// Campos de `playedAt` a mezclar en el update del partido cuyo resultado se
// carga o edita (nunca en piernas hermanas ni slots):
// - ya tiene `playedAt`: no se toca (editar no mueve la fecha);
// - no lo tiene: ahora, con precisión exacta.
const resolvePlayedAtOnResult = (previous, now) =>
    previous?.playedAt ? {} : { playedAt: now, playedAtPrecision: "exact" }

module.exports = {
    PLAYED_AT_PRECISIONS,
    PLAYED_AT_SORT,
    comparePlayedAtDesc,
    resolvePlayedAtOnResult,
}
