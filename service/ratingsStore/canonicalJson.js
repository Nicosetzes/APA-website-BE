// JSON canónico: misma entrada lógica, mismo string. Las claves de los objetos
// se ordenan; el orden de los arreglos sí cuenta. Sirve para hashear (fingerprint).
const isPlainObject = (value) => {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

const canonicalize = (value) => {
    if (value === null) return null
    switch (typeof value) {
        case "string":
        case "boolean":
            return value
        case "number":
            if (!Number.isFinite(value)) {
                throw new TypeError(
                    "canonicalize: número no finito (NaN o Infinity)"
                )
            }
            return value === 0 ? 0 : value
        case "object":
            break
        default:
            throw new TypeError(
                `canonicalize: tipo no soportado (${typeof value})`
            )
    }
    if (Array.isArray(value)) return value.map(canonicalize)
    if (value instanceof Date) return value.toISOString()
    if (!isPlainObject(value)) {
        throw new TypeError("canonicalize: objeto no soportado")
    }
    const result = {}
    for (const key of Object.keys(value).sort()) {
        if (value[key] !== undefined) result[key] = canonicalize(value[key])
    }
    return result
}

const canonicalStringify = (value) => JSON.stringify(canonicalize(value))

module.exports = { canonicalize, canonicalStringify }
