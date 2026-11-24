/*
 * Registro ordenado de migraciones (el orden es el de apply, D9). Contrato de
 * cada módulo:
 *   { id, title, dependsOn: [], collections: [...], plan(snapshot, context) }
 * plan() es puro y devuelve { ops, report }. Las ops pueden ser $set/$unset,
 * `delete` o `insert` (ver lib/memory.js).
 *
 * Las migraciones ya aplicadas y verificadas en producción se borran del
 * repo; quedan en el historial de git y en la colección `migrations`:
 *   001-m2-played-at, 002-m7-point-fixes, 003-m3-tournament-dates,
 *   004-m4-types y 005-m8-delete-cancelled-unplayed (commit 7444953);
 *   006-torneo-argentino-2021 (commit 3b57c93).
 * Para deshacer una, alcanza con su before-file: `run.js --rollback <archivo>`.
 * La próxima migración nueva es la 008 (no reutilizar ids ya registrados).
 */
module.exports = [require("./007-tournament-game-version")]
