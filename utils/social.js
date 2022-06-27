const jwt = require('jsonwebtoken')
const { $fetch } = require('ohmyfetch/node')
const Entities = require('../entities')
const moment = require('moment-timezone')
moment.tz.setDefault('Europe/Paris')
const { createNotification } = require('../utils/notifications')

exports.requestFriend = async function (requester, target) {
    return new Promise(async (resolve, reject) => {
        let match = false

        try {
            if (!requester.affinities.find(u => target._id.equals(u))) {
                requester.affinities = [
                    ...requester.affinities, target._id
                ]
            }

            if (target.affinities.find(u => requester._id.equals(u))) {
                match = true
                
                if (!requester.friends.find(u => target._id.equals(u))) {
                    requester.friends = [
                        ...requester.friends, target._id
                    ]
                }

                if (!target.friends.find(u => requester._id.equals(u))) {
                    target.friends = [
                        ...target.friends, requester._id
                    ]
                }

                try {
                    let notification = await createNotification({
                        type: 'friends-new',
                        user: requester._id,
                        owner: target._id
                    })

                    if (!notification) throw Error('notif-failed')
                } catch (e) {
                    console.error(e)
                }
            }

            await requester.save()
            await target.save()

            resolve(match)
        } catch (e) {
            console.error(e)
            reject(match)
        }
    })
}