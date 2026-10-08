const tournamentsModel = require("./../models/tournaments.js")

const DATE_FIELDS = "startedAt startedAtPrecision closedAt closedAtPrecision"

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

// Orden por `startedAt`. Un torneo sin `startedAt` todavía no empezó y cuenta
// como el más nuevo: en `desc` (por defecto, `legacy=false` y `active`) va
// primero y después siguen los demás por `startedAt` desc; en `asc`
// (finalizados) van por `startedAt` asc con los no empezados al final.
// Empates por `_id` desc.
const byStart = (direction) => (a, b) => {
    const timeA = toTime(a?.startedAt)
    const timeB = toTime(b?.startedAt)

    if (timeA !== timeB) {
        if (timeA === null) return direction === "asc" ? 1 : -1
        if (timeB === null) return direction === "asc" ? -1 : 1
        return direction === "asc" ? timeA - timeB : timeB - timeA
    }

    const idA = String(a?._id ?? "")
    const idB = String(b?._id ?? "")
    if (idA === idB) return 0
    return idA < idB ? 1 : -1
}

const findTournaments = async (legacy, status) => {
    let filter
    let projection
    let direction = "desc"

    if (legacy === false) {
        filter = { legacy: { $ne: true }, valid: { $ne: false } }
        projection = "cloudinary_id name ongoing outcome format playoffMode"
    } else if (status === "finalized") {
        filter = { ongoing: false, valid: { $ne: false } }
        projection = "name cloudinary_id outcome"
        direction = "asc"
    } else if (status === "active") {
        filter = { ongoing: true, valid: { $ne: false } }
        projection = "name ongoing cloudinary_id"
    } else {
        filter = { valid: { $ne: false } }
        projection = "name ongoing cloudinary_id outcome"
    }

    const tournaments = await tournamentsModel.find(
        filter,
        `${projection} ${DATE_FIELDS}`
    )

    return Array.from(tournaments).sort(byStart(direction))
}

module.exports = findTournaments
