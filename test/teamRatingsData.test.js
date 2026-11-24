const assert = require("node:assert/strict")
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const {
    ARTIFACT_PATH,
    buildArtifact,
    formatArtifact,
    parseCsv,
    readSources,
    validateSources,
} = require("../scripts/lib/teamRatingsData")
const {
    GAME_VERSIONS,
    createTeamStrengthLookup,
    defaultTeamStrength,
    listGameVersions,
    summarizeCoverage,
} = require("../service/playerRatings/teamStrength")

const TEAM_HEADER =
    "teamId,teamName,edition,matches,tournaments,overall,attack,midfield,defence,capturedAt"
const TOURNAMENT_ID = "64697ac9d542ff4ada3038d3"

const teamCsv = (...lines) => [TEAM_HEADER, ...lines].join("\n")
const validate = (teams) => validateSources({ teamRows: parseCsv(teams) })

const GOOD_TEAM = "157,Bayern Munich,FIFA 19,12,1,85,85,85,85,2019-09-11"

test("el JSON generado coincide con el CSV (si falla: npm run build:team-ratings)", () => {
    const expected = buildArtifact(readSources())
    const committed = require("../data/teamRatings.json")
    assert.deepEqual(
        committed,
        expected,
        "data/teamRatings.json está desactualizado respecto del CSV: correr `npm run build:team-ratings`"
    )
})

test("el JSON generado tiene el formato de Prettier", () => {
    const text = fs.readFileSync(ARTIFACT_PATH, "utf8")
    assert.equal(
        text.replace(/\r\n/g, "\n"),
        formatArtifact(JSON.parse(text)).replace(/\r\n/g, "\n")
    )
})

test("el JSON solo trae overall por equipo y edición (la edición de cada torneo está en la base)", () => {
    const data = require("../data/teamRatings.json")
    assert.deepEqual(Object.keys(data), ["overallByTeamEdition"])
})

test("el CSV real no tiene errores de validación", () => {
    const { errors } = validateSources(readSources())
    assert.deepEqual(errors, [])
})

test("el parser quita el BOM y acepta CRLF y LF", () => {
    const rows = parseCsv("\uFEFFa,b\r\n1,2\r\n3,4\r\n")
    assert.deepEqual(rows.headers, ["a", "b"])
    assert.deepEqual(
        rows.map((row) => ({ ...row })),
        [
            { a: "1", b: "2" },
            { a: "3", b: "4" },
        ]
    )
    assert.deepEqual(
        parseCsv("a,b\n1,2\n3,4").map((row) => ({ ...row })),
        rows.map((row) => ({ ...row }))
    )
    assert.equal(parseCsv("a,b\n1,2\n3,4")[1].line, 3)
})

test("el parser maneja comillas con comas, comillas escapadas y vacíos", () => {
    const rows = parseCsv(
        'name,note,empty\n"Real Madrid, CF","dijo ""hola""",\n"multi\nlinea",x,y\n'
    )
    assert.equal(rows[0].name, "Real Madrid, CF")
    assert.equal(rows[0].note, 'dijo "hola"')
    assert.equal(rows[0].empty, "")
    assert.equal(rows[1].name, "multi\nlinea")
    assert.equal(rows[1].empty, "y")
    assert.equal(rows.length, 2)
})

test("el parser rechaza filas con columnas de más o de menos y comillas sin cerrar", () => {
    assert.throws(() => parseCsv("a,b\n1,2,3"), /línea 2 tiene 3 columnas/)
    assert.throws(() => parseCsv("a,b\n1"), /línea 2 tiene 1 columnas/)
    assert.throws(() => parseCsv('a,b\n"1,2'), /comillas sin cerrar/)
})

test("buildArtifact ordena las claves y omite los overall vacíos", () => {
    const artifact = buildArtifact({
        teamRows: parseCsv(
            teamCsv(
                "9,Zeta,FIFA 19,1,1,70,70,70,70,2019-09-11",
                "157,Bayern Munich,FIFA 19,12,1,85,85,85,85,2019-09-11",
                "5,Vacio,FIFA 19,1,1,,,,,2019-09-11"
            )
        ),
    })
    assert.deepEqual(Object.keys(artifact), ["overallByTeamEdition"])
    assert.deepEqual(Object.keys(artifact.overallByTeamEdition), [
        "157|FIFA 19",
        "9|FIFA 19",
    ])
    assert.equal(artifact.overallByTeamEdition["157|FIFA 19"], 85)
})

test("el validador acepta datos correctos", () => {
    const { errors, warnings } = validate(teamCsv(GOOD_TEAM))
    assert.deepEqual(errors, [])
    assert.deepEqual(warnings, [])
})

