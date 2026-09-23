/*
 * Valida `docs/openapi.yaml` contra las rutas realmente montadas.
 *
 * Dos verificaciones:
 *   1. El YAML parsea. Se usa Prettier, que ya es dependencia de desarrollo,
 *      así no hace falta agregar un parser nuevo al árbol de dependencias.
 *   2. Cada ruta montada está documentada y cada ruta documentada existe. Es la
 *      que evita que el contrato se desincronice del código, que fue justo lo
 *      que pasó con daily-recap y las rutas retiradas.
 */

const fs = require("node:fs")
const path = require("node:path")

const prettier = require("prettier")

const routers = require("../router/router")

const OPENAPI_PATH = path.join(__dirname, "..", "docs", "openapi.yaml")

// Prefijos de montaje declarados en app.js.
const ROUTER_PREFIXES = [
    ["root", "/api"],
    ["users", "/api/users"],
    ["tournaments", "/api/tournaments"],
    ["statistics", "/api/statistics"],
]

/*
 * Rutas definidas directamente en app.js, fuera de los routers. Si se agrega
 * una nueva ahí, hay que sumarla acá: el script no introspecciona app.js para
 * no depender de cómo Express arma los regexp de montaje.
 */
const APP_LEVEL_ROUTES = [
    { method: "get", path: "/health/live", documented: true },
    { method: "get", path: "/health/ready", documented: true },
    { method: "get", path: "/", documented: false },
]

const toOpenapiPath = (expressPath) =>
    expressPath
        .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
        .replace(/\/+$/, "")
        .replace(/^$/, "/")

const collectMountedRoutes = () => {
    const mounted = []

    for (const [routerName, prefix] of ROUTER_PREFIXES) {
        const router = routers[routerName]

        for (const layer of router.stack) {
            if (!layer.route) continue

            const routePath = toOpenapiPath(`${prefix}${layer.route.path}`)

            for (const [method, enabled] of Object.entries(
                layer.route.methods
            )) {
                if (!enabled || method === "_all") continue
                mounted.push(`${method.toUpperCase()} ${routePath}`)
            }
        }
    }

    for (const route of APP_LEVEL_ROUTES) {
        if (!route.documented) continue
        mounted.push(`${route.method.toUpperCase()} ${route.path}`)
    }

    return new Set(mounted)
}

/*
 * El archivo lo formatea Prettier y CI verifica el formato, así que la
 * indentación es estable: los paths están a 4 espacios y los métodos a 8.
 */
const collectDocumentedRoutes = (contents) => {
    const documented = []
    let currentPath = null

    for (const line of contents.split(/\r?\n/)) {
        const pathMatch = line.match(/^ {4}(\/\S*):\s*$/)
        if (pathMatch) {
            currentPath = pathMatch[1]
            continue
        }

        if (/^ {4}\S/.test(line)) currentPath = null

        const methodMatch = line.match(/^ {8}(get|post|put|patch|delete):\s*$/)
        if (methodMatch && currentPath) {
            documented.push(`${methodMatch[1].toUpperCase()} ${currentPath}`)
        }
    }

    return new Set(documented)
}

const run = async () => {
    const contents = fs.readFileSync(OPENAPI_PATH, "utf8")

    try {
        await prettier.format(contents, { filepath: OPENAPI_PATH })
    } catch (error) {
        console.error("openapi.yaml no parsea como YAML:")
        console.error(`  ${error.message.split("\n")[0]}`)
        process.exitCode = 1
        return
    }

    const documented = collectDocumentedRoutes(contents)
    const mounted = collectMountedRoutes()

    const undocumented = [...mounted].filter((route) => !documented.has(route))
    const orphaned = [...documented].filter((route) => !mounted.has(route))

    console.log(
        `rutas montadas: ${mounted.size}   documentadas: ${documented.size}`
    )

    if (undocumented.length) {
        console.error("\nMontadas y sin documentar:")
        undocumented.sort().forEach((route) => console.error(`  ${route}`))
    }

    if (orphaned.length) {
        console.error("\nDocumentadas y no montadas:")
        orphaned.sort().forEach((route) => console.error(`  ${route}`))
    }

    if (undocumented.length || orphaned.length) {
        console.error(
            "\nOpenAPI desincronizado del router. Actualizá docs/openapi.yaml."
        )
        process.exitCode = 1
        return
    }

    console.log("OpenAPI sincronizado con el router")
}

run().catch((error) => {
    console.error("la validación de OpenAPI falló:", error.message)
    process.exitCode = 1
})
