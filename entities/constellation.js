const mongoose = require('mongoose')
const mediaCollection = require('./media-collection')
const status = require('./status')
const user = require('./user')
const notification = require('./notification')
const token = require('./token')
const gathering = require('./gathering')

let Constellation = {
    write: 'g-organizer',
    read: 'public',
    fields: new mongoose.Schema({
        slug: { type: String, write: 'g-admin' },
        name: { type: String, write: 'g-admin' },
        intro: { type: String, write: 'g-admin' },
        description: { type: String, write: 'g-admin' },

        type: { type: String, default: 'group', write: 'g-admin' },
        featured: { type: Boolean, default: false, write: 'admin' },
        
        location: { type: String, write: 'g-admin' },
        
        logo: { type: mongoose.Schema.Types.ObjectId, write: 'g-admin', ref: 'mediaCollection' },
        cover: { type: mongoose.Schema.Types.ObjectId, write: 'g-admin', ref: 'mediaCollection' },

        followers: [
            { type: mongoose.Schema.Types.ObjectId, write: 'g-organizer', ref: 'user' },
        ],

        members: [
            { type: mongoose.Schema.Types.ObjectId, write: 'g-organizer', ref: 'user' },
        ],

        organizers: [
            { type: mongoose.Schema.Types.ObjectId, write: 'g-admin', ref: 'user' },
        ],

        admins: [
            { type: mongoose.Schema.Types.ObjectId, write: 'g-admin', ref: 'user' },
        ],

        gatherings: [
            { type: mongoose.Schema.Types.ObjectId, write: 'g-organizer', ref: 'gathering' }
        ],

        lastEvent: { type: Date, write: 'private' },
        lastPost: { type: Date, write: 'private' },
    }, { timestamps: true })
}

Constellation.fields.pre('findOneAndUpdate', async function(next) {
    const doc = await this.findOne(this.getFilter())

    if (this._update?.cover && doc.cover && !doc.cover._id.equals(this._update.cover)) {
        let media = await mediaCollection.model.findOne({ _id: doc.cover._id })
        if (media) await media.remove()
    }

    if (this._update?.logo && doc.logo && !doc.logo._id.equals(this._update.logo)) {
        let media = await mediaCollection.model.findOne({ _id: doc.logo._id })
        if (media) await media.remove()
    }

    next()
})

Constellation.fields.pre('findOne', function () {
    this.populate('logo')
    this.populate('cover')
})

Constellation.fields.pre('find', function () {
    this.populate('logo')
    this.populate('cover')
})

Constellation.fields.pre('remove', async function (next) {
    if (this.logo) {
        let logo = await mediaCollection.model.findOne({ _id: this.logo })
        await logo.remove()
    }

    if (this.cover) {
        let cover = await mediaCollection.model.findOne({ _id: this.cover })
        await cover.remove()
    }

    let users = await user.model.find({
        $or: [
            { constellations: this._id },
            { followedConstellations: this._id },
            { createdConstellations: this._id },
        ]
    })

    await Promise.all(users.map(async user => {
        user.constellations = user.constellations.filter(c => !c.equals(this._id))
        user.followedConstellations = user.followedConstellations.filter(c => !c.equals(this._id))
        user.createdConstellations = user.createdConstellations.filter(c => !c.equals(this._id))

        return await user.save()
    }))

    let notifications = await notification.model.find({
        constellation: this._id
    })

    let tokens = await token.model.find({
        constellation: this._id
    })

    let statuses = await status.model.find({
        constellation: this._id
    })

    let gatherings = await gathering.model.find({
        constellation: this._id
    })

    await Promise.all([...gatherings, ...notifications, ...tokens, ...statuses].map(async s => {
        return await s.remove()
    }))

    next()
})

Constellation.model = global.Constellation ? global.Constellation.model : mongoose.model('constellation', Constellation.fields)
global.Constellation = Constellation

module.exports = Constellation