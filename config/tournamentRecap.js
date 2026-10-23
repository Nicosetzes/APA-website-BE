// Parámetros del recap de torneo (`/api/tournament-recaps/*`).
//
// Los umbrales son valores iniciales que se calibran con torneos reales de PROD
// (ver `.agents/tasks/tournament-recap-verification.md`). Están acá, y no
// dentro de los builders, para poder ajustarlos sin tocar la lógica.

// Se publica en cada contexto y se guarda en `generation.contextVersion`. Subirla
// cuando cambie la forma del contexto.
const CONTEXT_VERSION = "tournament-recap-3"

// `pending`
const DEFAULT_PENDING_WINDOW_DAYS = 7
const DEFAULT_PENDING_LIMIT = 3
const MAX_PENDING_LIMIT = 20

// Torneos viejos que el listado `backlog` de `pending` no ofrece para el
// backfill (clave: id del torneo; el nombre va de comentario). No afecta a la
// ventana diaria (`data`) ni al contexto: con un `tournamentId` explícito el
// recap de estos torneos se puede generar igual.
const BACKFILL_EXCLUDED_TOURNAMENTS = {
    // Chempions 2019/20 (champions_league): se deja afuera por decisión del
    // usuario (los torneos viejos del backfill se eligen a mano)
    "64697ac9d542ff4ada3038d3": "Chempions 2019/20",
}

// Hechos (`facts`)
// Un partido ganado con un puntaje esperado menor a esto es una sorpresa.
const UPSET_WINNER_EXPECTED_MAX = 0.3
// Diferencia de goles desde la cual una victoria es goleada.
const BIG_WIN_MARGIN = 4
const LONG_WIN_STREAK_MIN = 5
const LONG_UNBEATEN_MIN = 8
const LONG_LOSING_STREAK_MIN = 4
const LEADER_CHANGES_MIN = 2
// Puntos reales por encima (o por debajo) de los esperados para avisar.
const STANDINGS_OVERPERFORMANCE_MIN_POINTS = 4
// Diferencia de overall entre el equipo del campeón y el promedio del torneo
// desde la cual el recorrido se considera "Cenicienta".
const CINDERELLA_OVERALL_GAP = 5
// Porcentaje final de partidos de grupo que cuenta como "últimas fechas".
const TITLE_RACE_LAST_PCT = 10
const FACTS_MAX = 30
// Mínimo de arcos en cero para destacar a quien más dejó.
const CLEAN_SHEETS_LEADER_MIN = 5
// Cambio de Elo del torneo (en puntos) desde el cual se destaca a quien más
// ganó o perdió.
const RATING_MOVE_MIN_DELTA = 10
// Partidos mínimos de un equipo en la tabla para opinar de su ataque o defensa.
const TEAM_STATS_MIN_MATCHES = 10
// Partidos con predicción (rateados) mínimos de un jugador para informar su
// rendimiento contra lo esperado en porcentaje (`performanceVsExpectedPct`):
// con menos, el cociente es puro azar y se informa `null`.
const PERFORMANCE_MIN_RATED_MATCHES = 3

// Tamaño del contexto
const COMPACT_REGULAR_MATCH_LIMIT = 15
const CONTEXT_COMPACT_MAX_CHARS = 70000
const LOW_MATCH_COUNT_WARNING = 10

// Hitos de avance de la tabla (porcentaje de partidos del grupo).
const STANDINGS_PROGRESS_MARKS = [25, 50, 75, 100]

// Importancia base de un partido por fase/ronda.
const BASE_IMPORTANCE = {
    regular: 1,
    playin: 3,
    round_of_32: 3,
    round_of_16: 3,
    quarterfinal: 3,
    semifinal: 4,
    final: 5,
}

// Secciones `##` que debe tener el Markdown. Cada elemento es una lista de
// alternativas: alcanza con que esté una; la primera es el título canónico (el
// que muestran los mensajes de error). "En la historia" es el nombre anterior
// de "Salón de la fama" y se sigue aceptando. Opcionales (se piden en el prompt
// pero no se exigen): "Cómo se jugó", "Partidos destacados", "Números del
// torneo", "El Elo del torneo".
const REQUIRED_RECAP_SECTIONS = {
    always: [["El campeón"], ["Salón de la fama", "En la historia"]],
    regular: ["Fase regular", "Fase de grupos"],
    playin: ["Play-in"],
    playoff: ["Playoffs"],
}

// ---------------------------------------------------------------------------
// Familia de competencia
// ---------------------------------------------------------------------------
// La familia ("su 4ª Superliga") sale del FORMATO del torneo, no de su nombre.
const COMPETITION_FAMILIES = {
    league: { key: "league", label: "Liga" },
    league_playin_playoff: {
        key: "league_playin_playoff",
        label: "Superliga",
    },
    // Eliminatoria pura (partido único o ida y vuelta): Copa Argentina, Copa
    // Afinidades... (Copa América tiene su propio formato, `american_cup`).
    playoff: { key: "playoff", label: "Eliminatoria" },
    world_cup: { key: "world_cup", label: "Mundial" },
    world_cup_2026: { key: "world_cup", label: "Mundial" },
    champions_league: { key: "champions_league", label: "Champions" },
    super_cup: { key: "super_cup", label: "Supercopa" },
    // Formatos legacy: hoy solo existen en torneos legacy de PROD (no se
    // pueden crear), pero están en el enum del modelo y son familias de pleno
    // derecho para el recap.
    american_cup: { key: "american_cup", label: "Copa América" },
    club_world_cup: { key: "club_world_cup", label: "Mundial de Clubes" },
}

