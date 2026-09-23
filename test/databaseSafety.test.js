const assert = require("node:assert/strict")
const test = require("node:test")

const {
    isTestDatabaseName,
    shouldBlockLocalStart,
} = require("../config/databaseSafety")

test("solo se aceptan nombres de base explícitamente de prueba", () => {
    for (const name of [
        "apa-dev",
        "apa_test",
        "apa.qa",
        "staging",
        "dev",
        "APA-DEV",
    ]) {
        assert.equal(isTestDatabaseName(name), true, `debería aceptar ${name}`)
    }

    for (const name of [
        "myFirstDatabase",
        "myfirstdatabase",
        "apa",
        "produccion",
        "apadev",
        "development",
        "",
        null,
        undefined,
    ]) {
        assert.equal(
            isTestDatabaseName(name),
            false,
            `debería rechazar ${name}`
        )
    }
})

test("el server local se bloquea contra una base que no es de pruebas", () => {
    assert.equal(
        shouldBlockLocalStart({ databaseName: "myFirstDatabase" }),
        true
    )
    assert.equal(shouldBlockLocalStart({ databaseName: "apa-dev" }), false)
})

test("el bloqueo no aplica en un deployment administrado", () => {
    assert.equal(
        shouldBlockLocalStart({
            databaseName: "myFirstDatabase",
            isManagedDeployment: true,
        }),
        false
    )
})

test("el bloqueo se puede saltear explícitamente", () => {
    assert.equal(
        shouldBlockLocalStart({
            databaseName: "myFirstDatabase",
            allowProductionDatabase: true,
        }),
        false
    )
})
