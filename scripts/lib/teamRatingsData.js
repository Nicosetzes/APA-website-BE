// Datos de fuerza de equipo para el APA Rating 2.0 (solo tooling).
//
// Fuente de verdad: `data/team-ratings.csv` y `data/tournament-editions.csv`.
// De ahí sale `data/teamRatings.json`, el artefacto que carga el runtime con un
// `require` plano (ver `service/playerRatings/teamStrength.js`). Este módulo lee
// los CSV con `fs`, por eso lo usan los scripts y los tests pero nunca el runtime.

const fs = require("fs")
const path = require("path")
const prettier = require("prettier")

const DATA_DIR = path.join(__dirname, "..", "..", "data")
const TEAM_RATINGS_CSV = path.join(DATA_DIR, "team-ratings.csv")
const TOURNAMENT_EDITIONS_CSV = path.join(DATA_DIR, "tournament-editions.csv")
const ARTIFACT_PATH = path.join(DATA_DIR, "teamRatings.json")

const TEAM_HEADERS = [
    "teamId",
    "teamName",
    "edition",
    "matches",
    "tournaments",
    "overall",
    "attack",
    "midfield",
    "defence",
    "capturedAt",
]
const TOURNAMENT_HEADERS = [
    "tournamentId",
    "tournamentName",
    "format",
    "startedAt",
    "firstMatchAt",
    "lastMatchAt",
    "matches",
    "inexactDates",
    "edition",
]
const STAT_COLUMNS = ["overall", "attack", "midfield", "defence"]
const MIN_STAT = 40
const MAX_STAT = 99
// Diferencia entre el overall y el promedio de las tres líneas a partir de la
// cual se avisa (probable error de tipeo en alguna de las cuatro columnas).
const OVERALL_TOLERANCE = 4

// Parser CSV: quita el BOM, acepta CRLF y LF, campos entre comillas con comas,
// saltos de línea y comillas escapadas (`""`). Devuelve una fila por línea como
// objeto { header: valor }; `line` (no enumerable) es la línea del archivo y
// `rows.headers` (no enumerable) los encabezados. Las líneas en blanco se saltean.
const parseCsv = (text) => {
    const source = String(text).replace(/^\uFEFF/, "")
    const records = []
    let record = []
    let field = ""
    let inQuotes = false
    let line = 1
    let recordLine = 1
    let touched = false

    const endField = () => {
        record.push(field)
        field = ""
    }
    const endRecord = () => {
        endField()
        const blank = record.length === 1 && record[0] === "" && !touched
        if (!blank) records.push({ line: recordLine, cells: record })
        record = []
        touched = false
    }

    for (let i = 0; i < source.length; i += 1) {
        const char = source[i]

        if (inQuotes) {
            if (char === '"') {
                if (source[i + 1] === '"') {
                    field += '"'
                    i += 1
                } else {
                    inQuotes = false
                }
            } else {
                if (char === "\n") line += 1
                field += char
            }
            continue
        }

        if (char === '"' && field === "") {
            inQuotes = true
            touched = true
        } else if (char === ",") {
            touched = true
            endField()
        } else if (char === "\r" || char === "\n") {
            if (char === "\r" && source[i + 1] === "\n") i += 1
            endRecord()
            line += 1
            recordLine = line
        } else {
            touched = true
            field += char
        }
    }
    if (inQuotes) throw new Error(`CSV: comillas sin cerrar (línea ${line})`)
    if (field !== "" || record.length > 0 || touched) endRecord()

    if (!records.length) {
        const empty = []
        Object.defineProperty(empty, "headers", { value: [] })
        return empty
    }

    const [{ cells: headers }, ...body] = records
    const rows = body.map(({ line: rowLine, cells }) => {
        if (cells.length !== headers.length) {
            throw new Error(
                `CSV: la línea ${rowLine} tiene ${cells.length} columnas en vez de ${headers.length}`
            )
        }
        const row = Object.fromEntries(
            headers.map((name, index) => [name, cells[index]])
        )
        Object.defineProperty(row, "line", { value: rowLine })
        return row
    })
    Object.defineProperty(rows, "headers", { value: headers })
    return rows
}

const readSources = (
    paths = {
        teams: TEAM_RATINGS_CSV,
        tournaments: TOURNAMENT_EDITIONS_CSV,
    }
) => ({
    teamRows: parseCsv(fs.readFileSync(paths.teams, "utf8")),
    tournamentRows: parseCsv(fs.readFileSync(paths.tournaments, "utf8")),
})

const isRealDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

const isStat = (value) =>
    /^\d{2}$/.test(value) &&
    Number(value) >= MIN_STAT &&
    Number(value) <= MAX_STAT

const sameHeaders = (rows, expected) =>
    rows.headers === undefined ||
    (rows.headers.length === expected.length &&
        expected.every((name, index) => rows.headers[index] === name))

// Una fila de equipo está "vacía" si no tiene ninguna de las cuatro
// estadísticas: se avisa y no entra al artefacto (esos partidos usan la 1.0).
const isEmptyTeamRow = (row) => STAT_COLUMNS.every((name) => row[name] === "")