const hasOwn = (object, key) =>
    Object.prototype.hasOwnProperty.call(object, key)

// Familia de un torneo según su `format`. `known: false` marca un formato
// ausente o que no figura en el mapa: la clave y la etiqueta se arman a partir
// del texto del formato y los llamadores lo advierten.
const getCompetition = ({ format } = {}) => {
    if (typeof format === "string" && hasOwn(COMPETITION_FAMILIES, format)) {
        const { key, label } = COMPETITION_FAMILIES[format]

        return { key, label, known: true }
    }

    const text = typeof format === "string" ? format.trim() : ""

    if (!text) {
        return {
            key: "unknown",
            label: "Torneo de formato desconocido",
            known: false,
        }
    }

    return {
        key: text,
        label: `Torneo de formato ${text.replace(/_/g, " ")}`,
        known: false,
    }
}

const normalizeText = (value) =>
    String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()

// ---------------------------------------------------------------------------
// Contrato del Markdown
// ---------------------------------------------------------------------------
// Lista de alternativas por sección requerida, según las etapas del formato.
const getRequiredRecapSections = (rules = {}) => {
    const stages = rules?.stages ?? []
    const sections = [...REQUIRED_RECAP_SECTIONS.always]
    const staged = []

    if (stages.includes("regular")) staged.push(REQUIRED_RECAP_SECTIONS.regular)
    if (stages.includes("playin")) staged.push(REQUIRED_RECAP_SECTIONS.playin)
    if (stages.includes("playoff")) staged.push(REQUIRED_RECAP_SECTIONS.playoff)

    // El campeón primero, la historia última; las etapas en el medio.
    return [sections[0], ...staged, sections[1]]
}

const extractHeadings = (recap) =>
    String(recap ?? "")
        .split(/\r?\n/)
        .map((line) => /^##(?!#)\s*(.+?)\s*#*\s*$/.exec(line))
        .filter(Boolean)
        .map((match) => normalizeText(match[1]))

// Revisa lo mínimo que un recap sano debe cumplir: las secciones `##` del
// formato y los nombres del campeón y el subcampeón (jugador y equipo). Es una
// defensa contra respuestas vacías o cortadas del modelo, no contra errores de
// hechos. Cada entrada de `result` puede traer `aliases` (nombres alternativos
// aceptados, por ejemplo el nombre guardado además del apodo).
const checkRecapCoherence = ({ recap, result, rules }) => {
    const headings = extractHeadings(recap)
    const text = normalizeText(recap)
    const missingSections = getRequiredRecapSections(rules)
        .filter(
            (alternatives) =>
                !alternatives.some((title) =>
                    headings.some((heading) =>
                        heading.startsWith(normalizeText(title))
                    )
                )
        )
        .map((alternatives) => alternatives.join(" / "))

    const entries = [
        ["campeón (jugador)", result?.champion?.player],
        ["campeón (equipo)", result?.champion?.team],
        ["subcampeón (jugador)", result?.runnerUp?.player],
        ["subcampeón (equipo)", result?.runnerUp?.team],
    ]
    const seen = new Set()
    const missingNames = []

    for (const [label, entry] of entries) {
        const candidates = [entry?.name, ...(entry?.aliases ?? [])]
            .filter(Boolean)
            .map(normalizeText)

        if (candidates.length === 0) continue

        // El mismo jugador puede ser campeón y subcampeón: se chequea una vez.
        const key = candidates[0]
        if (seen.has(key)) continue
        seen.add(key)

        if (!candidates.some((candidate) => text.includes(candidate))) {
            missingNames.push(`${label}: ${entry.name}`)
        }
    }

    return {
        ok: missingSections.length === 0 && missingNames.length === 0,
        missingSections,
        missingNames,
    }
}

module.exports = {
    BACKFILL_EXCLUDED_TOURNAMENTS,
    BASE_IMPORTANCE,
    BIG_WIN_MARGIN,
    CINDERELLA_OVERALL_GAP,
    CLEAN_SHEETS_LEADER_MIN,
    COMPACT_REGULAR_MATCH_LIMIT,
    COMPETITION_FAMILIES,
    CONTEXT_COMPACT_MAX_CHARS,
    CONTEXT_VERSION,
    DEFAULT_PENDING_LIMIT,
    DEFAULT_PENDING_WINDOW_DAYS,
    FACTS_MAX,
    LEADER_CHANGES_MIN,
    LONG_LOSING_STREAK_MIN,
    LONG_UNBEATEN_MIN,
    LONG_WIN_STREAK_MIN,
    LOW_MATCH_COUNT_WARNING,
    MAX_PENDING_LIMIT,
    PERFORMANCE_MIN_RATED_MATCHES,
    RATING_MOVE_MIN_DELTA,
    REQUIRED_RECAP_SECTIONS,
    STANDINGS_OVERPERFORMANCE_MIN_POINTS,
    STANDINGS_PROGRESS_MARKS,
    TEAM_STATS_MIN_MATCHES,
    TITLE_RACE_LAST_PCT,
    UPSET_WINNER_EXPECTED_MAX,
    checkRecapCoherence,
    getCompetition,
    getRequiredRecapSections,
    normalizeText,
}
