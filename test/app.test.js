process.env.LOG_LEVEL = "silent"

const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")
const { LOGIN_RATE_LIMIT_MAX_ATTEMPTS } = require("../middleware/rateLimits")

const withServer = async (app, callback) => {
    const server = app.listen(0)
    await once(server, "listening")

    try {
        const address = server.address()
        await callback(`http://127.0.0.1:${address.port}`)
    } finally {
        server.close()
        await once(server, "close")
    }
}

test("health endpoints report process and database state", async () => {
    let databaseState = "disconnected"
    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: databaseState }),
    })

    await withServer(app, async (baseUrl) => {
        const liveResponse = await globalThis.fetch(`${baseUrl}/health/live`)
        assert.equal(liveResponse.status, 200)
        assert.deepEqual(await liveResponse.json(), { status: "ok" })
        assert.equal(
            liveResponse.headers.get("x-content-type-options"),
            "nosniff"
        )
        assert.equal(liveResponse.headers.get("x-frame-options"), "SAMEORIGIN")

        const notReadyResponse = await globalThis.fetch(
            `${baseUrl}/health/ready`
        )
        assert.equal(notReadyResponse.status, 503)
        assert.equal(
            (await notReadyResponse.json()).checks.mongodb,
            "disconnected"
        )

        databaseState = "connected"
        const readyResponse = await globalThis.fetch(`${baseUrl}/health/ready`)
        assert.equal(readyResponse.status, 200)
        assert.equal((await readyResponse.json()).status, "ready")
    })
})

test("readiness can establish a missing database connection", async () => {
    let databaseState = "disconnected"
    let connectionAttempts = 0
    const app = createApp({
        ensureDatabase: async () => {
            connectionAttempts += 1
            databaseState = "connected"
        },
        getDatabaseStatus: () => ({ state: databaseState }),
    })

    await withServer(app, async (baseUrl) => {
        const response = await globalThis.fetch(`${baseUrl}/health/ready`)

        assert.equal(response.status, 200)
        assert.equal(connectionAttempts, 1)
        assert.equal((await response.json()).checks.mongodb, "connected")
    })
})

test("unknown routes return a stable JSON 404 for any method", async () => {
    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected" }),
    })

    await withServer(app, async (baseUrl) => {
        for (const method of ["GET", "POST", "DELETE"]) {
            const response = await globalThis.fetch(`${baseUrl}/missing`, {
                method,
            })
            const body = await response.json()

            assert.equal(response.status, 404)
            assert.equal(body.error.code, "ROUTE_NOT_FOUND")
            assert.equal(body.error.message, `No existe ${method} /missing`)
        }
    })
})

test("GET /api/edits requires an authenticated session", async () => {
    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected" }),
    })

    await withServer(app, async (baseUrl) => {
        const response = await globalThis.fetch(`${baseUrl}/api/edits`)
        const body = await response.json()

        assert.equal(response.status, 401)
        assert.equal(body.error.code, "INVALID_SESSION")
        assert.equal(response.headers.get("www-authenticate"), "Bearer")
    })
})

test("login rate limit blocks repeated failed attempts", async () => {
    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected" }),
    })

    await withServer(app, async (baseUrl) => {
        let response

        for (
            let attempt = 0;
            attempt <= LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
            attempt += 1
        ) {
            response = await globalThis.fetch(`${baseUrl}/api/users/login`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ email: "invalid", password: "short" }),
            })
        }

        const body = await response.json()

        assert.equal(response.status, 429)
        assert.equal(body.error.code, "TOO_MANY_LOGIN_ATTEMPTS")
        assert.ok(response.headers.get("ratelimit"))
        assert.ok(response.headers.get("retry-after"))
    })
})

test("oversized JSON returns a canonical 413 response", async () => {
    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected" }),
    })

    await withServer(app, async (baseUrl) => {
        const response = await globalThis.fetch(`${baseUrl}/api/users/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ payload: "x".repeat(1024 * 1024) }),
        })
        const body = await response.json()

        assert.equal(response.status, 413)
        assert.equal(body.error.code, "REQUEST_TOO_LARGE")
        assert.equal(
            body.error.message,
            "La solicitud excede el tamaño permitido"
        )
    })
})

test("malformed JSON is rejected without leaking parser details", async () => {
    const app = createApp({
        ensureDatabase: async () => {},
        getDatabaseStatus: () => ({ state: "connected" }),
    })

    await withServer(app, async (baseUrl) => {
        const response = await globalThis.fetch(`${baseUrl}/api/users/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{",
        })
        const body = await response.json()

        assert.equal(response.status, 400)
        assert.equal(body.error.code, "INVALID_REQUEST")
        assert.equal(body.error.message, "La solicitud no es válida")
        assert.equal(body.error.requestId, response.headers.get("x-request-id"))
    })
})
