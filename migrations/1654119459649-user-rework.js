const { user } = require('../api/entities/index')

 async function up () {
  try {
    let users = await user.model.find()

    await Promise.all(users.map(async user => {
      
      user.set('attended', undefined, { strict: false })
      user.set('booked', undefined, { strict: false })
      user.set('shops', undefined, { strict: false })
      user.set('advices', undefined, { strict: false })
      user.friends = user.constellation ? user.constellation : []
      user.set('constellation', undefined, { strict: false })
      user.set('followed', undefined, { strict: false })

      await user.save()
      return user
    }))
  } catch (e) {
    return false
  }
}
/**
 * Make any changes that UNDO the up function side effects here (if possible)
 */
async function down () {
  // Write migration here
}

module.exports = { up, down };
