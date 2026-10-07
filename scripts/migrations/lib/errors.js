/*
 * Errores propios de la herramienta. Sus mensajes los arma el código de la
 * herramienta (nunca incluyen valores del entorno), por eso se pueden
 * imprimir. Cualquier otro error se describe sólo con name/code.
 */

class ToolError extends Error {
    constructor(message, name = "ToolError") {
        super(message)
        this.name = name
        this.expose = true
    }
}

const STACK_FRAME_LIMIT = 5

const describeError = (error) => {
    if (error && error.expose) return `${error.name}: ${error.message}`

    const name = (error && error.name) || "Error"
    const code =
        error && error.code !== undefined ? ` (código ${error.code})` : ""
    const lines = [`${name}${code}`]

    // Sólo frames (archivo:línea), nunca la primera línea del stack, que
    // contiene el mensaje. Los errores del driver se omiten: sus mensajes y
    // frames no aportan y pueden traer el host.
    if (!String(name).startsWith("Mongo") && typeof error?.stack === "string") {
        error.stack
            .split("\n")
            .slice(1)
            .map((line) => line.trim())
            .filter((line) => line.startsWith("at "))
            .slice(0, STACK_FRAME_LIMIT)
            .forEach((line) => lines.push(`    ${line}`))
    }

    return lines.join("\n")
}

module.exports = { ToolError, describeError }
