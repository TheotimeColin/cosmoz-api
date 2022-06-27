const mongoose = require('mongoose')

let Notification = {
    write: 'self',
    read: 'self',
    fields: new mongoose.Schema({
        type: { type: String },

        origins: { type: Array, default: [] },
        state: { type: String, default: 'unread' },
        content: { type: String, default: '' },

        user: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'self', ref: 'user' },
        constellation: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'self', ref: 'constellation' },
        status: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'self', ref: 'status' },
        gathering: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'self', ref: 'gathering' },

        owner: { type: mongoose.Schema.Types.ObjectId, write: 'private', read: 'self', ref: 'user' }
    }, { timestamps: true })
}

Notification.model = global.Notification ? global.Notification.model : mongoose.model('notification', Notification.fields)
global.Notification = Notification

module.exports = Notification