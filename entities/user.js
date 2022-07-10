const mongoose = require('mongoose')
const bcrypt = require('bcrypt')
const mediaCollection = require('./media-collection')

const { generatePassword } = require('../utils/user')

let User = {
    read: 'public',
    write: 'self',
    fields: new mongoose.Schema({
        id: { type: String, write: 'private' },
        alias: { type: String, write: 'self', read: 'public' },
        name: { type: String, write: 'self', read: 'public' },

        email: { type: String, write: 'admin', read: 'admin' },
        password: { type: String, write: 'admin', read: 'private' },
        role: { type: String, write: 'admin', read: 'editor', default: 'guest' },

        birthdate: { type: Date, write: 'self', read: 'self' },
        interests: { type: Array, default: [], write: 'self', read: 'friends' },

        picture: { type: mongoose.Schema.Types.ObjectId, write: 'self', read: 'user', ref: 'mediaCollection' },

        ref: { type: String, write: 'self' },
        referral: { type: String, write: 'self' },

        settings: { type: Object, write: 'self', read: 'self' },
        notifications: { type: Array, default: [], write: 'self', read: 'self' },
        mentions: { type: Array, default: [], write: 'private', read: 'user' },
        gatherings: { type: Array, default: [], write: 'self', read: 'self' },

        affinities: [
            { type: mongoose.Schema.Types.ObjectId, write: 'editor', read: 'self', ref: 'user' }
        ],

        encounters: [
            { type: mongoose.Schema.Types.ObjectId, write: 'editor', read: 'self', ref: 'user' }
        ],

        isEncountered: { type: Boolean, default: false, write: 'private', read: 'public', replace: { encounters: '$requester' } },

        constellationData: { type: Object, default: {}, read: 'self' },

        friends: [
            { type: mongoose.Schema.Types.ObjectId, write: 'editor', read: 'self', ref: 'user' }
        ],
        
        constellations: [
            { type: mongoose.Schema.Types.ObjectId, write: 'editor', read: 'friends', ref: 'constellation' }
        ],

        followedConstellations: [
            { type: mongoose.Schema.Types.ObjectId, write: 'editor', read: 'self', ref: 'constellation' }
        ],

        createdConstellations: [
            { type: mongoose.Schema.Types.ObjectId, write: 'editor', read: 'self', ref: 'constellation' }
        ],

        channels: [
            { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'self', ref: 'channel' }
        ],

        isFriend: { type: Boolean, default: false, write: 'private', read: 'public', replace: { friends: '$requester' } },

        tidbits: { type: Array, default: [], write: 'self', read: '$readEach' },

        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
    }, { timestamps: true })
}

User.fields.pre('save', async function(next) {
    var user = this

    if (!user.isModified('password')) return next()

    let hash = await generatePassword(user.password)
    user.password = hash

    next()
})

User.fields.pre('findOneAndUpdate', async function(next) {
    const doc = await this.findOne(this.getFilter())

    if (this._update?.picture && doc.picture && !doc.picture._id.equals(this._update.picture)) {
        let media = await mediaCollection.model.findOne({ _id: doc.picture._id })
        if (media) await media.remove()
    }

    next()
})

User.fields.pre('find', function () {
    this.populate('picture')
})

User.fields.methods.comparePassword = function(candidatePassword) {
    return new Promise(resolve => {
        bcrypt.compare(candidatePassword, this.password, (err, isMatch) => {
            resolve(isMatch, err)
        })
    })
    
}

User.model = global.User ? global.User.model : mongoose.model('user', User.fields)
global.User = User

module.exports = User