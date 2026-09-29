// Traduce los errores de Joi a mensajes en castellano que el FE puede mostrar
// tal cual. Los mensajes nunca incluyen el valor recibido: sólo el nombre del
// campo y los límites o valores permitidos que define el propio schema.

// Reglas de negocio del resultado de un partido. Las usa el schema de
// `updateMatch` y también `validateMatchResult`, para que el mismo problema se
// explique igual venga de donde venga.
const MATCH_RULE_MESSAGES = {
    "match.seedsIncomplete":
        "Hay que enviar los seeds de ambos equipos o de ninguno",
    "match.penaltiesNotAllowed":
        "Un partido de fase regular no se define por penales",
    "match.penaltiesIncomplete": "Hay que cargar los penales de ambos equipos",
    "match.drawNeedsPenalties":
        "En eliminatoria no puede haber empate: cargá el resultado de los penales",
    "match.penaltiesTied": "Los penales no pueden terminar empatados",
}

// Etiqueta de cada campo, con artículo, y su género/número (m, f, mp, fp) para
// concordar los mensajes. Los índices de arrays se ignoran: `teams.0.group` se
// busca como `teams.group`.
const FIELD_LABELS = {
    // Identificadores de ruta
    tournament: ["el torneo", "m"],
    match: ["el partido", "m"],
    id: ["el identificador", "m"],

    // Resultado de un partido
    playerP1: ["el jugador 1", "m"],
    "playerP1.id": ["el id del jugador 1", "m"],
    "playerP1.name": ["el nombre del jugador 1", "m"],
    teamP1: ["el equipo 1", "m"],
    "teamP1.id": ["el id del equipo 1", "m"],
    "teamP1.name": ["el nombre del equipo 1", "m"],
    seedP1: ["el seed del equipo 1", "m"],
    scoreP1: ["los goles del equipo 1", "mp"],
    penaltyScoreP1: ["los penales del equipo 1", "mp"],
    playerP2: ["el jugador 2", "m"],
    "playerP2.id": ["el id del jugador 2", "m"],
    "playerP2.name": ["el nombre del jugador 2", "m"],
    teamP2: ["el equipo 2", "m"],
    "teamP2.id": ["el id del equipo 2", "m"],
    "teamP2.name": ["el nombre del equipo 2", "m"],
    seedP2: ["el seed del equipo 2", "m"],
    scoreP2: ["los goles del equipo 2", "mp"],
    penaltyScoreP2: ["los penales del equipo 2", "mp"],
    valid: ["la marca de partido válido", "f"],

    // Login
    email: ["el email", "m"],
    password: ["la contraseña", "f"],

    // Creación de torneos
    format: ["el formato", "m"],
    name: ["el nombre", "m"],
    cloudinary_id: ["la imagen del torneo", "f"],
    players: ["los jugadores", "mp"],
    "players.id": ["el id del jugador", "m"],
    "players.name": ["el nombre del jugador", "m"],
    teams: ["los equipos", "mp"],
    "teams.team": ["el equipo", "m"],
    "teams.team.id": ["el id del equipo", "m"],
    "teams.team.name": ["el nombre del equipo", "m"],
    "teams.player": ["el jugador asignado", "m"],
    "teams.player.id": ["el id del jugador asignado", "m"],
    "teams.player.name": ["el nombre del jugador asignado", "m"],
    "teams.group": ["el grupo", "m"],
    "teams.playoff_id": ["la posición en el playoff", "f"],
    group: ["el grupo", "m"],

    // Filtros y paginación
    page: ["la página", "f"],
    team: ["el equipo", "m"],
    teamName: ["el nombre del equipo", "m"],
    player: ["el jugador", "m"],
    player1: ["el jugador 1", "m"],
    player2: ["el jugador 2", "m"],
    tournamentId: ["el torneo", "m"],
    type: ["el tipo de partido", "m"],
    outcome: ["el resultado", "m"],
    goalDiffOp: ["el criterio de diferencia de gol", "m"],
    goalDiffVal: ["la diferencia de gol", "f"],
    dateFrom: ["la fecha desde", "f"],
    dateTo: ["la fecha hasta", "f"],
    played: ["el filtro de partidos jugados", "m"],
    matches: ["el parámetro matches", "m"],
    status: ["el estado", "m"],
    legacy: ["el parámetro legacy", "m"],
}

