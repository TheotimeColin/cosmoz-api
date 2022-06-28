const mongoose = require('mongoose')
const mediaCollection = require('./media-collection')
const notification = require('./notification')
const status = require('./status')

let Gathering = {
    write: 'g-organizer',
    read: 'public',
    fields: new mongoose.Schema({
        id: { type: String, write: 'private' },
        title: { type: String, write: 'g-organizer' },

        location: { type: String, write: 'g-organizer' },
        address: { type: String, write: 'g-organizer' },
        date: { type: Date, write: 'g-organizer' },
        link: { type: String, write: 'g-organizer' },
        linkRegister: { type: Boolean, default: false, write: 'g-organizer' },
        visibility: { type: String, default: 'group', write: 'g-organizer' },

        description: { type: String, write: 'g-organizer' },
        important: { type: String, write: 'g-organizer' },
       
        max: { type: Number, write: 'g-organizer' },
        guests: { type: Number, default: 0, write: 'g-organizer' },

        tags: { type: Array, default: [], write: 'g-organizer' },

        status: { type: String, write: 'g-organizer' },
        favorites: { type: Number, default: 0, write: 'public' },

        users: { type: Array, default: [], write: 'g-organizer' },
        
        cover: { type: mongoose.Schema.Types.ObjectId, write: 'g-organizer', ref: 'mediaCollection' },

        reminded: { type: Boolean, default: false, write: 'private', read: 'private' },

        constellation: { type: mongoose.Schema.Types.ObjectId, write: 'g-organizer', ref: 'constellation' },

        organizers: [
            { type: mongoose.Schema.Types.ObjectId, write: 'g-organizer', ref: 'user' }
        ],

        owner: { type: mongoose.Schema.Types.ObjectId, write: 'g-organizer', ref: 'user' }
    }, { timestamps: true })
}

Gathering.fields.pre('findOneAndUpdate', async function(next) {
    const doc = await this.findOne(this.getFilter())

    if (doc && doc.cover && !doc.cover._id.equals(this._update.cover)) {
        let media = await mediaCollection.model.deleteOne({ _id: doc.cover._id })
        if (media) await media.remove()
    }

    next()
})

Gathering.fields.pre('findOne', function () {
    this.populate('cover')
})

Gathering.fields.pre('find', function () {
    this.populate('cover')
})

Gathering.fields.pre('remove', async function (next) {
    if (this.cover) {
        let cover = await mediaCollection.model.findOne({ _id: this.cover })
        await cover.remove()
    }

    let notifications = await notification.model.find({
        gathering: this._id
    })

    let statuses = await status.model.find({
        gathering: this._id
    })

    await Promise.all([...notifications, ...statuses].map(async s => {
        return await s.remove()
    }))

    next()
})

Gathering.model = global.Gathering ? global.Gathering.model : mongoose.model('gathering', Gathering.fields)
global.Gathering = Gathering

module.exports = Gathering