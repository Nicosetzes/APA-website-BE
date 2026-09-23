const { rateLimit } = require("express-rate-limit")

const { HttpError } = require("./httpErrors")

const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10
const EDIT_UPLOAD_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const EDIT_UPLOAD_RATE_LIMIT_MAX_REQUESTS = 20

const loginRateLimit = rateLimit({
    windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res, next) =>
        next(
            new HttpError(
                429,
                "TOO_MANY_LOGIN_ATTEMPTS",
                "Demasiados intentos de inicio de sesión. Intentá nuevamente más tarde"
            )
        ),
})

const editUploadRateLimit = rateLimit({
    windowMs: EDIT_UPLOAD_RATE_LIMIT_WINDOW_MS,
    limit: EDIT_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => `user:${req.user.id}`,
    handler: (req, res, next) =>
        next(
            new HttpError(
                429,
                "TOO_MANY_EDIT_UPLOADS",
                "Alcanzaste el límite de solicitudes para subir edits. Intentá nuevamente más tarde"
            )
        ),
})

module.exports = {
    EDIT_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
    EDIT_UPLOAD_RATE_LIMIT_WINDOW_MS,
    LOGIN_RATE_LIMIT_MAX_ATTEMPTS,
    LOGIN_RATE_LIMIT_WINDOW_MS,
    editUploadRateLimit,
    loginRateLimit,
}
