const crypto = require("node:crypto")

const { HttpError } = require("./httpErrors")

const RECAP_SECRET_HEADER = "x-recap-secret"

const digest = (value) =>
    crypto.createHash("sha256").update(String(value)).digest()

const requireRecapSecret = (req, res, next) => {
    const expectedSecret = process.env.RECAP_SECRET?.trim()

    // Sin secreto configurado el endpoint queda cerrado.
    if (!expectedSecret) {
        return next(
            new HttpError(
                503,
                "RECAP_SECRET_NOT_CONFIGURED",
                "El endpoint de recaps no está configurado"
            )
        )
    }

    const providedSecret = req.get(RECAP_SECRET_HEADER)

    // Se comparan hashes de largo fijo para no filtrar el largo del secreto.
    if (
        !providedSecret ||
        !crypto.timingSafeEqual(digest(providedSecret), digest(expectedSecret))
    ) {
        return next(
            new HttpError(
                401,
                "INVALID_RECAP_SECRET",
                "Secreto de recaps ausente o inválido"
            )
        )
    }

    return next()
}

module.exports = requireRecapSecret
module.exports.RECAP_SECRET_HEADER = RECAP_SECRET_HEADER
