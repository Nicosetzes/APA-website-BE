const { randomUUID } = require("crypto")

const logger = require("../utils/logger")

const REQUEST_ID_HEADER = "x-request-id"
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/

const resolveRequestId = (headerValue) => {
    const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue

    return typeof candidate === "string" && VALID_REQUEST_ID.test(candidate)
        ? candidate
        : randomUUID()
}

const createRequestContext = (requestLogger = logger) => {
    return (req, res, next) => {
        const requestId = resolveRequestId(req.headers[REQUEST_ID_HEADER])
        const startedAt = process.hrtime.bigint()
        let hasLogged = false

        req.requestId = requestId
        res.setHeader("X-Request-Id", requestId)

        const logRequest = (event) => {
            if (hasLogged) return
            hasLogged = true

            const durationNanoseconds = process.hrtime.bigint() - startedAt
            const durationMs = Number(durationNanoseconds) / 1e6

            requestLogger.info(event, {
                requestId,
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                durationMs: Number(durationMs.toFixed(2)),
                userId: req.user?.id || null,
            })
        }

        res.once("finish", () => logRequest("http_request"))
        res.once("close", () => {
            if (!res.writableEnded) logRequest("http_request_aborted")
        })

        next()
    }
}

module.exports = {
    REQUEST_ID_HEADER,
    createRequestContext,
    requestContext: createRequestContext(),
    resolveRequestId,
}
