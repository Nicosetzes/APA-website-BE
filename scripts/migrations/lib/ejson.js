const { EJSON } = require("mongoose").mongo.BSON

/*
 * Canónico al escribir (relaxed: false): Date, ObjectId e int vs double
 * quedan explícitos y "1" nunca se confunde con 1. Al leer, los números
 * vuelven como number nativo, igual que los devuelve el driver.
 */
const serialize = (value, { relaxed = false, space = 4 } = {}) =>
    EJSON.stringify(value, undefined, space, { relaxed })

const deserialize = (text) => EJSON.parse(text, { relaxed: true })

// Conserva Int32/Double/Long como tipos BSON: para re-insertar documentos
// completos (rollback de deletes) con los mismos tipos que tenían.
const deserializeStrict = (text) => EJSON.parse(text, { relaxed: false })

// Clave estable para comparar valores BSON (sensible al orden de campos,
// como la igualdad de subdocumentos en Mongo).
const canonicalKey = (value) =>
    value === undefined
        ? "undefined"
        : EJSON.stringify(value, undefined, 0, { relaxed: false })

module.exports = { canonicalKey, deserialize, deserializeStrict, serialize }
