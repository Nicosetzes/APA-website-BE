const logger = require("../utils/logger")

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

const mapMulterError = (error) => {
    if (error.name !== "MulterError") return null

    if (error.code === "LIMIT_FILE_SIZE") {
        return {
            status: 413,
            code: "FILE_TOO_LARGE",
            message: "Cada archivo puede pesar como máximo 3 MB",
        }
    }

    if (
        error.code === "LIMIT_FILE_COUNT" ||
        error.code === "LIMIT_UNEXPECTED_FILE"
    ) {
        return {
            status: 400,
            code: "TOO_MANY_FILES",
            message: "Se pueden subir como máximo 10 imágenes por solicitud",
        }
    }

    return {
        status: 400,
        code: "INVALID_UPLOAD",
        message: "La solicitud de archivos no es válida",
    }
}

const errorHandler = (error, req, res, next) => {
    if (res.headersSent) return next(error)

    const isKnownError = error instanceof HttpError
    const multerError = mapMulterError(error)
    const errorStatus = Number(error.status)
    let status = 500

    if (isKnownError) {
        status = error.status
    } else if (multerError) {
        status = multerError.status
    } else if (errorStatus >= 400 && errorStatus < 600) {
        status = errorStatus
    }

    const isPayloadTooLarge = errorStatus === 413
    const isClientError = status >= 400 && status < 500
    const code = isKnownError
        ? error.code
        : multerError?.code ||
          (isPayloadTooLarge
              ? "REQUEST_TOO_LARGE"
              : isClientError
              ? "INVALID_REQUEST"
              : "INTERNAL_ERROR")
    const message = isKnownError
        ? error.message
        : multerError?.message ||
          (isPayloadTooLarge
              ? "La solicitud excede el tamaño permitido"
              : isClientError
              ? "La solicitud no es válida"
              : "Ocurrió un error interno")

    if (status >= 500) {
        logger.error("http_error", {
            requestId: req.requestId || null,
            statusCode: status,
            code,
            errorName: error.name || "Error",
        })
    }

    return res.status(status).json({
        error: {
            code,
            message,
            details: isKnownError ? error.details : [],
            requestId: req.requestId || null,
        },
    })
}

module.exports = {
    HttpError,
    notFound,
    errorHandler,
}
