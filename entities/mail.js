const mongoose = require('mongoose')

let Mail = {
    write: 'private',
    read: 'admin',
    fields: new mongoose.Schema({
        type: { type: String },
        date: { type: Date },
        params: { type: Object, default: {} },
        attachment: { type: Array, default: [] },
        status: { type: String, default: 'pending' },

        user: { type: mongoose.Schema.Types.ObjectId, ref: 'user' },
        gathering: { type: mongoose.Schema.Types.ObjectId, ref: 'gathering' },
    }, { timestamps: true })
}

Mail.fields.pre('find', function () {
    this.populate('user')
    this.populate({
        path : 'gathering',
        populate : {
            path : 'cover'
        }
    })
})

Mail.model = global.Mail ? global.Mail.model : mongoose.model('mail', Mail.fields)
global.Mail = Mail

module.exports = Mail