const MAX_ECHOED_KEY_LENGTH = 50

// Más allá de esto la lista de valores permitidos deja de ayudar en un toast.
const MAX_LISTED_VALIDS = 12

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1)

const resolveLabel = (path) => {
    const key = path.filter((segment) => typeof segment !== "number").join(".")

    if (!key) return ["la solicitud", "f"]

    return FIELD_LABELS[key] || [`el campo "${key}"`, "m"]
}

const formatValids = (valids = []) =>
    valids
        .filter((valid) => valid !== "" && valid !== null)
        .map((valid) => (typeof valid === "string" ? `"${valid}"` : valid))
        .join(", ")

const describeValidationError = (detail) => {
    if (MATCH_RULE_MESSAGES[detail.type])
        return MATCH_RULE_MESSAGES[detail.type]

    const context = detail.context || {}

    if (detail.type === "object.unknown" || detail.type === "any.unknown") {
        const key = String(context.key ?? detail.path.at(-1) ?? "")
        return `El campo "${key.slice(
            0,
            MAX_ECHOED_KEY_LENGTH
        )}" no está permitido`
    }

    const [label, gender] = resolveLabel(detail.path)
    const plural = gender.endsWith("p")
    const feminine = gender.startsWith("f")
    const pick = (singular, pluralForm) => (plural ? pluralForm : singular)
    const agree = (stem) => `${stem}${feminine ? "a" : "o"}${plural ? "s" : ""}`
    const subject = capitalize(label)
    const must = `${subject} ${pick("debe", "deben")}`
    const cannot = `${subject} no ${pick("puede", "pueden")}`

    switch (detail.type) {
        case "any.required":
            return `${pick("Falta", "Faltan")} ${label}`
        case "number.base":
            return `${must} ser un número`
        case "number.integer":
            return `${must} ser un número entero`
        case "number.min":
            return `${cannot} ser ${pick("menor", "menores")} a ${
                context.limit
            }`
        case "number.max":
            return `${cannot} ser ${pick("mayor", "mayores")} a ${
                context.limit
            }`
        case "string.base":
            return `${must} ser un texto`
        case "string.empty":
            return `${cannot} estar ${agree("vací")}`
        case "string.min":
            return `${must} tener al menos ${context.limit} caracteres`
        case "string.max":
            return `${must} tener como máximo ${context.limit} caracteres`
        case "string.pattern.base":
        case "string.email":
            return `${subject} no ${pick("tiene", "tienen")} un formato válido`
        case "date.format":
            return `${subject} no ${pick("es", "son")} una fecha real`
        case "any.only": {
            const valids = formatValids(context.valids)
            return valids && (context.valids || []).length <= MAX_LISTED_VALIDS
                ? `${must} ser uno de estos valores: ${valids}`
                : `${subject} no ${pick("es", "son")} ${agree("válid")}`
        }
        case "boolean.base":
            return `${must} ser verdadero o falso`
        case "object.base":
            return `${subject} no ${pick(
                "tiene",
                "tienen"
            )} el formato esperado`
        case "array.base":
            return `${must} ser una lista`
        case "array.min":
            return `${must} incluir al menos ${context.limit} ${
                context.limit === 1 ? "elemento" : "elementos"
            }`
        case "array.max":
            return `${must} incluir como máximo ${context.limit} ${
                context.limit === 1 ? "elemento" : "elementos"
            }`
        case "array.unique":
            return `${cannot} tener valores repetidos`
        default:
            return `${subject} no ${pick("es", "son")} ${agree("válid")}`
    }
}

// Mensaje general para el FE: los problemas concretos, sin repetir, con un tope
// para que entre en un toast.
const MAX_SUMMARY_MESSAGES = 3

const summarizeValidationErrors = (messages) => {
    const unique = [...new Set(messages)]

    if (unique.length === 0) return "La solicitud no es válida"

    const shown = unique.slice(0, MAX_SUMMARY_MESSAGES).join("; ")
    const hidden = unique.length - MAX_SUMMARY_MESSAGES

    return hidden > 0 ? `${shown} (y ${hidden} más)` : shown
}

module.exports = {
    FIELD_LABELS,
    MATCH_RULE_MESSAGES,
    describeValidationError,
    summarizeValidationErrors,
}
