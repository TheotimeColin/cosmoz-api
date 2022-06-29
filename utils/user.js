const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const Entities = require('../entities')

const ROLES = {
    private: 999,
    admin: 99,
    self: 90,
    editor: 50,
    user: 25,
    guest: 10,
    public: 0
}

exports.generatePassword = function (password) {
    return new Promise((resolve, reject) => {
        bcrypt.genSalt(10, function(err, salt) {
            if (err) reject(err)
            
            bcrypt.hash(password, salt, function(err, hash) {
                if (err) reject(err)

                resolve(hash)
            })
        })
    })
}

exports.authenticate = async function (headers) {
    return new Promise(async (resolve, reject) => {
        try {
            let user = null

            if (headers && headers['authorization']) {
                let token = headers['authorization'].split(' ')[1]
                if (!token || token == 'null') {
                    user = null
                } else {
                    user = await jwt.verify(token, process.env.SECRET, (err, decoded) => {
                        return new Promise (async (resolve, reject) => {
                            try {
                                let fetched = false

                                if (err) throw Error('fail-token')
                                
                                fetched = await Entities.user.model.find({ _id: decoded.id }, '-password')

                                resolve(!err && fetched[0] ? fetched[0] : false)
                            } catch (e) {
                                console.error(e)
                                reject(e)
                            }
                        })
                    })
                }
            }

            // if (!user) throw Error('user-not-found')

            resolve(user)
        } catch (e) {
            console.warn(e)
            reject(null)
        }
    })
}

exports.accessCheck = async function (type = 'write', entity, requested = null, user = null, fields = null) {
    return new Promise(async resolve => {
        try {
            let granted = false
            let requester = null
            let owner = null
            let userRole = null
            let requiredRole = entity[type]
            
            if (requiredRole.slice(0, 2) == 'g-') {
                if ((!requested && !fields.constellation) || !user) granted = false

                if (user && user.role == 'admin') {
                    granted = true
                } else {
                    let conste = await Entities.constellation.model.findOne({ _id: requested ? (requested.constellation ? requested.constellation : requested._id) : fields.constellation })

                    if (conste) {
                        let allowed = conste.admins

                        if (requiredRole == 'g-organizer' || requiredRole == 'g-member' || requiredRole == 'g-follower') allowed = [...allowed, ...conste.organizers]

                        if (requiredRole == 'g-member' || requiredRole == 'g-follower') allowed = [...allowed, ...conste.members]

                        if (requiredRole == 'g-follower') allowed = [...allowed, ...conste.followers]

                        granted = allowed.find(u => user._id.equals(u)) ? true : false
                    } else {
                        granted = false
                    }
                }
            } else if (entity[type] == 'self') {
                owner = requested ? requested.owner : null
                requester = user ? user._id : null

                granted = requester && owner && owner.equals(requester)
            } else {
                userRole = user ? ROLES[user.role] : 0
                requiredRole = ROLES[entity[type]]

                granted = userRole >= requiredRole
            }

            if (!granted) {
                // console.warn(`access-${type}-denied`)
                // console.log(entity.model)
                
                if (entity[type] == 'self') {
                    // console.log('requester : ' + requester + ' | owner : ' + owner)
                } else {
                    // console.log('required : ' + entity[type] + ' | user : ' + (user ? user.role : 'none'))
                }
            }

            resolve(granted)
        } catch (e) {
            console.error(e)
            resolve(false)
        }
    })
}

