const EDIT_ALLOWED_FORMATS = ["jpg", "jpeg", "png", "webp"]

class CloudinaryEditStorage {
    constructor({ cloudinary, folder }) {
        this.cloudinary = cloudinary
        this.folder = folder
    }

    _handleFile(request, file, callback) {
        let callbackCalled = false

        const done = (error, uploadedFile) => {
            if (callbackCalled) return
            callbackCalled = true
            callback(error, uploadedFile)
        }

        try {
            const uploadStream = this.cloudinary.uploader.upload_stream(
                {
                    folder: this.folder,
                    allowed_formats: EDIT_ALLOWED_FORMATS,
                },
                (error, result) => {
                    if (error) return done(error)

                    if (!result?.secure_url || !result?.public_id) {
                        return done(
                            new Error(
                                "Cloudinary returned an incomplete upload response"
                            )
                        )
                    }

                    return done(null, {
                        path: result.secure_url,
                        size: result.bytes,
                        filename: result.public_id,
                    })
                }
            )

            file.stream.once("error", (error) => {
                uploadStream.destroy(error)
                done(error)
            })
            uploadStream.once("error", done)
            file.stream.pipe(uploadStream)
        } catch (error) {
            done(error)
        }
    }

    _removeFile(request, file, callback) {
        try {
            this.cloudinary.uploader.destroy(
                file.filename,
                { invalidate: true },
                callback
            )
        } catch (error) {
            callback(error)
        }
    }
}

module.exports = CloudinaryEditStorage
