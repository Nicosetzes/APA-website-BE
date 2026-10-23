"use strict"
process.env.LOG_LEVEL = "silent"
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")
const { root, statistics, tournaments, users } = require("../router/router")

const ROOT = path.join(__dirname, "..")

// Inventario de las rutas que escriben (no-GET) y si cambian datos rateados.
// Una ruta de escritura nueva en el router FALLA este test hasta que se la
// clasifique acá: obliga a decidir si necesita actualizar los ratings.
//
//  - "rated": cambia el conjunto o los valores de los partidos rateados; llama
//    al hook de service/syncRatingsAfterWrite (ver `RATED_CONTROLLERS`).
//  - "not_rated:<motivo>": no toca partidos jugados; NO llama al hook.
const WRITE_ROUTES = {
    "PUT /api/tournaments/:tournament/matches/update-game/:match": "rated",
    "PUT /api/tournaments/:tournament/matches/delete-game/:match": "rated",
    "PUT /api/tournaments/:tournament/complete": "not_rated:tournament_only",
    "POST /api/tournaments/:tournament/fixture": "not_rated:unplayed_matches",
    "POST /api/tournaments/:tournament/playin": "not_rated:unplayed_matches",
    "POST /api/tournaments/:tournament/playoff": "not_rated:unplayed_matches",
    "POST /api/tournaments": "not_rated:unplayed_matches",
    "POST /api/edits": "not_rated:edits_collection",
    "DELETE /api/edits/:id": "not_rated:edits_collection",
    "POST /api/recaps": "not_rated:recaps_collection",
    "POST /api/tournament-recaps": "not_rated:tournament_recaps_collection",
    "POST /api/users/login": "not_rated:no_write",
}

// Controllers de las rutas "rated" y el disparador que usan.
const RATED_CONTROLLERS = {
    "PUT /api/tournaments/:tournament/matches/update-game/:match": {
        file: "controller/putMatchByTournamentId/index.js",
        trigger: "match_result_saved",
    },
    "PUT /api/tournaments/:tournament/matches/delete-game/:match": {
        file: "controller/putRemoveMatchByTournamentId/index.js",
        trigger: "match_result_removed",
    },
}

const MOUNTS = [
    ["/api", root],
    ["/api/users", users],
    ["/api/tournaments", tournaments],
    ["/api/statistics", statistics],
]

const enumerateWriteRoutes = () => {
    const found = []
    for (const [prefix, router] of MOUNTS) {
        for (const layer of router.stack) {
            if (!layer.route) continue
            const routePath = `${prefix}${layer.route.path}`.replace(/\/$/, "")
            for (const [method, enabled] of Object.entries(
                layer.route.methods
            )) {
                if (enabled && method !== "get" && method !== "head") {
                    found.push(`${method.toUpperCase()} ${routePath}`)
                }
            }
        }
    }
    return found
}

test("toda ruta de escritura del router está clasificada, y no sobran clasificaciones", () => {
    const found = enumerateWriteRoutes().sort()
    assert.deepEqual(found, Object.keys(WRITE_ROUTES).sort())
    assert.equal(found.length, 12)
})

test("las rutas rated llaman al hook con su disparador; las demás no lo mencionan", () => {
    const controllerDir = path.join(ROOT, "controller")
    const ratedFiles = new Set(
        Object.values(RATED_CONTROLLERS).map(({ file }) => file)
    )
    for (const [route, kind] of Object.entries(WRITE_ROUTES)) {
        assert.ok(
            kind === "rated" || /^not_rated:[a-z_]+$/.test(kind),
            `${route}: clasificación inválida`
        )
    }
    for (const [route, { file, trigger }] of Object.entries(
        RATED_CONTROLLERS
    )) {
        assert.equal(WRITE_ROUTES[route], "rated", route)
        const source = fs.readFileSync(path.join(ROOT, file), "utf8")
        assert.ok(source.includes("dependencies.syncRatings"), file)
        assert.ok(source.includes(`"${trigger}"`), file)
        assert.ok(source.includes("triggerRatingSync"), file)
    }
    // Ningún otro controller llama al hook: lo no rateado no paga el costo.
    for (const entry of fs.readdirSync(controllerDir)) {
        const file = `controller/${entry}/index.js`
        if (!fs.existsSync(path.join(ROOT, file)) || ratedFiles.has(file)) {
            continue
        }
        const source = fs.readFileSync(path.join(ROOT, file), "utf8")
        assert.ok(!source.includes("syncRatingsAfterWrite"), file)
        assert.ok(!source.includes("triggerRatingSync"), file)
    }
})
