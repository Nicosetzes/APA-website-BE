const assert = require("node:assert/strict")
const test = require("node:test")

const { ALLOWLIST, RULES, findMatches } = require("../scripts/scanSecrets")

const rulesFor = (contents, file = "archivo-de-prueba.js") =>
    findMatches(contents, file).map((finding) => finding.rule)

test("detecta un URI de Mongo con credenciales", () => {
    const contents =
        'const uri = "mongodb+srv://usuario:clavereal@cluster0.abcde.mongodb.net/base"'

    assert.deepEqual(rulesFor(contents), ["mongo-uri-con-credenciales"])
})

test("detecta claves privadas, AWS y hashes bcrypt", () => {
    assert.deepEqual(rulesFor("-----BEGIN RSA PRIVATE KEY-----"), [
        "clave-privada",
    ])
    assert.deepEqual(rulesFor("id = AKIAIOSFODNN7EXAMPLQ"), [
        "aws-access-key-id",
    ])
    assert.deepEqual(
        rulesFor(
            'const hash = "$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123"'
        ),
        ["hash-bcrypt"]
    )
})

test("detecta variables sensibles con valor concreto", () => {
    assert.deepEqual(rulesFor("TOKEN_SECRET=unsecretomuylargodeverdad"), [
        "variable-sensible-con-valor",
    ])
})

test("ignora ejemplos y placeholders", () => {
    const ejemplos = [
        '$env:MONGO_URI="mongodb+srv://..."',
        "MONGO_URI=<tu-uri-de-mongo>",
        "TOKEN_SECRET=changeme",
        "CLOUDINARY_API_SECRET=example-secret-value",
    ]

    for (const linea of ejemplos) {
        assert.deepEqual(rulesFor(linea), [], `no debería marcar: ${linea}`)
    }
})

test("no marca código limpio", () => {
    const contents = [
        'const { connectMongo } = require("./database")',
        "const token = jwt.sign(payload, process.env.TOKEN_SECRET)",
        'res.status(200).json({ auth: true, message: "ok" })',
    ].join("\n")

    assert.deepEqual(rulesFor(contents), [])
})

test("las excepciones declaradas silencian sólo su archivo y su regla", () => {
    const hash =
        '"$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ123"'

    assert.deepEqual(
        findMatches(hash, "controller/postLogin/index.js"),
        [],
        "el hash dummy del login está declarado"
    )
    assert.deepEqual(rulesFor(hash, "controller/getUsers/index.js"), [
        "hash-bcrypt",
    ])
})

test("cada excepción declara un motivo", () => {
    for (const entry of ALLOWLIST) {
        assert.ok(entry.file, "la excepción necesita archivo")
        assert.ok(entry.rule, "la excepción necesita regla")
        assert.ok(
            entry.reason && entry.reason.length > 20,
            `la excepción de ${entry.file} necesita un motivo explicado`
        )
    }
})

test("cada regla tiene nombre y patrón", () => {
    assert.ok(RULES.length >= 5)

    for (const rule of RULES) {
        assert.ok(rule.name)
        assert.ok(rule.pattern instanceof RegExp)
    }
})
