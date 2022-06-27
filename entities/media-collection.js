const mongoose = require('mongoose')
const AWS = require('aws-sdk')

let MediaCollection = {
    write: 'user',
    read: 'public',
    fields: new mongoose.Schema({
        title: { type: String, write: 'editor' },
        color: { type: String },
        medias: { type: Array, default: [] },
    }, { timestamps: true })
}

MediaCollection.fields.pre('remove', async function (next) {
    const s3 = new AWS.S3({
        accessKeyId: process.env.S3_ID,
        secretAccessKey: process.env.S3_SECRET
    })
    
    if (this.medias) {
        await Promise.all(this.medias.map(async media => {
            if (media.id) {
                await s3.deleteObject({
                    Bucket: process.env.S3_BUCKET, Key: media.id
                }).promise()
            }

            return true
        }))
    }

    next()
})

MediaCollection.model = global.MediaCollection ? global.MediaCollection.fields : mongoose.model('mediaCollection', MediaCollection.fields)

MediaCollection.model = mongoose.model('mediaCollection', MediaCollection.fields)
global.MediaCollection = MediaCollection

module.exports = MediaCollection