// Valida los dos CSV. `errors` impiden generar el artefacto; `warnings` solo
// avisan (datos que parecen raros pero son posibles).
const validateSources = ({ teamRows, tournamentRows }) => {
    const errors = []
    const warnings = []

    if (!sameHeaders(teamRows, TEAM_HEADERS)) {
        errors.push(
            `team-ratings.csv: encabezados inesperados, se esperaba ${TEAM_HEADERS.join(
                ","
            )}`
        )
    }
    if (!sameHeaders(tournamentRows, TOURNAMENT_HEADERS)) {
        errors.push(
            `tournament-editions.csv: encabezados inesperados, se esperaba ${TOURNAMENT_HEADERS.join(
                ","
            )}`
        )
    }
    if (errors.length) return { errors, warnings }

    const teamEditions = new Set()
    const seen = new Map()
    for (const row of teamRows) {
        const label = `team-ratings.csv l.${row.line} (${row.teamName}, ${row.edition})`
        const error = (message) => errors.push(`${label}: ${message}`)
        const warning = (message) => warnings.push(`${label}: ${message}`)

        if (!/^\d+$/.test(row.teamId)) error(`teamId inválido: "${row.teamId}"`)
        if (!row.teamName.trim()) error("teamName vacío")
        if (!/^(FIFA|FC) \d{2}$/.test(row.edition)) {
            error(`edition con formato inesperado: "${row.edition}"`)
        }
        for (const name of ["matches", "tournaments"]) {
            if (row[name] !== "" && !/^\d+$/.test(row[name])) {
                error(`${name} no es un entero: "${row[name]}"`)
            }
        }

        const key = `${row.teamId}|${row.edition}`
        if (seen.has(key)) {
            error(`duplicada con la línea ${seen.get(key)} (${key})`)
        } else {
            seen.set(key, row.line)
        }

        if (!isRealDate(row.capturedAt)) {
            error(`capturedAt inválida: "${row.capturedAt}"`)
        }

        if (isEmptyTeamRow(row)) {
            warning(
                "sin overall/attack/midfield/defence: no se usa (los partidos se calculan como en 1.0)"
            )
            continue
        }

        let complete = true
        for (const name of STAT_COLUMNS) {
            if (row[name] === "") {
                error(`falta ${name} (hay otras estadísticas cargadas)`)
                complete = false
            } else if (!isStat(row[name])) {
                error(
                    `${name} inválido: "${row[name]}" (entero de 2 dígitos entre ${MIN_STAT} y ${MAX_STAT})`
                )
                complete = false
            }
        }
        if (!complete) continue

        teamEditions.add(row.edition)
        const mean =
            (Number(row.attack) + Number(row.midfield) + Number(row.defence)) /
            3
        if (Math.abs(Number(row.overall) - mean) > OVERALL_TOLERANCE) {
            warning(
                `overall ${
                    row.overall
                } lejos del promedio de ataque/medio/defensa (${mean.toFixed(
                    1
                )})`
            )
        }
    }

    const tournamentIds = new Set()
    const tournamentEditions = new Set()
    for (const row of tournamentRows) {
        const label = `tournament-editions.csv l.${row.line} (${row.tournamentName})`
        const error = (message) => errors.push(`${label}: ${message}`)

        if (!/^[0-9a-f]{24}$/i.test(row.tournamentId)) {
            error(`tournamentId inválido: "${row.tournamentId}"`)
        } else if (tournamentIds.has(row.tournamentId)) {
            error(`tournamentId duplicado: ${row.tournamentId}`)
        }
        tournamentIds.add(row.tournamentId)

        if (!row.edition) {
            error("sin edición")
        } else if (!teamEditions.has(row.edition)) {
            error(
                `la edición "${row.edition}" no tiene equipos con rating en team-ratings.csv`
            )
        } else {
            tournamentEditions.add(row.edition)
        }
    }

    for (const edition of teamEditions) {
        if (!tournamentEditions.has(edition)) {
            warnings.push(
                `la edición "${edition}" tiene equipos pero ningún torneo la usa`
            )
        }
    }

    return { errors, warnings }
}

const byKey = ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)

// Artefacto que consume el runtime. Claves ordenadas y sin fechas para que
// regenerarlo sin cambios en los CSV dé exactamente el mismo contenido.
const buildArtifact = ({ teamRows, tournamentRows }) => {
    const editionByTournament = tournamentRows
        .filter((row) => row.edition)
        .map((row) => [row.tournamentId, row.edition])
    const overallByTeamEdition = teamRows
        .filter((row) => row.overall !== "")
        .map((row) => [`${row.teamId}|${row.edition}`, Number(row.overall)])

    return {
        editionByTournament: Object.fromEntries(
            editionByTournament.sort(byKey)
        ),
        overallByTeamEdition: Object.fromEntries(
            overallByTeamEdition.sort(byKey)
        ),
    }
}

// Texto del JSON con el formato de Prettier del repo, así `format:check` lo acepta.
const formatArtifact = (artifact) => {
    const config = prettier.resolveConfig.sync(ARTIFACT_PATH) ?? {}
    return prettier.format(JSON.stringify(artifact), {
        ...config,
        parser: "json",
    })
}

module.exports = {
    ARTIFACT_PATH,
    DATA_DIR,
    OVERALL_TOLERANCE,
    STAT_COLUMNS,
    TEAM_HEADERS,
    TEAM_RATINGS_CSV,
    TOURNAMENT_EDITIONS_CSV,
    TOURNAMENT_HEADERS,
    buildArtifact,
    formatArtifact,
    parseCsv,
    readSources,
    validateSources,
}
