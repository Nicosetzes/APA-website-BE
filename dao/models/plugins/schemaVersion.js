const CURRENT_SCHEMA_VERSION = 1

const stampSchemaVersion = (documents) => {
    const entries = Array.isArray(documents) ? documents : [documents]

    entries.forEach((document) => {
        if (document) document.schemaVersion = CURRENT_SCHEMA_VERSION
    })

    return documents
}

const schemaVersionPlugin = (schema) => {
    schema.add({
        schemaVersion: {
            type: Number,
            enum: [CURRENT_SCHEMA_VERSION],
            immutable: true,
        },
    })

    schema.pre("validate", function stampNewDocument(next) {
        if (this.isNew) stampSchemaVersion(this)
        next()
    })

    schema.pre("insertMany", function stampInsertedDocuments(next, documents) {
        stampSchemaVersion(documents)
        next()
    })
}

module.exports = {
    CURRENT_SCHEMA_VERSION,
    schemaVersionPlugin,
    stampSchemaVersion,
}
