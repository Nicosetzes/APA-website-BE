const {
    invalidate: invalidateRatingMatches,
} = require("../service/retrieveRatingMatches")

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])

// Descarta el historial en memoria de los ratings cuando una escritura termina.
// Se hace al cerrar la respuesta y no al empezar la escritura: si se hiciera antes,
// una lectura que entre justo en el medio volvería a guardar los datos viejos
// (por ejemplo antes del commit de una transacción). Se invalida aunque la
// escritura haya fallado, porque pudo dejar cambios a medias.
const invalidateRatingCacheOnWrite =
    ({ invalidate = invalidateRatingMatches } = {}) =>
    (req, res, next) => {
        if (!WRITE_METHODS.has(req.method)) return next()

        let done = false
        const run = () => {
            if (done) return
            done = true
            invalidate()
        }
        res.once("finish", run)
        res.once("close", run)
        return next()
    }

module.exports = { invalidateRatingCacheOnWrite }
