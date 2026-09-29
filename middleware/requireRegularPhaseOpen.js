const { HttpError } = require("./httpErrors")
const { isKnockoutMatch } = require("../utils/matchPhase")
const existsMatchByTournamentId = require("../dao/existsMatchByTournamentId")

const closingStageFor = (format, match) => {
    if (format === "league_playin_playoff") {
        return match.group
            ? {
                  filter: { type: "playin", group: match.group },
                  message: `El play-in de la zona ${match.group} ya fue generado: los resultados de la fase regular de esa zona no se pueden modificar`,
              }
            : {
                  filter: { type: "playin" },
                  message:
                      "El play-in ya fue generado: los resultados de la fase regular no se pueden modificar",
              }
    }

    return {
        filter: { type: "playoff" },
        message:
            "El playoff ya fue generado: los resultados de la fase regular no se pueden modificar",
    }
}

const createRequireRegularPhaseOpen = (dependencies = {}) => {
    const existsMatch =
        dependencies.existsMatchByTournamentId || existsMatchByTournamentId

    return async (req, res, next) => {
        const match = req.match

        if (isKnockoutMatch(match)) return next()

        const { filter, message } = closingStageFor(
            req.tournament?.format,
            match
        )

        try {
            const closed = await existsMatch(match.tournament.id, filter)

            if (closed) {
                return next(new HttpError(409, "REGULAR_PHASE_CLOSED", message))
            }

            return next()
        } catch (cause) {
            return next(
                new HttpError(
                    500,
                    "MATCH_PHASE_CHECK_ERROR",
                    "No se pudo verificar la fase del torneo",
                    [],
                    { cause }
                )
            )
        }
    }
}

const requireRegularPhaseOpen = createRequireRegularPhaseOpen()

module.exports = requireRegularPhaseOpen
module.exports.createRequireRegularPhaseOpen = createRequireRegularPhaseOpen