const fieldsCheck = function (type = 'write', data = {}, entity, requested = null, user = null) {
    return new Promise(async (resolve, reject) => {
        let result = { ...data }
        let fields = entity.fields.obj
        let users = null
        let forbidden = []

        if (requested && requested.owner && user) {
            users = await Entities.user.model.find({ _id: {
                $in: [requested.owner, user._id]
            }})
        }
        
        await Promise.all(Object.keys(fields).map(async key => {
            try {
                if (Array.isArray(fields[key]) ? fields[key][0][type] : fields[key][type]) {
                    let granted = false
                    let isEncountered = false
                    let isFriend = false
                    let isSelf = false

                    let requiredRole = (Array.isArray(fields[key]) ? fields[key][0][type] : fields[key][type]) || 'public'

                    if (users && user && requested && requested.owner) {
                        let owner = users.find(u => u._id.equals(user._id))
                        let requester = users.find(u => u._id.equals(requested.owner))
                    
                        if (owner && requester) {
                            isSelf = owner._id.equals(requester._id)

                            isFriend = owner['friends'].find(u => u._id.equals(requester._id)) && requester['friends'].find(u => u._id.equals(owner._id))

                            isEncountered = owner['encounters'].find(u => u._id.equals(requester._id)) && requester['encounters'].find(u => u._id.equals(owner._id))
                        }
                    }

                    if (requiredRole == '$read') {
                        requiredRole = result['read'] ? result['read'] : 'public'
                    }
                    
                    if (requiredRole.slice(0, 2) == 'g-') {
                        let constellation = requested.admins ? requested._id : requested.constellation

                        if (!constellation || !user) {
                            granted = false
                        } else if (user.role == 'admin') {
                            granted = true
                        } else {
                            let conste = await Entities.constellation.model.findOne({ _id: constellation })
                            
                            if (conste) {
                                let allowed = conste.admins

                                if (requiredRole == 'g-organizer' || requiredRole == 'g-member' || requiredRole == 'g-follower') allowed = [...allowed, ...conste.organizers]

                                if (requiredRole == 'g-member' || requiredRole == 'g-follower') allowed = [...allowed, ...conste.members]

                                if (requiredRole == 'g-follower') allowed = [...allowed, ...conste.followers]

                                granted = allowed.find(u => user._id.equals(u)) ? true : false
                            } else {
                                granted = false
                            }
                        }
                    } else if (requiredRole == 'self') {
                        if (isSelf || (user && user.role == 'admin')) granted = true
                    } else if (requiredRole == '$user') {
                        result[key] = await fieldsCheck('read', result[key]._doc, Entities.user, result[key], user)

                        granted = true
                    } else if (requiredRole == 'friends') {
                        if (isFriend || isSelf) granted = true
                    } else if (requiredRole == 'encountered') {
                        if (isEncountered || isFriend || isSelf) granted = true
                    } else if (requiredRole == '$readEach') {
                        result[key] = result[key].map(r => {
                            if (r.read && r.read == 'friend') {
                                return isFriend ? r : { ...r, value: 'REDACTED' }
                            } else if (r.read && r.read == 'encountered') {
                                return isEncountered ? r : { ...r, value: 'REDACTED' }
                            } else {
                                return r
                            }
                        })

                        granted = true
                    } else if (requiredRole == '$status') {
                        let origin = requested

                        if (!user) {
                            granted = false
                        } else {
                            if (requested.origin) {
                                origin = await Entities.status.model.findOne({ _id: requested.origin })
                            }

                            isFriend = user['friends'].find(u => u._id.equals(origin.owner))

                            if (origin.gathering) {
                                granted = user ? true : false
                            } else if (origin.constellation) {
                                let conste = await Entities.constellation.model.findOne({ _id: origin.constellation })

                                if (!conste) granted = false

                                granted = [...conste.members, ...conste.admins, ...conste.organizers].find(u => user._id.equals(u)) ? true : false
                            } else {
                                if (isFriend || isSelf) granted = true
                            }
                        }
                    } else {
                        granted = (user ? ROLES[user.role] : 0) >= ROLES[requiredRole]
                    }

                    if (fields[key]['replace']) {
                        let replace = fields[key]['replace']
                        let targetField = Object.keys(replace)[0]

                        result[key] = user && requested && data[targetField] && data[targetField].includes(user._id) && user[targetField].includes(requested.owner)
                    }

                    if (fields[key].fallback) {
                        let fallback = Object.entries(fields[key].fallback)[0]

                        if (fallback[1] == 'encountered' && result[fallback[0]] && !isEncountered && !isSelf) {
                            result[key] = result[fallback[0]]
                        }

                        granted = true
                    }
                    
                    if (!granted) {
                        forbidden = [ ...forbidden, key ]

                        // console.warn(key + ' not granted')
                        delete result[key]
                    }
                }

                return true
            } catch (e) {
                console.error(e)
                return false
            }
        }))

        result.forbidden = forbidden

        resolve(result)
    })
}

exports.fieldsCheck = fieldsCheck