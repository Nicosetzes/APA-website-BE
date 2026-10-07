const path = require("node:path")

const { URI_ENV_PATTERN } = require("./args")
const { ToolError } = require("./errors")

const ENV_PATH = path.join(__dirname, "../../../.env")
const CLIENT_OPTIONS = Object.freeze({
    readPreference: "secondaryPreferred",
    retryWrites: false,
    serverSelectionTimeoutMS: 15000,
    appName: "apa-migrations",
})

// Los mensajes del driver incluyen host y a veces el URI: sólo name/code.
const sanitizeError = (error, stage) => {
    const sanitized = new ToolError(
        `${stage} falló: ${error?.name || "Error"}${
            error?.code !== undefined ? ` (código ${error.code})` : ""
        }`,
        "ConnectionError"
    )
    sanitized.code = error?.code
    return sanitized
}

/*
 * Única puerta a la base. El .env se carga acá adentro (nunca al requerir el
 * módulo) y el URI no sale de esta función.
 */
const connect = async ({ uriEnv }) => {
    if (!URI_ENV_PATTERN.test(String(uriEnv))) {
        throw new ToolError("nombre de variable inválido", "ConnectionError")
    }

    require("dotenv").config({ path: ENV_PATH })

    if (!process.env[uriEnv]) {
        throw new ToolError(`variable ${uriEnv} ausente`, "ConnectionError")
    }

    const { MongoClient } = require("mongoose").mongo
    let client

    try {
        client = new MongoClient(process.env[uriEnv], { ...CLIENT_OPTIONS })
        await client.connect()
    } catch (error) {
        if (client) await client.close().catch(() => {})
        throw sanitizeError(error, "conexión")
    }

    return {
        db: client.db(),
        close: async () => {
            try {
                await client.close()
            } catch (error) {
                throw sanitizeError(error, "cierre")
            }
        },
    }
}

module.exports = { CLIENT_OPTIONS, connect }
