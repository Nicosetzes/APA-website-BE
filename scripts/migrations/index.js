/*
 * Registro ordenado de migraciones (el orden es el de apply, D9). Contrato de
 * cada módulo:
 *   { id, title, dependsOn: [], collections: [...], plan(snapshot, context) }
 * plan() es puro y devuelve { ops, report }. Ver scripts/migrations/README.md.
 */

module.exports = [
    require("./001-m2-played-at"),
    require("./002-m7-point-fixes"),
    require("./003-m3-tournament-dates"),
    require("./004-m4-types"),
    // Destructiva e independiente de las anteriores: va última.
    require("./005-m8-delete-cancelled-unplayed"),
]