test("el validador detecta duplicados, rangos, fechas y filas parciales", () => {
    const cases = [
        [
            [GOOD_TEAM, GOOD_TEAM],
            /duplicada con la línea 2/,
            "duplicado teamId|edition",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,100,85,85,85,2019-09-11"],
            /overall inválido/,
            "overall fuera de rango",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,39,85,85,85,2019-09-11"],
            /overall inválido/,
            "overall bajo el mínimo",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,85.5,85,85,85,2019-09-11"],
            /overall inválido/,
            "overall decimal",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,85,85,85,85,2019-02-30"],
            /capturedAt inválida/,
            "fecha inexistente",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,85,85,85,85,11/09/2019"],
            /capturedAt inválida/,
            "fecha con otro formato",
        ],
        [
            ["157,Bayern Munich,FIFA 19,12,1,85,85,,85,2019-09-11"],
            /falta midfield/,
            "fila parcial",
        ],
        [
            ["157,Bayern Munich,FIFA19,12,1,85,85,85,85,2019-09-11"],
            /edition con formato inesperado/,
            "edición mal escrita",
        ],
        [
            ["x,Bayern Munich,FIFA 19,12,1,85,85,85,85,2019-09-11"],
            /teamId inválido/,
            "teamId no entero",
        ],
    ]
    for (const [lines, pattern, label] of cases) {
        const { errors } = validate(teamCsv(...lines))
        assert.ok(
            errors.some((error) => pattern.test(error)),
            `${label}: ${JSON.stringify(errors)}`
        )
    }
})

test("una fila totalmente vacía es solo un aviso y no entra al artefacto", () => {
    const teams = teamCsv(GOOD_TEAM, "5,Sin datos,FIFA 19,1,1,,,,,2019-09-11")
    const { errors, warnings } = validate(teams)
    assert.deepEqual(errors, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /Sin datos/)
    assert.deepEqual(
        Object.keys(
            buildArtifact({ teamRows: parseCsv(teams) }).overallByTeamEdition
        ),
        ["157|FIFA 19"]
    )
})

