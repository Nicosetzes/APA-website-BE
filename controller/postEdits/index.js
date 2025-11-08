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
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
})

const postEdits = async (req, res) => {
    try {
        // multer + CloudinaryStorage will attach the file info to req.file
        const uploadedFile = req.file

        if (!uploadedFile) {
            return res
                .status(400)
                .json({ success: false, message: "No file uploaded" })
        }

        const newEdit = await editsModel.create({
            user: req.userId,
            url: uploadedFile.path,
            public_id: uploadedFile.filename,
            caption: req.body.caption || "",
        })

        res.json({
            data: newEdit,
            public_id: uploadedFile.filename,
            success: true,
            url: uploadedFile.path, // Cloudinary URL
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
