const { HttpError } = require("../../middleware/httpErrors")
const {
    PLAYOFF_LEG_INDEX_NAME,
    hasPlayoffLegIndexDefinition,
} = require("../../config/playoffLegIndex")

const verifyPlayoffLegIndex = async (connection) => {
    const indexes = await connection
        .collection("face-to-face")
        .listIndexes()
        .toArray()
    const index = indexes.find(({ name }) => name === PLAYOFF_LEG_INDEX_NAME)

    if (!hasPlayoffLegIndexDefinition(index)) {
        throw new Error(
            `${PLAYOFF_LEG_INDEX_NAME} is missing or has a different definition`
        )
    }

    return true
}

const indexUnavailable = (cause) =>
    new HttpError(
        503,
        "PLAYOFF_INDEX_NOT_READY",
        "Las escrituras de playoffs no están disponibles temporalmente",
        [],
        { cause }
    )

const createPlayoffLegIndexReadinessGate = ({
    verify,
    cacheMs = 30000,
    now = Date.now,
}) => {
    let readyUntil = 0
    let pendingVerification = null

    return async () => {
        if (now() < readyUntil) return true

        if (!pendingVerification) {
            pendingVerification = Promise.resolve()
                .then(() => verify())
                .then(() => {
                    readyUntil = now() + cacheMs
                    return true
                })
        }

        const currentVerification = pendingVerification
        try {
            return await currentVerification
        } catch (cause) {
            throw indexUnavailable(cause)
        } finally {
            if (pendingVerification === currentVerification) {
                pendingVerification = null
            }
        }
    }
}

module.exports = {
    createPlayoffLegIndexReadinessGate,
    indexUnavailable,
    verifyPlayoffLegIndex,
}
