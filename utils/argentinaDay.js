const ARGENTINA_OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

const getArgentinaDayRange = (date) => {
    const [year, month, day] = date.split("-").map(Number)
    const start = new Date(Date.UTC(year, month - 1, day) + ARGENTINA_OFFSET_MS)

    return { start, end: new Date(start.getTime() + DAY_MS) }
}

// Día argentino (UTC-3 fijo, sin horario de verano) de un instante, como
// `YYYY-MM-DD`. A las 02:59Z todavía es el día anterior; a las 03:00Z empieza el
// siguiente.
const getArgentinaToday = (now = new Date()) =>
    new Date(now.getTime() - ARGENTINA_OFFSET_MS).toISOString().slice(0, 10)

// Corre una fecha `YYYY-MM-DD` una cantidad entera de días (negativa hacia el
// pasado). Es aritmética de calendario: no depende de la hora.
const shiftArgentinaDate = (date, days) => {
    const [year, month, day] = date.split("-").map(Number)

    return new Date(Date.UTC(year, month - 1, day) + days * DAY_MS)
        .toISOString()
        .slice(0, 10)
}

module.exports = {
    getArgentinaDayRange,
    getArgentinaToday,
    shiftArgentinaDate,
}
