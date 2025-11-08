const editsModel = require("./../../dao/models/edits")
const cloudinary = require("../../cloudinary")

const deleteEdit = async (req, res) => {
    try {
        const { id } = req.params

        // Find the edit
        const edit = await editsModel.findById(id)

        if (!edit) {
            return res.status(404).json({
                success: false,
                message: "Edit not found",
            })
        }

        // Delete from Cloudinary
        try {
            await cloudinary.uploader.destroy(edit.public_id)
        } catch (cloudinaryError) {
            console.error("Cloudinary deletion error:", cloudinaryError)
            // Continue even if Cloudinary deletion fails
        }

        // Delete from database
        await editsModel.findByIdAndDelete(id)

        res.json({
            success: true,
            message: "Edit deleted successfully",
            deletedId: id,
        })
    } catch (err) {
        console.error("Delete edit error:", err)
        res.status(500).json({
            success: false,
            message: err.message || "Failed to delete edit",
        })
    }
}

module.exports = deleteEdit
