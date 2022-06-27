const mongoose = require('mongoose')
const mediaCollection = require('./media-collection')

let ChannelMessage = {
    write: 'user',
    read: 'user',
    fields: new mongoose.Schema({
        content: { type: String, write: 'user', read: 'user' },
        reactions: { type: Array, default: [], write: 'user', read: 'user' },

        images: [
            { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'user', ref: 'mediaCollection' }
        ],

        parent: { type: mongoose.Schema.Types.ObjectId, write: 'private', ref: 'channelMessage' },

        channel: { type: mongoose.Schema.Types.ObjectId, write: 'private', ref: 'channel' },

        owner: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'user', ref: 'user' }
    }, { timestamps: true })
}

ChannelMessage.fields.pre('findOne', function () {
    this.populate('images')
})

ChannelMessage.fields.pre('find', function () {
    this.populate('images')
})

ChannelMessage.fields.pre('remove', async function (next) {
    if (this.images) {
        await Promise.all(this.images.map(async image => {
            let medias = await mediaCollection.model.findOne({ _id: image })
            await medias.remove()
            return true
        }))
    }
    next()
})

ChannelMessage.model = global.ChannelMessage ? global.ChannelMessage.model : mongoose.model('channelMessage', ChannelMessage.fields)
global.ChannelMessage = ChannelMessage

module.exports = ChannelMessage