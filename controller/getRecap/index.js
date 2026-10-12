const recapsModel = require("../../dao/models/recaps")
const { HttpError } = require("../../middleware/httpErrors")

const PUBLIC_FIELDS = "-_id -__v"

const findRecap = (date) =>
    date
        ? recapsModel.findOne({ date }).select(PUBLIC_FIELDS).lean()
        : recapsModel.findOne().sort({ date: -1 }).select(PUBLIC_FIELDS).lean()

// Sin `:date` en la ruta devuelve el recap del día más reciente.
const createGetRecap = (dependencies = {}) => {
    const retrieveRecap = dependencies.findRecap || findRecap

    return async (req, res) => {
        const date = req.params?.date
        const recap = await retrieveRecap(date)

        if (!recap) {
            throw new HttpError(
                404,
                "RECAP_NOT_FOUND",
                date
                    ? `No hay recap para el ${date}`
                    : "Todavía no hay recaps guardados"
            )
        }

        return res.json({ success: true, data: recap })
    }
}

const getRecap = createGetRecap()

module.exports = getRecap
module.exports.createGetRecap = createGetRecap