test("el validador avisa si el overall se aleja del promedio de las líneas", () => {
    const { errors, warnings } = validate(
        teamCsv("157,Bayern Munich,FIFA 19,12,1,85,75,75,75,2019-09-11")
    )
    assert.deepEqual(errors, [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /lejos del promedio/)
})

test("el validador detecta encabezados distintos de los esperados", () => {
    const { errors } = validateSources({
        teamRows: parseCsv("teamId,teamName\n1,A"),
    })
    assert.ok(errors.some((error) => /encabezados inesperados/.test(error)))
})

const DATA = {
    overallByTeamEdition: { "157|FIFA 19": 85, "197|FIFA 19": 77 },
}
const lookup = createTeamStrengthLookup(DATA)
const matchOf = (extra = {}) => ({
    tournament: {
        id: TOURNAMENT_ID,
        name: "Chempions",
        gameVersion: "FIFA 19",
    },
    teamP1: { id: 157, name: "Bayern Munich" },
    teamP2: { id: 197, name: "PSV Eindhoven" },
    ...extra,
})

test("el lookup devuelve los overall de ambos equipos según tournament.gameVersion", () => {
    assert.deepEqual(lookup(matchOf()), { t1: 85, t2: 77 })
})

test("el lookup compara ids de equipo como string y recorta la edición", () => {
    assert.deepEqual(
        lookup(matchOf({ teamP1: { id: "157" }, teamP2: { id: "197" } })),
        { t1: 85, t2: 77 }
    )
    assert.deepEqual(
        lookup(
            matchOf({
                tournament: { id: TOURNAMENT_ID, gameVersion: " FIFA 19 " },
            })
        ),
        { t1: 85, t2: 77 }
    )
})

test("el lookup devuelve null si falta cualquier dato", () => {
    assert.equal(
        lookup(matchOf({ tournament: { id: TOURNAMENT_ID } })),
        null,
        "torneo sin edición"
    )
    assert.equal(
        lookup(
            matchOf({ tournament: { id: TOURNAMENT_ID, gameVersion: "FC 27" } })
        ),
        null,
        "edición sin overall de estos equipos"
    )
    assert.equal(
        lookup(matchOf({ tournament: { id: TOURNAMENT_ID, gameVersion: "" } })),
        null,
        "edición vacía"
    )
    assert.equal(
        lookup(matchOf({ tournament: { id: TOURNAMENT_ID, gameVersion: 19 } })),
        null,
        "edición que no es texto"
    )
    assert.equal(
        lookup(matchOf({ teamP2: { id: 999 } })),
        null,
        "equipo sin rating"
    )
    assert.equal(
        lookup(matchOf({ teamP1: { id: 999 } })),
        null,
        "equipo sin rating"
    )
    assert.equal(lookup(matchOf({ tournament: undefined })), null)
    assert.equal(lookup(matchOf({ tournament: {} })), null)
    assert.equal(lookup(matchOf({ teamP1: undefined })), null)
    assert.equal(lookup(matchOf({ teamP2: { name: "sin id" } })), null)
    assert.equal(lookup(matchOf({ teamP1: { id: null } })), null)
    assert.equal(lookup({}), null)
    assert.equal(lookup(undefined), null)
})

test("el lookup ignora overall que no son números finitos", () => {
    const strict = createTeamStrengthLookup({
        overallByTeamEdition: {
            "157|FIFA 19": "85",
            "197|FIFA 19": null,
            "1|FIFA 19": Number.NaN,
            "2|FIFA 19": 70,
        },
    })
    assert.equal(strict(matchOf()), null)
    assert.equal(
        strict(matchOf({ teamP1: { id: 2 }, teamP2: { id: 1 } })),
        null
    )
})

test("el lookup exige un objeto para armarse", () => {
    assert.throws(() => createTeamStrengthLookup(), /overallByTeamEdition/)
    assert.throws(
        () => createTeamStrengthLookup({ overallByTeamEdition: [] }),
        /overallByTeamEdition/
    )
})

test("listGameVersions ordena de la edición más nueva a la más vieja, sin repetir", () => {
    assert.deepEqual(
        listGameVersions({
            "1|FIFA 19": 80,
            "2|FC 27": 80,
            "3|FIFA 23": 80,
            "4|FC 27": 80,
            "5|FC 24": 80,
        }),
        ["FC 27", "FC 24", "FIFA 23", "FIFA 19"]
    )
})

test("GAME_VERSIONS sale del JSON real y arranca por la edición más nueva", () => {
    const data = require("../data/teamRatings.json")
    assert.deepEqual(GAME_VERSIONS, listGameVersions(data.overallByTeamEdition))
    assert.equal(GAME_VERSIONS[0], "FC 27")
    assert.ok(GAME_VERSIONS.includes("FIFA 19"))
    assert.ok(Object.isFrozen(GAME_VERSIONS))
})

test("summarizeCoverage cuenta partidos cubiertos y lista lo que falta", () => {
    const matches = [
        matchOf(),
        matchOf(),
        matchOf({ teamP2: { id: 999, name: "Nuevo FC" } }),
        matchOf({
            tournament: { id: "ffffffffffffffffffffffff", name: "Nuevo" },
        }),
        { teamP1: { id: 157 } },
    ]
    const coverage = summarizeCoverage(matches, DATA)
    assert.equal(coverage.total, 5)
    assert.equal(coverage.covered, 2)
    assert.deepEqual(coverage.tournamentsWithoutEdition, [
        {
            tournamentId: "ffffffffffffffffffffffff",
            name: "Nuevo",
            matches: 1,
        },
    ])
    assert.deepEqual(coverage.missingPairs, [
        { teamId: "999", teamName: "Nuevo FC", edition: "FIFA 19", matches: 1 },
    ])
})

test("el runtime carga el JSON con un require plano, sin fs ni variables de entorno", () => {
    const source = fs.readFileSync(
        path.join(
            __dirname,
            "..",
            "service",
            "playerRatings",
            "teamStrength.js"
        ),
        "utf8"
    )
    assert.ok(source.includes('require("../../data/teamRatings.json")'))
    assert.ok(!/require\(["'](node:)?fs["']\)/.test(source))
    assert.ok(!source.includes("process.env"))
    assert.ok(!source.includes("NODE_ENV"))
    assert.ok(!source.includes("VERCEL"))
})

test("el lookup por defecto resuelve un par real tomado del JSON", () => {
    const data = require("../data/teamRatings.json")
    const [key, overall] = Object.entries(data.overallByTeamEdition)[0]
    const [teamId, edition] = key.split("|")
    const result = defaultTeamStrength({
        tournament: { id: TOURNAMENT_ID, gameVersion: edition },
        teamP1: { id: Number(teamId) },
        teamP2: { id: String(teamId) },
    })
    assert.deepEqual(result, { t1: overall, t2: overall })
})

test("el lookup por defecto conoce los 25 equipos de FC 27", () => {
    const fc27 = [
        42, 529, 541, 50, 40, 530, 49, 33, 47, 66, 52, 34, 65, 746, 55, 531,
        543, 533, 45, 63, 51, 35, 548, 36, 538,
    ]
    for (const id of fc27) {
        const result = defaultTeamStrength({
            tournament: { id: TOURNAMENT_ID, gameVersion: "FC 27" },
            teamP1: { id },
            teamP2: { id: 42 },
        })
        assert.ok(result, `falta el overall FC 27 del equipo ${id}`)
    }
})

test("npm run check:team-ratings (offline) termina bien con los datos reales", () => {
    const output = execFileSync(
        process.execPath,
        [path.join(__dirname, "..", "scripts", "checkTeamRatings.js")],
        { encoding: "utf8" }
    )
    assert.match(output, /Errores \(0\)/)
    assert.match(output, /Datos de fuerza de equipo OK/)
})
