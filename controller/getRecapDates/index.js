const recapsModel = require("../../dao/models/recaps")

const findRecapDates = async () => {
    const recaps = await recapsModel
        .find()
        .sort({ date: -1 })
        .select("date -_id")
        .lean()

    return recaps.map(({ date }) => date)
}

const createGetRecapDates = (dependencies = {}) => {
    const retrieveDates = dependencies.findRecapDates || findRecapDates

    return async (req, res) => {
        const dates = await retrieveDates()

        return res.json({ success: true, data: dates })
    }
}

const getRecapDates = createGetRecapDates()

module.exports = getRecapDates
module.exports.createGetRecapDates = createGetRecapDates
