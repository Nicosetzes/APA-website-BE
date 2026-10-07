const tournamentsModel = require("./../models/tournaments.js")

const DATE_FIELDS =
    "createdAt startedAt startedAtPrecision closedAt closedAtPrecision"

const toTime = (value) => {
    if (value === null || value === undefined) return null
    const time = new Date(value).getTime()
    return Number.isNaN(time) ? null : time
}

const startTime = (tournament) =>
    toTime(tournament?.startedAt ?? tournament?.createdAt)

// Orden en JS (D4): `startedAt ?? createdAt`, sin fecha al final y desempate
// por `_id` desc. Son pocos documentos y no se declaran índices nuevos.
const byStart = (direction) => (a, b) => {
    const timeA = startTime(a)
    const timeB = startTime(b)

    if (timeA !== timeB) {
        if (timeA === null) return 1
        if (timeB === null) return -1
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
        projection =
            "cloudinary_id name ongoing outcome updatedAt format playoffMode"
    } else if (status === "finalized") {
        filter = { ongoing: false, valid: { $ne: false } }
        projection = "name cloudinary_id outcome updatedAt"
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
