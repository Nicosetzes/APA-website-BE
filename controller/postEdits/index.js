const { CloudinaryStorage } = require("multer-storage-cloudinary")
const editsModel = require("./../../dao/models/edits")
const cloudinary = require("../../cloudinary")
const multer = require("multer")

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "edits",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
    },
})

const postEditsUpload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit
})

const postEdits = async (req, res) => {
    try {
        // multer will attach files to req.files (array) or req.file (single)
        const uploadedFiles = req.files || (req.file ? [req.file] : [])

        if (!uploadedFiles || uploadedFiles.length === 0) {
            return res
                .status(400)
                .json({ success: false, message: "No files uploaded" })
        }

        // Create database entries for all uploaded files
        const edits = await Promise.all(
            uploadedFiles.map((file) =>
                editsModel.create({
                    user: req.userId,
                    url: file.path,
                    public_id: file.filename,
                    caption: req.body.caption || "",
                })
            )
        )

        res.json({
            success: true,
            count: edits.length,
            data: edits,
            urls: uploadedFiles.map((file) => file.path),
        })
    } catch (err) {
        console.error("Upload error:", err)
        res.status(500).json({
            success: false,
            message: err.message || "Upload failed",
        })
    }
}

module.exports = { postEdits, postEditsUpload }
