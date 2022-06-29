const mongoose = require('mongoose')
const mediaCollection = require('./media-collection')
const reaction = require('./reaction')

let Status = {
    write: 'user',
    read: 'user',
    fields: new mongoose.Schema({
        read: { type: String, default: 'friends', write: 'self' },

        content: { type: String, write: 'user', read: '$status' },

        reactions: [
            { type: mongoose.Schema.Types.ObjectId, write: 'private', read: '$status', ref: 'reaction' }
        ],
        
        images: [
            { type: mongoose.Schema.Types.ObjectId, write: 'private', read: '$status', ref: 'mediaCollection' }
        ],

        children: [
            { type: mongoose.Schema.Types.ObjectId, write: 'private', read: '$status', ref: 'status' }
        ],

        constellation: { type: mongoose.Schema.Types.ObjectId, write: 'private', ref: 'constellation' },

        gathering: { type: mongoose.Schema.Types.ObjectId, write: 'private', ref: 'gathering' },

        origin: { type: mongoose.Schema.Types.ObjectId, write: 'private', ref: 'status' },

        parent: { type: mongoose.Schema.Types.ObjectId, write: 'private', ref: 'status' },

        owner: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'public', ref: 'user' }
    }, { timestamps: true })
}

Status.fields.pre('findOne', function () {
    this.populate('reactions')
    this.populate('children')
    this.populate('images')
})

Status.fields.pre('find', function () {
    this.populate('reactions')
    this.populate('children')
    this.populate('images')
})

Status.fields.pre('remove', async function (next) {
    if (this.images) {
        await Promise.all(this.images.map(async image => {
            let medias = await mediaCollection.model.findOne({ _id: image })
            await medias.remove()
            return true
        }))
    }

    await reaction.model.deleteMany({
        status: this._id
    })

    let children = await Status.model.find({
        $or: [
            { parent: this._id },
            { origin: this._id }
        ]
    })

    await Promise.all(children.map(async c => {
        return await c.remove()
    }))

    next()
})

Status.model = global.Status ? global.Status.model : mongoose.model('status', Status.fields)
global.Status = Status

module.exports = Status