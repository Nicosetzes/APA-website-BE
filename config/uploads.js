const EDIT_UPLOAD_MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024
const EDIT_UPLOAD_MAX_FILES = 10
const EDIT_UPLOAD_ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
])

const DEFAULT_EDIT_UPLOAD_FOLDER = "edits"

const isAllowedEditMimeType = (mimeType) =>
    EDIT_UPLOAD_ALLOWED_MIME_TYPES.has(mimeType)

// Cloudinary es una sola cuenta compartida entre entornos. Esta variable
// permite que preview suba a otra carpeta y no se mezcle con producción.
const getEditUploadFolder = () =>
    process.env.CLOUDINARY_EDITS_FOLDER?.trim() || DEFAULT_EDIT_UPLOAD_FOLDER

module.exports = {
    DEFAULT_EDIT_UPLOAD_FOLDER,
    EDIT_UPLOAD_MAX_FILE_SIZE_BYTES,
    EDIT_UPLOAD_MAX_FILES,
    getEditUploadFolder,
    isAllowedEditMimeType,
}
