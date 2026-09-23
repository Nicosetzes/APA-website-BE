const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")

const { createApp } = require("../app")

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
    })
})
