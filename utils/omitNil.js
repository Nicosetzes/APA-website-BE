// Copia superficial del objeto sin las claves `null` o `undefined`. Las
// respuestas del asistente son compactas: un campo sin valor no se envía.
const omitNil = (entries) =>
    Object.fromEntries(
        Object.entries(entries).filter(
            ([, value]) => value !== null && value !== undefined
        )
    )

module.exports = { omitNil }
