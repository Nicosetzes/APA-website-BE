const EDIT_UPLOAD_MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024
const EDIT_UPLOAD_MAX_FILES = 10
const EDIT_UPLOAD_ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
])

const isAllowedEditMimeType = (mimeType) =>
    EDIT_UPLOAD_ALLOWED_MIME_TYPES.has(mimeType)

module.exports = {
    EDIT_UPLOAD_MAX_FILE_SIZE_BYTES,
    EDIT_UPLOAD_MAX_FILES,
    isAllowedEditMimeType,
}
