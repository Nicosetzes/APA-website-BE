const { retrieveMatchTeams } = require("./../../service")

const toSortedUniqueTeams = (teams) => {
    const byName = new Map()

    for (const team of teams) {
        if (typeof team?.name !== "string") continue

        const name = team.name.trim()
        if (!name) continue

        const id = team.id ?? null
        const current = byName.get(name)
        if (!current || (current.id === null && id !== null)) {
            byName.set(name, { id, name })
        }
    }

    return [...byName.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "es", { sensitivity: "base" })
    )
}

const createGetMatchTeams = (dependencies = {}) => {
    const retrieve = dependencies.retrieveMatchTeams || retrieveMatchTeams

    return async (req, res) => {
        const teams = (await retrieve()) || []

        return res.status(200).json(toSortedUniqueTeams(teams))
    }
}

const getMatchTeams = createGetMatchTeams()

module.exports = getMatchTeams
module.exports.createGetMatchTeams = createGetMatchTeams
