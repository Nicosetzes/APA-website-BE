// Definición única del índice que identifica cada partido físico dentro de una
// llave administrada. Es un módulo puro compartido por el schema, el gate de
// escrituras y el comando operacional de creación del índice.
const PLAYOFF_LEG_INDEX_NAME = "uniq_playoff_tournament_tie_leg_v1"
const PLAYOFF_LEG_INDEX_KEY = {
    "tournament.id": 1,
    playoff_id: 1,
    leg: 1,
}
const PLAYOFF_LEG_INDEX_FILTER = {
    type: "playoff",
    leg: { $type: "number" },
    playoff_id: { $type: "number" },
    "tournament.id": { $type: "string" },
}

const hasPlayoffLegIndexDefinition = (index) =>
    index?.name === PLAYOFF_LEG_INDEX_NAME &&
    JSON.stringify(index.key) === JSON.stringify(PLAYOFF_LEG_INDEX_KEY) &&
    index.unique === true &&
    JSON.stringify(index.partialFilterExpression) ===
        JSON.stringify(PLAYOFF_LEG_INDEX_FILTER)

module.exports = {
    PLAYOFF_LEG_INDEX_FILTER,
    PLAYOFF_LEG_INDEX_KEY,
    PLAYOFF_LEG_INDEX_NAME,
    hasPlayoffLegIndexDefinition,
}
