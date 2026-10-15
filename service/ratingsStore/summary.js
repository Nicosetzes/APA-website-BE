const { countDiff, isEmptyDiff } = require("./diff")

// Resumen legible de un diff, compartido por `recompute:ratings` y
// `verify:ratings`: conteos y hasta N ids de ejemplo por grupo.
const DEFAULT_MAX_EXAMPLES = 5
const MAX_EXAMPLES_LIMIT = 50
const OPERATIONS = ["insert", "update", "delete"]

const summarizeSection = (section, idOf, maxExamples) => {
    const result = {}
    for (const operation of OPERATIONS) {
        result[operation] = {
            count: section[operation].length,
            examples: section[operation].slice(0, maxExamples).map(idOf),
        }
    }
    return result
}

const summarizeDiff = (diff, { maxExamples = DEFAULT_MAX_EXAMPLES } = {}) => {
    if (
        !Number.isInteger(maxExamples) ||
        maxExamples < 0 ||
        maxExamples > MAX_EXAMPLES_LIMIT
    ) {
        throw new RangeError(
            `maxExamples debe ser un entero entre 0 y ${MAX_EXAMPLES_LIMIT}`
        )
    }
    return {
        inSync: isEmptyDiff(diff),
        totals: countDiff(diff),
        events: summarizeSection(
            diff.events,
            (doc) => String(doc.matchId),
            maxExamples
        ),
        players: summarizeSection(
            diff.players,
            (doc) => String(doc.id),
            maxExamples
        ),
    }
}

const formatSection = (label, section) => {
    const parts = []
    const labels = { insert: "+", update: "~", delete: "-" }
    const names = {
        insert: "nuevos",
        update: "distintos",
        delete: "huérfanos",
    }
    for (const operation of OPERATIONS) {
        const { count, examples } = section[operation]
        if (count === 0) continue
        const sample = examples.length ? ` (ej: ${examples.join(", ")})` : ""
        parts.push(`${labels[operation]}${count} ${names[operation]}${sample}`)
    }
    return `${label}: ${parts.length ? parts.join(", ") : "sin diferencias"}`
}

const formatSummary = (summary) => {
    if (summary.inSync) return ["Sin diferencias"]
    return [
        formatSection("eventos", summary.events),
        formatSection("jugadores", summary.players),
    ]
}

module.exports = { formatSummary, summarizeDiff }
