"use strict"
const assert = require("node:assert/strict")
const test = require("node:test")
const {
    DEFAULT_RATING_SYNC_MAX_CHANGES,
    DEFAULT_RATING_SYNC_TIMEOUT_MS,
    getRatingSyncSettings,
    parsePositiveInteger,
    parseSyncEnabled,
} = require("../config/ratingSync")

test("defaults: encendido, 5000 ms y 300 cambios", () => {
    assert.deepEqual(getRatingSyncSettings({}), {
        enabled: true,
        timeoutMs: 5000,
        maxChanges: 300,
    })
    assert.equal(DEFAULT_RATING_SYNC_TIMEOUT_MS, 5000)
    assert.equal(DEFAULT_RATING_SYNC_MAX_CHANGES, 300)
})

test("off, 0 y false apagan sin importar mayúsculas ni espacios", () => {
    for (const value of ["off", "OFF", " Off ", "0", "false", " FALSE\n"]) {
        assert.equal(parseSyncEnabled(value), false, JSON.stringify(value))
    }
})

test("ausente, vacío u otro valor deja el sync encendido", () => {
    for (const value of [
        undefined,
        null,
        "",
        " ",
        "on",
        "1",
        "true",
        "nope",
        0,
        false,
    ]) {
        assert.equal(parseSyncEnabled(value), true, JSON.stringify(value))
    }
})

test("enteros positivos válidos se respetan", () => {
    assert.deepEqual(
        getRatingSyncSettings({
            RATING_SYNC_TIMEOUT_MS: "1500",
            RATING_SYNC_MAX_CHANGES: " 40 ",
        }),
        { enabled: true, timeoutMs: 1500, maxChanges: 40 }
    )
})

test("vacío, decimal, negativo, cero o texto caen al default", () => {
    for (const value of [
        "",
        " ",
        "1.5",
        "-3",
        "0",
        "00",
        "abc",
        "12px",
        "1e3",
        "Infinity",
        "99999999999999999999",
        undefined,
        null,
        500,
    ]) {
        assert.equal(parsePositiveInteger(value, 7), 7, JSON.stringify(value))
    }
})

test("lee el entorno inyectado en cada llamada", () => {
    const env = {}
    assert.equal(getRatingSyncSettings(env).enabled, true)
    env.RATING_SYNC_ON_WRITE = "off"
    assert.equal(getRatingSyncSettings(env).enabled, false)
    env.RATING_SYNC_ON_WRITE = "on"
    env.RATING_SYNC_MAX_CHANGES = "10"
    assert.deepEqual(getRatingSyncSettings(env), {
        enabled: true,
        timeoutMs: 5000,
        maxChanges: 10,
    })
})

test("por defecto usa process.env al momento de llamar", () => {
    const previous = process.env.RATING_SYNC_ON_WRITE
    try {
        process.env.RATING_SYNC_ON_WRITE = "false"
        assert.equal(getRatingSyncSettings().enabled, false)
        process.env.RATING_SYNC_ON_WRITE = "true"
        assert.equal(getRatingSyncSettings().enabled, true)
    } finally {
        if (previous === undefined) delete process.env.RATING_SYNC_ON_WRITE
        else process.env.RATING_SYNC_ON_WRITE = previous
    }
})

test("el presupuesto de tiempo no puede pasar del máximo de setTimeout", () => {
    const { getRatingSyncSettings } = require("../config/ratingSync")
    // 2^31-1 es el máximo válido; uno más caería al default.
    assert.equal(
        getRatingSyncSettings({ RATING_SYNC_TIMEOUT_MS: "2147483647" })
            .timeoutMs,
        2147483647
    )
    assert.equal(
        getRatingSyncSettings({ RATING_SYNC_TIMEOUT_MS: "2147483648" })
            .timeoutMs,
        5000
    )
    // El máximo de cambios no tiene ese límite.
    assert.equal(
        getRatingSyncSettings({ RATING_SYNC_MAX_CHANGES: "9999999999" })
            .maxChanges,
        9999999999
    )
})
