const { HttpError } = require("./httpErrors")

const requestSources = ["params", "query", "body"]

const toSafeDetails = (source, error) =>
    error.details.map((detail) => ({
        source,
        path: detail.path.map(String).join("."),
        code: detail.type,
    }))

const validateRequest = (schema) => {
    return (req, res, next) => {
        const convertedValues = {}
        const details = []

        requestSources.forEach((source) => {
            if (!schema[source]) return

            const { value, error } = schema[source].validate(
                req[source] ?? {},
                {
                    abortEarly: false,
                    allowUnknown: false,
                    convert: true,
                    stripUnknown: false,
                }
            )

            if (error) {
                details.push(...toSafeDetails(source, error))
            } else {
                convertedValues[source] = value
            }
        })

        if (details.length > 0) {
            return next(
                new HttpError(
                    400,
                    "VALIDATION_ERROR",
                    "La solicitud no es válida",
                    details
                )
            )
        }

        Object.entries(convertedValues).forEach(([source, value]) => {
            req[source] = value
        })

        return next()
    }
}

module.exports = validateRequest
