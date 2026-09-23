const editsModel = require("./../../dao/models/edits")
const cloudinary = require("../../cloudinary")
const { HttpError } = require("../../middleware/httpErrors")
const logger = require("../../utils/logger")

const createDeleteEdit = (dependencies = {}) => {
    const destroyAsset =
        dependencies.destroyAsset ||
        ((publicId) => cloudinary.uploader.destroy(publicId))
    const deleteEditById =
        dependencies.deleteEditById ||
        ((id) => editsModel.findByIdAndDelete(id))
    const requestLogger = dependencies.logger || logger

    return async (req, res) => {
        const { id } = req.params
        const edit = req.edit

        if (!edit) {
            throw new HttpError(404, "EDIT_NOT_FOUND", "No se encontró el edit")
        }

        try {
            await destroyAsset(edit.public_id)
        } catch (error) {
            requestLogger.error("cloudinary_delete_failed", {
                requestId: req.requestId || null,
            })
        }

        await deleteEditById(id)

        return res.json({
            success: true,
            message: "Edit deleted successfully",
            deletedId: id,
        })
    }
}

const deleteEdit = createDeleteEdit()

module.exports = deleteEdit
module.exports.createDeleteEdit = createDeleteEdit
