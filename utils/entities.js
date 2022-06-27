const Entity = require('../entities/entity')
const EntityType = require('../entities/entity-type')
const Field = require('../entities/field')
const FieldType = require('../entities/field-type')

exports.createEntity = async function (params) {
    return new Promise(async (resolve, reject) => {
        try {
            entity = params._id ? await Entity.findById(params._id) : null
            let entityType = entity ? entity.type : await EntityType.findOne({ id: params.type })

            if (!entityType) throw Error('entity-type-no-exist')

            if (!entity) {
                entity = await Entity.create({
                    type: entityType
                })
            }

            let fields = await createFields(params.fields, entity._id, entityType._id)

            entity.fields = fields
            entity.save()

            resolve(entity)
        } catch (e) {
            console.error(e)
            reject(e)
        }
    })
}

const createFields = async function (fields, entityId, entityTypeId) {
    return new Promise(async resolve => {
        let result = await Promise.all(Object.keys(fields).map(async id => {
            let fieldType = await FieldType.findOne({ id: id, entity: entityTypeId })
            
            if (fieldType) {
                let field = await Field.findOne({ type: fieldType._id, entity: entityId })

                if (!field) {
                    field = await Field.create({
                        type: fieldType._id,
                        entity: entityId
                    })
                }

                field.value = JSON.stringify(fields[id])
                field.save()

                return field._id
            }
        }))

        resolve(result)
    })
}