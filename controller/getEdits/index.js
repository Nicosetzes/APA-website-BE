const editsModel = require("./../../dao/models/edits")

const EDITS_PER_PAGE = 9

const findEditsPage = ({ skip, limit }) =>
    editsModel
        .find()
        .populate("user", "name nickname")
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()

const createGetEdits = (dependencies = {}) => {
    const countEdits =
        dependencies.countEdits || (() => editsModel.countDocuments())
    const findEdits = dependencies.findEdits || findEditsPage

    return async (req, res) => {
        const page = req.query.page
        const skip = (page - 1) * EDITS_PER_PAGE
        const [totalEdits, edits] = await Promise.all([
            countEdits(),
            findEdits({ skip, limit: EDITS_PER_PAGE }),
        ])
        const totalPages = Math.ceil(totalEdits / EDITS_PER_PAGE)

        return res.json({
            success: true,
            data: edits,
            pagination: {
                currentPage: page,
                totalPages,
                totalEdits,
                editsPerPage: EDITS_PER_PAGE,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        })
    }
}

const getEdits = createGetEdits()

module.exports = getEdits
module.exports.createGetEdits = createGetEdits
