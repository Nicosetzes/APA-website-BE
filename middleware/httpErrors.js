class HttpError extends Error {
    constructor(status, code, message, details = [], options = {}) {
        super(message)
        this.name = "HttpError"
        this.status = status
        this.code = code
        this.details = details
        this.cause = options.cause
    }
}

const notFound = (req, res, next) => {
    next(
        new HttpError(
            404,
            "ROUTE_NOT_FOUND",
            `No existe ${req.method} ${req.originalUrl}`
        )
    )
}

const errorHandler = (error, req, res, next) => {
    if (res.headersSent) return next(error)

    const isKnownError = error instanceof HttpError
    const errorStatus = Number(error.status)
    let status = 500

    if (isKnownError) {
        status = error.status
    } else if (errorStatus >= 400 && errorStatus < 600) {
        status = errorStatus
    }

    const isClientError = status >= 400 && status < 500
    const code = isKnownError
        ? error.code
        : isClientError
        ? "INVALID_REQUEST"
        : "INTERNAL_ERROR"
    const message = isKnownError
        ? error.message
        : isClientError
        ? "La solicitud no es válida"
        : "Ocurrió un error interno"

    if (status >= 500) {
        console.error(error)
    }

    return res.status(status).json({
        error: {
            code,
            message,
            details: isKnownError ? error.details : [],
        },
    })
}

module.exports = {
    HttpError,
    notFound,
    errorHandler,
}
