

const SendinBlue = require('sib-api-v3-sdk')
const { ErrorModel } = require('sib-api-v3-sdk')
let apiKey = SendinBlue.ApiClient.instance.authentications['api-key']
apiKey.apiKey = process.env.SENDINBLUE

const Entities = require('../entities')

exports.createMail = function (params) {
    return new Promise(async (resolve, reject) => {
        try {
            let search = {
                $and: [
                    { type: params.type }
                ]
            }
    
            if (params.user) search.$and.push({ user: params.user })
            if (params.gathering) search.$and.push({ gathering: params.gathering })

            let mail = await Entities.mail.model.findOne(search)
            
            if (mail) throw Error(mail.status == 'sent' ? 'mail-already-sent' : 'mail-already-queued')

            let query = {
                type: params.type
            }

            if (params.gathering) query.gathering = params.gathering
            if (params.user) query.user = params.user
            if (params.attachment) query.attachment = params.attachment
            if (params.params) query.params = params.params
            if (params.date) query.date = params.date.toDate()

            mail = await Entities.mail.model.create({
                ...query,
                status: 'pending'
            })

            resolve(true)
        } catch (e) {
            console.error(e)
            reject(e)
        }
    })
}

exports.sendMail = function (user, params) {
    return new Promise(async (resolve, reject) => {
        try {
            const EmailsApi = new SendinBlue.TransactionalEmailsApi()
            let email = new SendinBlue.SendSmtpEmail()

            email.templateId = params.template
            email.to = [{ email: user.email }]
            if (params.attachment) email.attachment = params.attachment
            email.params = params.params
            
            const response = await EmailsApi.sendTransacEmail(email)

            resolve(true)
        } catch (e) {
            console.error(e)
            reject(e)
        }
    })
}

exports.sendBulkMail = function (messages, params) {
    return new Promise(async (resolve, reject) => {
        try {
            const EmailsApi = new SendinBlue.TransactionalEmailsApi()
            let email = new SendinBlue.SendSmtpEmail()

            email.templateId = params.template
            email.params = params.params
            if (params.attachment) email.attachment = params.attachment

            email.messageVersions = messages

            const response = await EmailsApi.sendTransacEmail(email)

            resolve(true)
        } catch (e) {
            console.error(e)
            reject(e)
        }
    })
}