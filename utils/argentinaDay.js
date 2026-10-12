const ARGENTINA_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const getArgentinaDayRange = (date) => {
    const [year, month, day] = date.split("-").map(Number)
    const start = new Date(Date.UTC(year, month - 1, day) + ARGENTINA_OFFSET_MS)

    return { start, end: new Date(start.getTime() + DAY_MS) }
}

module.exports = { getArgentinaDayRange }
