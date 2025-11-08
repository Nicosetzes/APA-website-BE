const editsModel = require("./../../dao/models/edits")

const getEdits = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1
        const limit = 9
        const skip = (page - 1) * limit

        // Get total count for pagination info
        const totalEdits = await editsModel.countDocuments()
        const totalPages = Math.ceil(totalEdits / limit)

        // Get paginated edits, sorted by newest first
        const edits = await editsModel
            .find()
            .populate("user", "name nickname")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean()

        res.json({
            success: true,
            data: edits,
            pagination: {
                currentPage: page,
                totalPages,
                totalEdits,
                editsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        })
    } catch (err) {
        console.error("Get edits error:", err)
        res.status(500).json({
            success: false,
            message: err.message || "Failed to retrieve edits",
        })
    }
}

module.exports = getEdits
