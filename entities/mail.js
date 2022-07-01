const mongoose = require('mongoose')

let Mail = {
    write: 'private',
    read: 'admin',
    fields: new mongoose.Schema({
        id: { type: String },
        type: { type: String },
        date: { type: Date },
        params: { type: Object, default: {} },
        attachment: { type: Array, default: [] },
        status: { type: String, default: 'pending' },

        user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
        gathering: { type: mongoose.Schema.Types.ObjectId, ref: 'gathering' },
    }, { timestamps: true })
}

Mail.model = global.Mail ? global.Mail.model : mongoose.model('mail', Mail.fields)
global.Mail = Mail

module.exports = Mail