// Constantes de los endpoints de solo lectura que consume el agente del chat
// (n8n). Los límites viven acá, en el servidor, para que el tamaño de la
// respuesta esté acotado aunque el modelo pida más de lo razonable.

// Partidos detallados por respuesta. El total siempre se informa completo.
const DEFAULT_PENDING_LIMIT = 10
const MAX_PENDING_LIMIT = 20

// Hay 5 o 6 jugadores en el sitio: más de 6 ids nunca es una consulta real.
const MAX_ASSISTANT_PLAYERS = 6

// Cruces "esperando rival" que se detallan; el resto solo se cuenta.
const MAX_AWAITING_OPPONENT_ITEMS = 5

// Últimos enfrentamientos detallados del cara a cara. El balance histórico
// siempre cuenta todos los partidos del par.
const DEFAULT_HEAD_TO_HEAD_LIMIT = 5
const MAX_HEAD_TO_HEAD_LIMIT = 10

// Últimos partidos de un jugador. El `limit` se recorta a este máximo en el
// servidor, y el resumen (récord, rating) se calcula sobre los partidos que
// se devuelven.
const DEFAULT_RECENT_MATCHES_LIMIT = 10
const MAX_RECENT_MATCHES_LIMIT = 20

const PENDING_SCOPES = ["involving", "among"]
const PENDING_STAGES = ["regular", "playin", "playoff"]

// Rutas del FE (src/routes/routesConfig.js) donde se ven los partidos de cada
// etapa. Si el FE cambia una ruta, se cambia acá y en el test que la fija.
const VIEW_PATH_BY_STAGE = {
    regular: (tournamentId) => `/tournaments/${tournamentId}/fixture`,
    playin: (tournamentId) => `/tournaments/${tournamentId}/playin`,
    playoff: (tournamentId) => `/tournaments/${tournamentId}/playoffs`,
}

// Salón de la Fama (campeones y subcampeones de todos los torneos terminados,
// incluidos los históricos). Ruta `HALL_OF_FAME` de `routesConfig.js` del FE.
const HALL_OF_FAME_VIEW_PATH = "/hall-of-fame"
const buildViewPath = (tournamentId, stage) => {
    const build = VIEW_PATH_BY_STAGE[stage]
    return build ? build(tournamentId) : `/tournaments/${tournamentId}`
}

// Tabla de posiciones de un torneo (pestaña Clasificación).
const buildStandingsViewPath = (tournamentId) =>
    `/tournaments/${tournamentId}/standings`

// El listado de partidos del FE (`/matches`) lee `player1`, `player2`, `type` y
// `tournamentId` de la URL: con los dos ids muestra los partidos jugados entre
// ellos, y con `type` y `tournamentId` los acota a una etapa o a un torneo.
const buildHeadToHeadViewPath = (
    playerAId,
    playerBId,
    { stage, tournamentId } = {}
) => {
    const params = [
        `player1=${encodeURIComponent(playerAId)}`,
        `player2=${encodeURIComponent(playerBId)}`,
    ]

    if (stage) params.push(`type=${encodeURIComponent(stage)}`)
    if (tournamentId)
        params.push(`tournamentId=${encodeURIComponent(tournamentId)}`)

    return `/matches?${params.join("&")}`
}

// Con un solo jugador (`player1`) el listado de partidos del FE muestra todos
// sus partidos jugados, contra cualquier rival (`MatchListing` no exige
// `player2`). `type` y `tournamentId` los acotan igual que en el cara a cara.
const buildPlayerMatchesViewPath = (playerId, { stage, tournamentId } = {}) => {
    const params = [`player1=${encodeURIComponent(playerId)}`]

    if (stage) params.push(`type=${encodeURIComponent(stage)}`)
    if (tournamentId)
        params.push(`tournamentId=${encodeURIComponent(tournamentId)}`)

    return `/matches?${params.join("&")}`
}

module.exports = {
    DEFAULT_HEAD_TO_HEAD_LIMIT,
    DEFAULT_PENDING_LIMIT,
    DEFAULT_RECENT_MATCHES_LIMIT,
    HALL_OF_FAME_VIEW_PATH,
    MAX_ASSISTANT_PLAYERS,
    MAX_AWAITING_OPPONENT_ITEMS,
    MAX_HEAD_TO_HEAD_LIMIT,
    MAX_PENDING_LIMIT,
    MAX_RECENT_MATCHES_LIMIT,
    PENDING_SCOPES,
    PENDING_STAGES,
    buildHeadToHeadViewPath,
    buildPlayerMatchesViewPath,
    buildStandingsViewPath,
    buildViewPath,
}
