const assert = require("node:assert/strict")
const { once } = require("node:events")
const test = require("node:test")
const express = require("express")

const { createRequestContext } = require("../middleware/requestContext")

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

test("request context preserves a valid ID and emits a safe structured log", async () => {
    const entries = []
    const requestLogger = {
        info: (event, fields) => entries.push({ event, ...fields }),
    }
    const app = express()
    app.use(createRequestContext(requestLogger))
    app.get("/resource", (req, res) => res.status(200).json({ ok: true }))

    await withServer(app, async (baseUrl) => {
        const response = await globalThis.fetch(
            `${baseUrl}/resource?token=must-not-be-logged`,
            { headers: { "x-request-id": "trace-123" } }
        )

        assert.equal(response.headers.get("x-request-id"), "trace-123")
        assert.deepEqual(await response.json(), { ok: true })
    })

    assert.equal(entries.length, 1)
    assert.equal(entries[0].event, "http_request")
    assert.equal(entries[0].requestId, "trace-123")
    assert.equal(entries[0].method, "GET")
    assert.equal(entries[0].path, "/resource")
    assert.equal(entries[0].statusCode, 200)
    assert.equal(JSON.stringify(entries).includes("must-not-be-logged"), false)
})

test("request context replaces unsafe request IDs", async () => {
    const requestLogger = { info: () => {} }
    const app = express()
    app.use(createRequestContext(requestLogger))
    app.get("/", (req, res) => res.status(204).end())

    await withServer(app, async (baseUrl) => {
        const response = await globalThis.fetch(baseUrl, {
            headers: { "x-request-id": "unsafe request id" },
        })
        const requestId = response.headers.get("x-request-id")

        assert.notEqual(requestId, "unsafe request id")
        assert.match(requestId, /^[0-9a-f-]{36}$/)
    })
})
