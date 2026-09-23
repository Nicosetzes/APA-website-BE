const { CloudinaryStorage } = require("multer-storage-cloudinary")
const multer = require("multer")

const editsModel = require("./../../dao/models/edits")
const cloudinary = require("../../cloudinary")
const {
    EDIT_UPLOAD_MAX_FILE_SIZE_BYTES,
    EDIT_UPLOAD_MAX_FILES,
    isAllowedEditMimeType,
} = require("../../config/uploads")
const { HttpError } = require("../../middleware/httpErrors")
const logger = require("../../utils/logger")
const withTransaction = require("../../utils/withTransaction")

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "edits",
        allowed_formats: ["jpg", "jpeg", "png", "webp"],
    },
})

const editFileFilter = (req, file, callback) => {
    if (!isAllowedEditMimeType(file.mimetype)) {
        return callback(
            new HttpError(
                415,
                "UNSUPPORTED_EDIT_FORMAT",
                "El archivo debe ser una imagen JPG, PNG o WebP"
            )
        )
    }

    return callback(null, true)
}

const postEditsUpload = multer({
    storage,
    fileFilter: editFileFilter,
    limits: {
        fileSize: EDIT_UPLOAD_MAX_FILE_SIZE_BYTES,
        files: EDIT_UPLOAD_MAX_FILES,
    },
})

const compensateUploads = async (uploadedFiles, destroyAsset) => {
    const publicIds = uploadedFiles.map((file) => file.filename).filter(Boolean)
    const results = await Promise.allSettled(publicIds.map(destroyAsset))

    return {
        attempted: publicIds.length,
        failed: results.filter(({ status }) => status === "rejected").length,
    }
}

const createPostEdits = (dependencies = {}) => {
    const persistEdits =
        dependencies.persistEdits ||
        ((documents, options) => editsModel.insertMany(documents, options))
    const destroyAsset =
        dependencies.destroyAsset ||
        ((publicId) => cloudinary.uploader.destroy(publicId))
    const runInTransaction = dependencies.withTransaction || withTransaction
    const requestLogger = dependencies.logger || logger

    return async (req, res) => {
        const uploadedFiles = req.files || (req.file ? [req.file] : [])

        if (uploadedFiles.length === 0) {
            throw new HttpError(
                400,
                "NO_FILES_UPLOADED",
                "No se recibieron imágenes para guardar"
            )
        }

        const documents = uploadedFiles.map((file) => ({
            user: req.user.id,
            url: file.path,
            public_id: file.filename,
        }))

        let edits
        try {
            edits = await runInTransaction((session) =>
                persistEdits(documents, { session })
            )
        } catch (cause) {
            const compensation = await compensateUploads(
                uploadedFiles,
                destroyAsset
            )
            const compensationIncomplete = compensation.failed > 0

            requestLogger.error("edit_upload_compensation", {
                requestId: req.requestId || null,
                attempted: compensation.attempted,
                failed: compensation.failed,
            })

            throw new HttpError(
                500,
                compensationIncomplete
                    ? "EDIT_UPLOAD_COMPENSATION_INCOMPLETE"
                    : "EDIT_PERSISTENCE_ERROR",
                compensationIncomplete
                    ? "No se pudieron guardar los edits y algunos archivos requieren limpieza manual"
                    : "No se pudieron guardar los edits; los archivos subidos fueron eliminados",
                [],
                { cause }
            )
        }

        return res.json({
            success: true,
            count: edits.length,
            data: edits,
            urls: uploadedFiles.map((file) => file.path),
        })
    }
}

const postEdits = createPostEdits()

module.exports = {
    compensateUploads,
    createPostEdits,
    editFileFilter,
    postEdits,
    postEditsUpload,
}
