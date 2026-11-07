// Datos del partido que el motor guarda en cada evento de rating además de la
// matemática: id de equipo, torneo, tipo de cruce, precisión de la fecha y tanda
// de penales. Todos salen SOLO del partido (y del contexto de su torneo que
// adjunta `dao/findRatingMatches`), así que el evento en vivo y el guardado en
// `rating-events` son el mismo objeto. Nada de esto entra en el cálculo: el
// resultado de un partido definido por penales sigue valiendo 0,5.
const { PLAYED_AT_PRECISIONS } = require("../../utils/playedAt")
const { eventKind } = require("./matchKind")

const LEGS = [1, 2, 3]

const isShootoutScore = (value) => Number.isInteger(value) && value >= 0

const isPresent = (value) => value !== null && value !== undefined

// Id del equipo tal cual está en el partido: número finito (el 0 es válido) o
// string no vacío. Cualquier otra cosa (sin equipo, `null`, `""`, objeto) es
// `null`.
const teamIdOf = (team) => {
    const id = team?.id
    if (typeof id === "number") return Number.isFinite(id) ? id : null
    if (typeof id === "string") return id === "" ? null : id
    return null
}

// Tanda de penales de un partido: `{ p1, p2, winner }` (goles de la tanda del
// equipo 1 y del 2, y el lado ganador de la definición) o `null` si no hubo
// tanda o el dato no alcanza para orientarla. Solo se define por penales un
// partido empatado en goles. El ganador de la tanda se compara con el id del
// equipo 1 como string (los ids de equipo pueden ser número o string): si no
// coincide se toma como el equipo 2.
const toShootout = (match) => {
    const outcome = match?.outcome
    if (match?.scoreP1 !== match?.scoreP2) return null
    if (!outcome?.penalties) return null

    const teamP1 = match.teamP1?.id
    const winner = outcome.teamThatWon?.id
    if (!isPresent(teamP1) || !isPresent(winner)) return null

    const { scoreFromTeamThatWon: won, scoreFromTeamThatLost: lost } = outcome
    if (!isShootoutScore(won) || !isShootoutScore(lost)) return null

    return String(winner) === String(teamP1)
        ? { p1: won, p2: lost, winner: "p1" }
        : { p1: lost, p2: won, winner: "p2" }
}

const textOrNull = (value) => (typeof value === "string" ? value : null)

// Campos nuevos del evento (todos `null` si no hay dato, nunca `undefined`).
// `match.tournamentContext` es `{ format, playoffMode }` o `null` si el partido
// no tiene un torneo resoluble; en ese caso un playin/playoff no tiene `kind`.
const buildEventContext = (match) => {
    const tournamentContext = match?.tournamentContext ?? null
    const leg = LEGS.includes(match?.leg) ? match.leg : null
    const tournamentId = match?.tournament?.id
    const shootout = toShootout(match)

    return {
        tournamentId:
            isPresent(tournamentId) && String(tournamentId) !== ""
                ? String(tournamentId)
                : null,
        leg,
        tournamentFormat: textOrNull(tournamentContext?.format),
        tournamentPlayoffMode: textOrNull(tournamentContext?.playoffMode),
        kind: eventKind({
            type: match?.type,
            leg,
            tournament: tournamentContext,
        }),
        playedAtPrecision: PLAYED_AT_PRECISIONS.includes(
            match?.playedAtPrecision
        )
            ? match.playedAtPrecision
            : null,
        shootoutP1: shootout?.p1 ?? null,
        shootoutP2: shootout?.p2 ?? null,
        shootoutWinner: shootout?.winner ?? null,
    }
}

module.exports = { buildEventContext, teamIdOf, toShootout }
