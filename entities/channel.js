const mongoose = require('mongoose')
const channelMessage = require('./channel-message')

let Channel = {
    write: 'user',
    read: 'user',
    fields: new mongoose.Schema({
        users: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'user' }
        ],

        readBy: [
            { type: mongoose.Schema.Types.ObjectId, ref: 'user' }
        ],

        lastMessage: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'user', ref: 'channelMessage' },

        owner: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'user', ref: 'user' }
    }, { timestamps: true })
}

Channel.fields.pre('findOne', function () {
    this.populate('lastMessage')
})

Channel.fields.pre('find', function () {
    this.populate('lastMessage')
})

Channel.fields.pre('remove', async function (next) {
    await channelMessage.model.deleteMany({
        channel: this._id
    })

    next()
})

Channel.model = global.Channel ? global.Channel.model : mongoose.model('channel', Channel.fields)
global.Channel = Channel

module.exports = Channel