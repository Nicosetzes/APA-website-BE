const recapsModel = require("../../dao/models/recaps")

const upsertRecapByDate = (recap) =>
    recapsModel.findOneAndUpdate(
        { date: recap.date },
        { $set: recap },
        {
            upsert: true,
            new: true,
            rawResult: true,
            runValidators: true,
            setDefaultsOnInsert: true,
        }
    )

const createPostRecaps = (dependencies = {}) => {
    const persistRecap = dependencies.persistRecap || upsertRecapByDate

    return async (req, res) => {
        const result = await persistRecap(req.body)
        const replaced = Boolean(result.lastErrorObject?.updatedExisting)

        return res.status(replaced ? 200 : 201).json({
            success: true,
            replaced,
            data: result.value,
        })
    }
}

const postRecaps = createPostRecaps()

module.exports = postRecaps
module.exports.createPostRecaps = createPostRecaps
